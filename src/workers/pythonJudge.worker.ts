import type { PyodideInterface } from 'pyodide'
import type { PyProxy } from 'pyodide/ffi'
import type { JsonValue } from '../types/learning'
import {
  PYTHON_JUDGE_CAPS,
  comparePythonJson,
  utf8ByteLength,
} from '../lib/pythonJudgeHarness'
import {
  PYTHON_JUDGE_PROTOCOL_VERSION,
  createPythonJudgeErrorResponse,
  type PythonJudgeCaseResult,
  type PythonJudgeError,
  type PythonJudgeErrorCategory,
  type PythonJudgeRequest,
  type PythonJudgeResponse,
  type PythonJudgeRunRequest,
  type PythonJudgeRunResult,
  validatePythonJudgeRequest,
} from './pythonJudgeProtocol'

type WorkerMessageEvent = { data: unknown }
type JudgeWorkerScope = {
  location: Location
  addEventListener(
    type: 'message',
    listener: (event: WorkerMessageEvent) => void,
  ): void
  postMessage(message: PythonJudgeResponse): void
}

type PythonObservedCase =
  | { id: string; ok: true; actual: JsonValue }
  | {
      id: string
      ok: false
      error: { category: string; message: string }
    }

type PythonHarnessPayload = {
  fatal?: { category: string; message: string }
  cases: PythonObservedCase[]
}

const scope = globalThis as unknown as JudgeWorkerScope

const SAFE_PYTHON_ERROR_CATEGORIES = new Set<PythonJudgeErrorCategory>([
  'syntax',
  'import',
  'entrypoint',
  'runtime',
  'resultEncoding',
])

const PYTHON_HARNESS = String.raw`
import builtins as _judge_builtins
import json as _judge_json

_JUDGE_ALLOWED_IMPORTS = frozenset({
    "array", "bisect", "collections", "copy", "dataclasses", "decimal",
    "enum", "fractions", "functools", "heapq", "itertools", "json",
    "math", "operator", "random", "re", "statistics", "string", "typing",
})
_judge_original_import = _judge_builtins.__import__

def _judge_safe_import(name, globals=None, locals=None, fromlist=(), level=0):
    if level != 0:
        raise ImportError("Relative imports are not allowed in the browser judge")
    root = name.partition(".")[0]
    if root not in _JUDGE_ALLOWED_IMPORTS:
        raise ImportError(
            f"Import '{root}' is not in the browser judge standard-library allowlist"
        )
    return _judge_original_import(name, globals, locals, fromlist, level)

_judge_safe_builtins = dict(vars(_judge_builtins))
_judge_safe_builtins["__import__"] = _judge_safe_import
for _judge_blocked_builtin in ("open", "input", "breakpoint", "help"):
    _judge_safe_builtins.pop(_judge_blocked_builtin, None)

class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

class GraphNode:
    def __init__(self, val=0, neighbors=None):
        self.val = val
        self.neighbors = [] if neighbors is None else neighbors

class _JudgeEncodingError(Exception):
    pass

class _JudgeBudget:
    def __init__(self, remaining):
        self.remaining = remaining
        self.items = 0

    def charge(self, amount=1):
        self.remaining -= amount
        self.items += 1
        if self.remaining < 0:
            raise _JudgeEncodingError("Result exceeds the serialized byte cap")
        if self.items > 4096:
            raise _JudgeEncodingError("Result contains too many values")

def _judge_message(error):
    message = str(error)
    name = type(error).__name__
    # SyntaxError text already reads naturally ("'(' was never closed …");
    # runtime errors need the exception type or a bare KeyError renders as
    # just the missing key (e.g. "Your code raised an error: 0").
    if isinstance(error, SyntaxError):
        return message[:1000] if message else name
    if not message:
        return name
    return f"{name}: {message}"[:1000]

def _judge_error(category, error):
    return {"category": category, "message": _judge_message(error)}

def _judge_decode(codec, value):
    kind = codec["kind"]
    if kind in ("json", "integer", "float", "string", "boolean"):
        return value
    if kind == "list":
        return [_judge_decode(codec["item"], item) for item in value]
    if kind == "tuple":
        return tuple(
            _judge_decode(item_codec, item)
            for item_codec, item in zip(codec["items"], value, strict=True)
        )
    if kind == "linkedList":
        dummy = ListNode()
        tail = dummy
        for item in value:
            tail.next = ListNode(_judge_decode(codec["item"], item))
            tail = tail.next
        return dummy.next
    if kind == "binaryTree":
        if not value or value[0] is None:
            return None
        root = TreeNode(_judge_decode(codec["item"], value[0]))
        queue = [root]
        value_index = 1
        queue_index = 0
        while queue_index < len(queue) and value_index < len(value):
            node = queue[queue_index]
            queue_index += 1
            if value_index < len(value):
                left_value = value[value_index]
                value_index += 1
                if left_value is not None:
                    node.left = TreeNode(_judge_decode(codec["item"], left_value))
                    queue.append(node.left)
            if value_index < len(value):
                right_value = value[value_index]
                value_index += 1
                if right_value is not None:
                    node.right = TreeNode(_judge_decode(codec["item"], right_value))
                    queue.append(node.right)
        return root
    if kind == "graph":
        nodes = [
            GraphNode(_judge_decode(codec["item"], item))
            for item in value["values"]
        ]
        for start, end in value["edges"]:
            nodes[start].neighbors.append(nodes[end])
            if not codec["directed"] and start != end:
                nodes[end].neighbors.append(nodes[start])
        root_index = value.get("root", 0 if nodes else None)
        return None if root_index is None else nodes[root_index]
    raise ValueError(f"Unknown codec kind: {kind}")

def _judge_encode_json(value, budget, seen, depth):
    if depth > 64:
        raise _JudgeEncodingError("Result is nested too deeply")
    if value is None or isinstance(value, bool):
        budget.charge(4)
        return value
    if isinstance(value, int) and not isinstance(value, bool):
        budget.charge(len(str(value)))
        return value
    if isinstance(value, float):
        if value != value or value in (float("inf"), float("-inf")):
            raise _JudgeEncodingError("Result contains a non-finite number")
        budget.charge(len(repr(value)))
        return value
    if isinstance(value, str):
        if len(value) > budget.remaining:
            raise _JudgeEncodingError("Result string exceeds the byte cap")
        budget.charge(len(value.encode("utf-8")))
        return value
    object_id = id(value)
    if object_id in seen:
        raise _JudgeEncodingError("Result contains a cycle")
    if isinstance(value, (list, tuple)):
        seen.add(object_id)
        budget.charge(2)
        result = [
            _judge_encode_json(item, budget, seen, depth + 1)
            for item in value
        ]
        seen.remove(object_id)
        return result
    if isinstance(value, dict):
        seen.add(object_id)
        budget.charge(2)
        result = {}
        for key, item in value.items():
            if not isinstance(key, str):
                raise _JudgeEncodingError("JSON result objects require string keys")
            if len(key) > budget.remaining:
                raise _JudgeEncodingError("Result key exceeds the byte cap")
            budget.charge(len(key.encode("utf-8")))
            result[key] = _judge_encode_json(item, budget, seen, depth + 1)
        seen.remove(object_id)
        return result
    raise _JudgeEncodingError(
        f"Value of type {type(value).__name__} is not JSON serializable"
    )

def _judge_encode(codec, value, budget):
    kind = codec["kind"]
    if kind == "json":
        return _judge_encode_json(value, budget, set(), 0)
    if kind == "integer":
        if not isinstance(value, int) or isinstance(value, bool):
            raise _JudgeEncodingError("Expected an integer result")
        budget.charge(len(str(value)))
        return value
    if kind == "float":
        if (
            not isinstance(value, (int, float))
            or isinstance(value, bool)
            or value != value
            or value in (float("inf"), float("-inf"))
        ):
            raise _JudgeEncodingError("Expected a finite numeric result")
        budget.charge(len(repr(value)))
        return value
    if kind == "string":
        if not isinstance(value, str):
            raise _JudgeEncodingError("Expected a string result")
        if len(value) > budget.remaining:
            raise _JudgeEncodingError("Result string exceeds the byte cap")
        budget.charge(len(value.encode("utf-8")))
        return value
    if kind == "boolean":
        if not isinstance(value, bool):
            raise _JudgeEncodingError("Expected a boolean result")
        budget.charge(5)
        return value
    if kind == "list":
        if not isinstance(value, (list, tuple)):
            raise _JudgeEncodingError("Expected a list result")
        budget.charge(2)
        return [_judge_encode(codec["item"], item, budget) for item in value]
    if kind == "tuple":
        if not isinstance(value, (list, tuple)) or len(value) != len(codec["items"]):
            raise _JudgeEncodingError("Expected a tuple result of the configured length")
        budget.charge(2)
        return [
            _judge_encode(item_codec, item, budget)
            for item_codec, item in zip(codec["items"], value, strict=True)
        ]
    if kind == "linkedList":
        result = []
        seen = set()
        node = value
        while node is not None:
            node_id = id(node)
            if node_id in seen:
                raise _JudgeEncodingError("Linked-list result contains a cycle")
            seen.add(node_id)
            budget.charge(2)
            if not hasattr(node, "val") or not hasattr(node, "next"):
                raise _JudgeEncodingError("Linked-list nodes require val and next")
            result.append(_judge_encode(codec["item"], node.val, budget))
            node = node.next
        return result
    if kind == "binaryTree":
        if value is None:
            return []
        result = []
        queue = [value]
        queue_index = 0
        seen = set()
        while queue_index < len(queue):
            node = queue[queue_index]
            queue_index += 1
            if node is None:
                result.append(None)
                budget.charge(4)
                continue
            node_id = id(node)
            if node_id in seen:
                raise _JudgeEncodingError("Binary-tree result contains a cycle")
            seen.add(node_id)
            if not all(hasattr(node, field) for field in ("val", "left", "right")):
                raise _JudgeEncodingError(
                    "Binary-tree nodes require val, left, and right"
                )
            result.append(_judge_encode(codec["item"], node.val, budget))
            queue.extend((node.left, node.right))
            budget.charge(2)
        while result and result[-1] is None:
            result.pop()
        return result
    if kind == "graph":
        if value is None:
            return {"values": [], "edges": [], "root": None}
        nodes = [value]
        node_indices = {id(value): 0}
        edges = []
        node_index = 0
        while node_index < len(nodes):
            node = nodes[node_index]
            if not hasattr(node, "val") or not hasattr(node, "neighbors"):
                raise _JudgeEncodingError(
                    "Graph nodes require val and neighbors"
                )
            for neighbor in node.neighbors:
                neighbor_id = id(neighbor)
                if neighbor_id not in node_indices:
                    if len(nodes) >= 4096:
                        raise _JudgeEncodingError("Graph result has too many nodes")
                    node_indices[neighbor_id] = len(nodes)
                    nodes.append(neighbor)
                end_index = node_indices[neighbor_id]
                if codec["directed"]:
                    edges.append([node_index, end_index])
                else:
                    edge = [min(node_index, end_index), max(node_index, end_index)]
                    if edge not in edges:
                        edges.append(edge)
            node_index += 1
        budget.charge(4 * (len(nodes) + len(edges)))
        edges.sort()
        return {
            "values": [
                _judge_encode(codec["item"], node.val, budget) for node in nodes
            ],
            "edges": edges,
            "root": 0,
        }
    raise _JudgeEncodingError(f"Unknown codec kind: {kind}")

def _judge_observe(plan, actual, arguments):
    observation = plan.get("observation", {"kind": "return"})
    if observation["kind"] == "return":
        return actual, plan["codecs"]["result"]
    observed = arguments[observation["argumentIndex"]]
    for segment in observation.get("path", []):
        if isinstance(segment, int):
            observed = observed[segment]
        elif isinstance(observed, dict):
            observed = observed[segment]
        else:
            observed = getattr(observed, segment)
    return observed, observation["codec"]

def _judge_main():
    plan = _judge_json.loads(__judge_plan_json)
    submission_globals = {
        "__builtins__": _judge_safe_builtins,
        "__name__": "__browser_judge_submission__",
        "ListNode": ListNode,
        "TreeNode": TreeNode,
        "GraphNode": GraphNode,
    }
    try:
        compiled = compile(__judge_source, "<submission>", "exec")
    except SyntaxError as error:
        return _judge_json.dumps({
            "fatal": _judge_error("syntax", error),
            "cases": [],
        }, allow_nan=False)

    try:
        exec(compiled, submission_globals, submission_globals)
    except ImportError as error:
        return _judge_json.dumps({
            "fatal": _judge_error("import", error),
            "cases": [],
        }, allow_nan=False)
    except BaseException as error:
        return _judge_json.dumps({
            "fatal": _judge_error("runtime", error),
            "cases": [],
        }, allow_nan=False)

    entrypoint = plan["entrypoint"]
    if entrypoint["kind"] == "function":
        target = submission_globals.get(entrypoint["name"])
        if not callable(target):
            return _judge_json.dumps({
                "fatal": {
                    "category": "entrypoint",
                    "message": f"Function '{entrypoint['name']}' was not defined",
                },
                "cases": [],
            }, allow_nan=False)
        target_class = None
    else:
        target_class = submission_globals.get(entrypoint["className"])
        if not callable(target_class):
            return _judge_json.dumps({
                "fatal": {
                    "category": "entrypoint",
                    "message": f"Class '{entrypoint['className']}' was not defined",
                },
                "cases": [],
            }, allow_nan=False)
        target = None

    observed_cases = []
    result_budget = _JudgeBudget(__judge_max_result_bytes)
    for test_case in plan["cases"]:
        try:
            arguments = [
                _judge_decode(codec, value)
                for codec, value in zip(
                    plan["codecs"]["arguments"],
                    test_case["arguments"],
                    strict=True,
                )
            ]
        except BaseException as error:
            return _judge_json.dumps({
                "fatal": _judge_error("internal", error),
                "cases": observed_cases,
            }, allow_nan=False)

        try:
            if target_class is not None:
                instance = target_class(*entrypoint.get("constructorArguments", []))
                callable_target = getattr(instance, entrypoint["methodName"], None)
                if not callable(callable_target):
                    observed_cases.append({
                        "id": test_case["id"],
                        "ok": False,
                        "error": {
                            "category": "entrypoint",
                            "message": (
                                f"Method '{entrypoint['methodName']}' was not defined"
                            ),
                        },
                    })
                    continue
            else:
                callable_target = target
            actual = callable_target(*arguments)
        except ImportError as error:
            observed_cases.append({
                "id": test_case["id"],
                "ok": False,
                "error": _judge_error("import", error),
            })
            continue
        except BaseException as error:
            observed_cases.append({
                "id": test_case["id"],
                "ok": False,
                "error": _judge_error("runtime", error),
            })
            continue

        try:
            observed_value, observed_codec = _judge_observe(
                plan,
                actual,
                arguments,
            )
            encoded = _judge_encode(
                observed_codec,
                observed_value,
                result_budget,
            )
        except _JudgeEncodingError as error:
            observed_cases.append({
                "id": test_case["id"],
                "ok": False,
                "error": _judge_error("resultEncoding", error),
            })
            continue
        except BaseException as error:
            observed_cases.append({
                "id": test_case["id"],
                "ok": False,
                "error": _judge_error("runtime", error),
            })
            continue
        observed_cases.append({
            "id": test_case["id"],
            "ok": True,
            "actual": encoded,
        })

    return _judge_json.dumps(
        {"cases": observed_cases},
        allow_nan=False,
        separators=(",", ":"),
    )

_judge_main()
`

let pyodidePromise: Promise<PyodideInterface> | null = null
let messageQueue = Promise.resolve()

function safeMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error)
  return (message && message !== '[object Object]' ? message : fallback).slice(
    0,
    750,
  )
}

function runtimeAssetBaseUrl(): string {
  const basePath = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`
  return new URL(`${basePath}pyodide/`, scope.location.origin).href
}

async function loadRuntime(): Promise<PyodideInterface> {
  const { loadPyodide } = await import('pyodide')
  return loadPyodide({
    indexURL: runtimeAssetBaseUrl(),
    packages: [],
    jsglobals: Object.freeze({}),
    stdout: () => undefined,
    stderr: () => undefined,
  })
}

function ensureRuntime(): Promise<PyodideInterface> {
  pyodidePromise ??= loadRuntime().catch((error: unknown) => {
    pyodidePromise = null
    throw error
  })
  return pyodidePromise
}

function destroyProxy(value: unknown): void {
  if (
    typeof value === 'object' &&
    value !== null &&
    'destroy' in value &&
    typeof value.destroy === 'function'
  ) {
    value.destroy()
  }
}

function normalizedCategory(category: string): PythonJudgeErrorCategory {
  return SAFE_PYTHON_ERROR_CATEGORIES.has(
    category as PythonJudgeErrorCategory,
  )
    ? (category as PythonJudgeErrorCategory)
    : 'internal'
}

function pythonError(
  category: string,
  message: string,
  caseId?: PythonJudgeError['caseId'],
): PythonJudgeError {
  return {
    category: normalizedCategory(category),
    message: message.slice(0, 750),
    ...(caseId ? { caseId } : {}),
  }
}

function emptyErrorResult(
  request: PythonJudgeRunRequest,
  error: PythonJudgeError,
  durationMs: number,
  stdout = '',
  stderr = '',
): PythonJudgeRunResult {
  return {
    status: 'error',
    assessmentId: request.plan.id,
    cases: [],
    passedCases: 0,
    totalCases: request.plan.cases.length,
    stdout,
    stderr,
    durationMs,
    memoryLimitEnforced: false,
    error,
  }
}

async function executeRun(
  pyodide: PyodideInterface,
  request: PythonJudgeRunRequest,
): Promise<PythonJudgeRunResult> {
  const startedAt = performance.now()
  const stdout: string[] = []
  const stderr: string[] = []
  let capturedBytes = 0
  let outputExceeded = false
  const capture = (target: string[]) => (charCode: number) => {
    const character = String.fromCodePoint(charCode)
    const characterBytes = utf8ByteLength(character)
    if (
      capturedBytes + characterBytes <=
      request.plan.limits.maxOutputBytes
    ) {
      target.push(character)
      capturedBytes += characterBytes
    } else {
      outputExceeded = true
    }
  }

  pyodide.setStdout({ raw: capture(stdout) })
  pyodide.setStderr({ raw: capture(stderr) })

  const globals = pyodide.toPy({}) as PyProxy
  let rawPayload: unknown
  try {
    globals.set('__judge_source', request.response.code)
    globals.set('__judge_plan_json', JSON.stringify(request.plan))
    globals.set('__judge_max_result_bytes', PYTHON_JUDGE_CAPS.maxResultBytes)
    rawPayload = await pyodide.runPythonAsync(PYTHON_HARNESS, {
      globals,
      filename: '<browser-judge>',
    })
  } finally {
    pyodide.setStdout({ raw: () => undefined })
    pyodide.setStderr({ raw: () => undefined })
    globals.destroy()
  }

  const durationMs = performance.now() - startedAt
  const capturedStdout = stdout.join('')
  const capturedStderr = stderr.join('')
  if (typeof rawPayload !== 'string') {
    destroyProxy(rawPayload)
    return emptyErrorResult(
      request,
      {
        category: 'internal',
        message: 'Python harness returned an unexpected value',
      },
      durationMs,
      capturedStdout,
      capturedStderr,
    )
  }
  if (utf8ByteLength(rawPayload) > PYTHON_JUDGE_CAPS.maxResultBytes) {
    return emptyErrorResult(
      request,
      {
        category: 'resultEncoding',
        message: 'Encoded test results exceed the result byte cap',
      },
      durationMs,
      capturedStdout,
      capturedStderr,
    )
  }

  let payload: PythonHarnessPayload
  try {
    payload = JSON.parse(rawPayload) as PythonHarnessPayload
  } catch {
    return emptyErrorResult(
      request,
      {
        category: 'internal',
        message: 'Python harness returned malformed JSON',
      },
      durationMs,
      capturedStdout,
      capturedStderr,
    )
  }

  if (outputExceeded) {
    return emptyErrorResult(
      request,
      {
        category: 'outputLimit',
        message: `Program output exceeded ${request.plan.limits.maxOutputBytes} bytes`,
      },
      durationMs,
      capturedStdout,
      capturedStderr,
    )
  }
  if (payload.fatal) {
    return emptyErrorResult(
      request,
      pythonError(payload.fatal.category, payload.fatal.message),
      durationMs,
      capturedStdout,
      capturedStderr,
    )
  }
  if (
    !Array.isArray(payload.cases) ||
    payload.cases.length !== request.plan.cases.length
  ) {
    return emptyErrorResult(
      request,
      {
        category: 'internal',
        message: 'Python harness returned an incomplete case set',
      },
      durationMs,
      capturedStdout,
      capturedStderr,
    )
  }

  let topLevelError: PythonJudgeError | undefined
  const cases: PythonJudgeCaseResult[] = []
  for (let index = 0; index < request.plan.cases.length; index += 1) {
    const testCase = request.plan.cases[index]
    const observed = payload.cases[index]
    if (!observed || observed.id !== testCase.id) {
      return emptyErrorResult(
        request,
        {
          category: 'internal',
          message: 'Python harness returned mismatched case identifiers',
        },
        durationMs,
        capturedStdout,
        capturedStderr,
      )
    }

    if (observed.ok) {
      const passed = comparePythonJson(
        observed.actual,
        testCase.expected,
        request.plan.comparator,
        testCase.arguments,
      )
      cases.push({
        caseId: testCase.id,
        visibility: testCase.visibility,
        passed,
        ...(testCase.visibility === 'example'
          ? {
              actual: observed.actual,
              expected: testCase.expected,
            }
          : {}),
      })
      continue
    }

    const fullError = pythonError(
      observed.error.category,
      observed.error.message,
      testCase.id,
    )
    topLevelError ??= fullError
    cases.push({
      caseId: testCase.id,
      visibility: testCase.visibility,
      passed: false,
      error:
        testCase.visibility === 'hidden'
          ? {
              category: fullError.category,
              message: 'A hidden test could not complete',
              caseId: testCase.id,
            }
          : fullError,
    })
  }

  const passedCases = cases.filter(({ passed }) => passed).length
  return {
    status: topLevelError
      ? 'error'
      : passedCases === cases.length
        ? 'passed'
        : 'failed',
    assessmentId: request.plan.id,
    cases,
    passedCases,
    totalCases: cases.length,
    stdout: capturedStdout,
    stderr: capturedStderr,
    durationMs,
    memoryLimitEnforced: false,
    ...(topLevelError ? { error: topLevelError } : {}),
  }
}

function post(message: PythonJudgeResponse): void {
  scope.postMessage(message)
}

async function handleRequest(request: PythonJudgeRequest): Promise<void> {
  if (request.type === 'initialize') {
    try {
      await ensureRuntime()
      post({
        protocolVersion: PYTHON_JUDGE_PROTOCOL_VERSION,
        requestId: request.requestId,
        nonce: request.nonce,
        type: 'initialized',
      })
    } catch (error) {
      post(
        createPythonJudgeErrorResponse(request, 'initialize', {
          category: 'initialization',
          message: safeMessage(error, 'Failed to initialize Python'),
        }),
      )
    }
    return
  }

  try {
    const pyodide = await ensureRuntime()
    const result = await executeRun(pyodide, request)
    post({
      protocolVersion: PYTHON_JUDGE_PROTOCOL_VERSION,
      requestId: request.requestId,
      nonce: request.nonce,
      type: 'runResult',
      result,
    })
  } catch (error) {
    post(
      createPythonJudgeErrorResponse(request, 'run', {
        category: 'internal',
        message: safeMessage(error, 'Python judge failed unexpectedly'),
      }),
    )
  }
}

function recoverableEnvelope(
  value: unknown,
): { requestId: string; nonce: string } | null {
  if (typeof value !== 'object' || value === null) return null
  const candidate = value as { requestId?: unknown; nonce?: unknown }
  return typeof candidate.requestId === 'string' &&
    candidate.requestId.length <= 128 &&
    typeof candidate.nonce === 'string' &&
    candidate.nonce.length <= 128
    ? { requestId: candidate.requestId, nonce: candidate.nonce }
    : null
}

scope.addEventListener('message', (event) => {
  const validation = validatePythonJudgeRequest(event.data)
  if (!validation.valid) {
    const envelope = recoverableEnvelope(event.data)
    if (envelope) {
      post(
        createPythonJudgeErrorResponse(envelope, 'protocol', {
          category: 'protocol',
          message: validation.error.slice(0, 750),
        }),
      )
    }
    return
  }
  messageQueue = messageQueue
    .then(() => handleRequest(validation.value))
    .catch(() => undefined)
})
