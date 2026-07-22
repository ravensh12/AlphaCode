import { createProblemMission } from '../../problemMissionFactory'
import type { ProblemMissionSeed } from '../../problemMissionSeed'

export const designTwitterMissionSeed = {
  slug: 'design-twitter',
  estimatedMinutes: 34,
  mission: {
    title: 'Build the Comet Club Feed',
    context:
      'Members of a space club post numbered updates, follow other members, and ask for their ten newest visible posts. A member always sees their own posts too.',
    prompt:
      'Process post, follow, unfollow, and feed events; return one newest-first post-id list for each feed request.',
  },
  objective:
    'Store per-user post timelines and merge the newest entries from followed timelines with a max-heap.',
  priorKnowledge: [
    'A timestamp can order posts globally.',
    'A heap can merge several already ordered sources without scanning every old post.',
  ],
  recognitionCue:
    'Each query asks for the top few newest items drawn from several users’ separate histories.',
  misconception:
    'Rebuilding and sorting every visible historical post for each feed wastes work far beyond the ten requested items.',
  algorithmSteps: [
    {
      id: 'store-timestamped-post',
      instruction: 'Append each new post with an increasing timestamp to its author’s timeline.',
    },
    {
      id: 'update-follows',
      instruction: 'Maintain each user’s followed-user set, ignoring self follow changes.',
    },
    {
      id: 'seed-feed-heap',
      instruction: 'For a feed, push the newest post from self and every followed timeline.',
    },
    {
      id: 'take-newest',
      instruction: 'Pop the newest entry, add its post id, and push the prior post from that same timeline.',
    },
    {
      id: 'stop-at-ten',
      instruction: 'Stop when ten posts are collected or the heap is empty.',
    },
  ],
  complexity: {
    time: 'O(f log f + 10 log f) per feed',
    space: 'O(P + F)',
    explanation:
      'Seeding with one post from each of f visible timelines costs O(f log f) with repeated pushes, followed by at most ten heap pops and replenishments.',
  },
  explanationVisuals: {
    diagram: {
      kind: 'tree',
      variant: 'heap',
      heapKind: 'max',
      values: ['t3:u1#103', 't2:u2#202', 't1:u1#101'],
      highlight: 0,
      pointers: [{ index: 0, label: 'newest visible' }],
    },
  },
  workedExample: {
    prompt:
      'User 1 posts 101, follows user 2, then user 2 posts 202 and user 1 posts 103. The feed merge returns [103, 202, 101].',
    code: [
      'for visible_user in follows[user] | {user}:',
      '    push_that_users_newest_post()',
      'while heap and len(feed) < 10:',
      '    time, post_id, author, index = heappop(heap)',
      '    feed.append(post_id)',
      '    if index > 0: push_same_authors_previous_post()',
    ],
    currentLineIndex: 3,
    walkthrough: [
      'The heap starts with newest post 103 from user 1 and 202 from user 2.',
      'Popping 103 exposes user 1’s previous post 101.',
      'The remaining priorities produce 202 and then 101.',
    ],
  },
  patternCheck: {
    prompt:
      'How can a feed collect the newest ten without sorting every visible post?',
    options: [
      {
        id: 'merge-timeline-heads',
        label: 'Heap the newest post from each timeline and reveal older posts only as needed.',
      },
      {
        id: 'sort-all-history',
        label: 'Copy every post ever written and fully sort it for each request.',
      },
      {
        id: 'one-author-only',
        label: 'Read only the followed user with the greatest user id.',
      },
      {
        id: 'oldest-first',
        label: 'Heap each timeline’s oldest post and walk forward.',
      },
    ],
    correctOptionId: 'merge-timeline-heads',
    feedback: {
      correct:
        'Exactly. Each pop reveals the only next candidate needed from that same ordered source.',
      incorrect:
        'That is wasteful or fails to compare all visible newest posts.',
      secondIncorrect:
        'Treat each user timeline as a sorted stream and perform a k-way merge for ten outputs.',
    },
    hints: ['Only one unchosen post per timeline can be its current best candidate.', 'The output cap is ten.'],
  },
  retrievalCheck: {
    prompt:
      'Whose timeline must always be included in a user’s feed, even without a follow link?',
    acceptedAnswers: [
      'their own',
      'the user',
      'self',
      'their own timeline',
      'the user themselves',
      'themselves',
      'your own',
      'the requesting user',
      'own timeline',
    ],
    placeholder: 'Timeline owner',
    feedback: {
      correct:
        'Right. Club members always see their own updates.',
      incorrect:
        'The feed source set includes follows plus one automatic member.',
      secondIncorrect:
        'Include the requesting user’s own timeline.',
    },
    hints: ['Posting does not require following yourself.', 'Union the follow set with {user}.'],
  },
  reconstructionCheck: {
    prompt:
      'Restore the timeline-and-feed system actions.',
    feedback: {
      correct:
        'Persistent timelines support a small newest-first merge for each request.',
      incorrect:
        'Store events and follow state before seeding and consuming a feed heap.',
      secondIncorrect:
        'Use store post → update follows → seed heap → take newest/replenish → stop at ten.',
    },
    hints: ['Post timestamps must increase.', 'Each feed pop may add one earlier item from the same author.'],
  },
  pythonChallenge: {
    prompt:
      'Write solve(data). Process events with post(user,postId), follow(user,target), unfollow(user,target), and feed(user). Return one newest-first list of at most ten ids per feed event.',
    starterCode: `import heapq
from collections import defaultdict

def solve(data):
    timelines = defaultdict(list)
    follows = defaultdict(set)
    answers = []
    timestamp = 0

    for event in data["events"]:
        op = event["op"]
        # TODO: update posts/follows or build a ten-item merged feed.
        pass

    return answers`,
    cases: {
      visibleExample: {
        input: {
          events: [
            { op: 'post', user: 1, postId: 101 },
            { op: 'feed', user: 1 },
            { op: 'follow', user: 1, target: 2 },
            { op: 'post', user: 2, postId: 202 },
            { op: 'post', user: 1, postId: 103 },
            { op: 'feed', user: 1 },
          ],
        },
        expected: [[101], [103, 202, 101]],
      },
      hiddenBoundary: {
        input: { events: [{ op: 'feed', user: 9 }] },
        expected: [[]],
      },
      hiddenAdversarial: {
        input: {
          events: [
            { op: 'post', user: 1, postId: 5 },
            { op: 'follow', user: 1, target: 2 },
            { op: 'post', user: 2, postId: 6 },
            { op: 'unfollow', user: 1, target: 2 },
            { op: 'feed', user: 1 },
          ],
        },
        expected: [[5]],
      },
      additional: [
        {
          id: 'hidden-ten-item-merge',
          input: {
            events: [
              { op: 'follow', user: 1, target: 2 },
              { op: 'follow', user: 1, target: 3 },
              { op: 'post', user: 1, postId: 101 },
              { op: 'post', user: 2, postId: 201 },
              { op: 'post', user: 3, postId: 301 },
              { op: 'post', user: 1, postId: 102 },
              { op: 'post', user: 2, postId: 202 },
              { op: 'post', user: 3, postId: 302 },
              { op: 'post', user: 1, postId: 103 },
              { op: 'post', user: 2, postId: 203 },
              { op: 'post', user: 3, postId: 303 },
              { op: 'post', user: 1, postId: 104 },
              { op: 'post', user: 2, postId: 204 },
              { op: 'post', user: 3, postId: 304 },
              { op: 'feed', user: 1 },
            ],
          },
          expected: [
            [304, 204, 104, 303, 203, 103, 302, 202, 102, 301],
          ],
          visibility: 'hidden',
        },
      ],
    },
    feedback: {
      correct:
        'Club feeds respect time, follows, unfollows, self posts, and empty histories.',
      incorrect:
        'A source timeline, timestamp order, or unfollow update is wrong.',
      secondIncorrect:
        'Store (time,postId) per author; seed a negative-time heap from self plus follows; after each pop, push that author’s previous index.',
    },
    hints: [
      'Increment timestamp for each post event.',
      'discard(target) handles an unfollow that may not exist.',
      'Ignore follow or unfollow when user equals target.',
    ],
    diagram: {
      kind: 'tree',
      variant: 'heap',
      heapKind: 'max',
      values: ['u1#5'],
      highlight: 0,
      pointers: [{ index: 0, label: 'only visible post' }],
    },
  },
} as const satisfies ProblemMissionSeed

export const problemLesson = createProblemMission(designTwitterMissionSeed)

export default problemLesson
