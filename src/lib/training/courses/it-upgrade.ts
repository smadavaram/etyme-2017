import type { Track } from './types'

/**
 * IT — Upgrade, built first. One placeholder lesson only proves the page
 * shell; the content writers replace it with nine chapters in three levels
 * (a chatbot, then answering from documents, then an agent).
 */
export const IT_UPGRADE: Track = {
  key: 'it-upgrade',
  title: 'IT — Upgrade',
  placeholder: true,
  goodAt: ['Explain what a chatbot does', 'Write a clear request for it'],
  levels: [
    {
      key: 'simple',
      title: 'Simple',
      chapters: [
        {
          key: 'chatbot',
          title: 'A chatbot',
          lessons: [
            {
              key: 'it-1-1-1',
              title: 'Ask, then read the answer',
              intro: 'A chatbot answers what you type. A clear request gets a clearer answer.',
              introduces: ['request'],
              uses: [],
              example: { text: 'Write two sentences that tell a new hire how to book a meeting room.', mono: true },
              tryIt: {
                prompt: 'Write your own request. Say what you want and for whom.',
                starter: 'Write two sentences that ',
                rules: [
                  { kind: 'minWords', value: 6, says: 'It has enough words to say what you want.' },
                  { kind: 'containsAny', values: ['for', 'to a', 'to the'], says: 'It names who the answer is for.' },
                ],
                expected: 'A request that says the task and the reader.',
              },
              exercise: {
                question: 'Which request is clearest?',
                choices: ['Tell me things.', 'List three steps to reset a password, for a new hire.'],
                correctIndex: 1,
                reason: 'It names the task, the size and the reader.',
              },
              video: null,
            },
          ],
        },
      ],
      project: { key: 'it-simple-project', title: 'Your first request', checklist: ['Wrote a request', 'Read the answer', 'Said what to change'] },
    },
  ],
}
