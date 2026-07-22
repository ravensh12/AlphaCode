import { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { python } from '@codemirror/lang-python'
import { indentWithTab } from '@codemirror/commands'
import { indentUnit } from '@codemirror/language'
import { EditorView, keymap } from '@codemirror/view'
import { oneDark } from '@codemirror/theme-one-dark'

/**
 * CodeMirror-backed Python editor for pythonCode assessments. This module is
 * loaded lazily (React.lazy) so the CodeMirror chunk only ships on coding
 * steps — keep every import editor-only.
 */

// Blend the One Dark syntax palette into the app's own code-panel look.
const alphaCodeTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'transparent',
      fontSize: '14.5px',
    },
    '.cm-scroller': {
      fontFamily: "var(--mono, 'JetBrains Mono', ui-monospace, monospace)",
      lineHeight: '1.65',
      padding: '10px 0',
    },
    '.cm-content': {
      caretColor: '#5ef0e0',
    },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: 'rgba(155, 188, 178, 0.55)',
      border: 'none',
      paddingLeft: '6px',
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(94, 240, 224, 0.055)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'transparent',
      color: 'rgba(94, 240, 224, 0.85)',
    },
    '&.cm-focused': {
      outline: 'none',
    },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
      backgroundColor: 'rgba(109, 74, 254, 0.35) !important',
    },
    '.cm-cursor': {
      borderLeftColor: '#5ef0e0',
    },
  },
  { dark: true },
)

export type PythonCodeEditorProps = {
  value: string
  onChange: (code: string) => void
  disabled?: boolean
  ariaLabel: string
  autoFocus?: boolean
}

export default function PythonCodeEditor({
  value,
  onChange,
  disabled = false,
  ariaLabel,
  autoFocus = false,
}: PythonCodeEditorProps) {
  const extensions = useMemo(
    () => [
      python(),
      indentUnit.of('    '),
      keymap.of([indentWithTab]),
      EditorView.lineWrapping,
      alphaCodeTheme,
    ],
    [],
  )

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
      theme={oneDark}
      editable={!disabled}
      readOnly={disabled}
      autoFocus={autoFocus}
      aria-label={ariaLabel}
      basicSetup={{
        lineNumbers: true,
        foldGutter: false,
        highlightActiveLine: true,
        highlightActiveLineGutter: true,
        indentOnInput: true,
        bracketMatching: true,
        closeBrackets: true,
        autocompletion: false,
        searchKeymap: false,
        tabSize: 4,
      }}
    />
  )
}
