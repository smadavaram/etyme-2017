import type { Level } from './types'

/**
 * IT — Upgrade, level 1: Simple (chapters 1 to 3). Who Tapin is and how a
 * consultant's work is changing; the record, a week of hours and the bench
 * as a worker sees them on Etyme; then a first chatbot: the prompt, the
 * model, the reply and its limits.
 *
 * Each chapter closes with one of the three foundational terms, in order
 * (record 133): agent in chapter 1, skill in chapter 2, agentic in chapter
 * 3. None of the three words is said before the lesson that builds it;
 * `foundationGaps` in `./shape` holds every track to that.
 *
 * Every screen described here is read from the code as it stands:
 * `app/site/[slug]` (a firm's public page), `app/dashboard/my-work/page.tsx`
 * (Your work, "File your hours", the stages of a week), `app/api/me/work`
 * (the filing route and its refusals), `app/dashboard/my-benches/page.tsx`
 * (Who has you), `lib/bench-stay` (how long a yes lasts) and
 * `app/api/conversations/twin/worker.ts` (a worker's Ask Etyme: its ready
 * questions, its sentences, and that nothing she types leaves to a model).
 * A lesson that claims more than those files do is a bug.
 */

/** The order this level builds its terms in: one new idea a lesson. */
export const SIMPLE_GLOSSARY: readonly string[] = [
  'staffing firm', 'Etyme', 'routine step', 'agent',
  'record', 'timesheet', 'approval', 'bench', 'skill',
  'chatbot', 'prompt', 'model', 'reply', 'limit', 'agentic',
]

/** "What you will be good at": plain verbs. Opens the track and is recapped at its end. */
export const IT_UPGRADE_GOOD_AT: string[] = [
  'Explain how a client, a staffing firm and a consultant work on one job',
  'File a week of hours and follow it to pay day',
  'Write a clear request to a chatbot and check what comes back',
  'Find the answer to a question in your firm’s own documents',
  'Say what software may do alone and what needs a person’s yes',
]

export const IT_UPGRADE_SIMPLE: Level = {
  key: 'simple',
  title: 'Simple',
  chapters: [
    {
      key: 'it-ch1-tapin-and-your-work',
      title: 'Tapin and how your work is changing',
      lessons: [
        {
          key: 'it-1-1-1',
          title: 'Three parties, one job',
          intro:
            'Tapin is a staffing firm: it connects consultants with clients who need their work. ' +
            'A consultant is a person who works on contract. A client is the company that needs the work. ' +
            'On the screen, Tapin’s public page shows the firm’s name, a short line about it, and what its people can do. ' +
            'Behind the screen, the opening words are saved once, and the facts below them are read fresh on every visit. ' +
            'No person’s name and no pay rate is printed there. ' +
            'Technical note: your browser sends one HTTPS GET, and a firm with no page answers “not found”.',
          introduces: ['staffing firm'],
          uses: [],
          example: {
            mono: true,
            text:
              'A client needs a data engineer for six months.\n' +
              'A consultant knows that work and is free next month.\n' +
              'A staffing firm knows both, and introduces them.',
          },
          tryIt: {
            prompt: 'In one sentence, say what a staffing firm does. Use the words consultant and client.',
            starter: 'A staffing firm ',
            rules: [
              { kind: 'contains', value: 'consultant', says: 'It names the consultant.' },
              { kind: 'contains', value: 'client', says: 'It names the client.' },
              { kind: 'minWords', value: 7, says: 'It is a whole sentence.' },
            ],
            expected: 'Yes. The firm stands between the person who can do the work and the company with the job.',
          },
          exercise: {
            question: 'A hospital needs a database expert for three months. Which party is the hospital?',
            choices: ['The consultant', 'The client', 'The staffing firm'],
            correctIndex: 1,
            reason: 'The client is the company that needs the work done.',
          },
          video: null,
        },
        {
          key: 'it-1-1-2',
          title: 'Etyme: the system under the firm',
          intro:
            'Tapin runs its daily work on Etyme. Etyme is the system that keeps the facts of contract work in one place. ' +
            'On the screen, a new consultant opens Your work and reads “There is no work here yet.” ' +
            'A box lists what will appear later, such as where you work and what you are owed. ' +
            'Behind the screen, Etyme looks for your jobs, finds none, and says so in words. ' +
            'Technical note: the page calls GET /api/me/work over HTTPS and reads JSON. Without a sign-in, the call is refused.',
          introduces: ['Etyme'],
          uses: ['staffing firm'],
          example: {
            mono: true,
            text:
              'Your work, on day one\n' +
              '  There is no work here yet.\n\n' +
              'Your work, with a job\n' +
              '  Where you work\n' +
              '  Hours this month\n' +
              '  What you are owed',
          },
          tryIt: {
            prompt: 'A friend asks why your page is empty on day one. Answer in one sentence.',
            starter: 'My page is empty because ',
            rules: [
              { kind: 'containsAny', values: ['no work', 'no job', 'no placement', 'not placed', 'yet'], says: 'It says there is no job yet.' },
              { kind: 'minWords', value: 8, says: 'It is a whole sentence.' },
            ],
            expected: 'Yes. The page fills from real work, so it stays empty until a job exists.',
          },
          exercise: {
            question: 'A new consultant opens Your work and it is empty. Why?',
            choices: ['Etyme lost her data', 'No firm has put her on a job yet', 'She typed the wrong password'],
            correctIndex: 1,
            reason: 'The page fills from real work, and she has none yet.',
          },
          video: null,
        },
        {
          key: 'it-1-1-3',
          title: 'What software does now, and what stays yours',
          intro:
            'A consultant’s day used to hold many small chores: add up hours, count days, chase a date. ' +
            'A routine step is a task done the same way every time. Software now does those. ' +
            'On the screen, Your work shows “Hours this month” and “Ending within 60 days” without you counting anything. ' +
            'Behind the screen, Etyme adds up your hours and counts the days to each contract’s end. ' +
            'Technical note: the totals come from your saved weeks, so a wrong week gives a wrong total. ' +
            'What stays yours is judgment: which job to take, whether your hours are right, when to say yes.',
          introduces: ['routine step'],
          uses: ['Etyme'],
          example: {
            mono: true,
            text:
              'Software does\n' +
              '  add up the hours in a week\n' +
              '  count the days to a contract’s end\n\n' +
              'You do\n' +
              '  check that the hours are right\n' +
              '  choose which job to take',
          },
          tryIt: {
            prompt: 'Type one routine step from your own job today. Say how often you do it.',
            starter: 'Every week I ',
            rules: [
              { kind: 'containsAny', values: ['every', 'each', 'always', 'daily', 'weekly'], says: 'It says how often: the same way each time.' },
              { kind: 'minWords', value: 5, says: 'It is a whole sentence.' },
            ],
            expected: 'Yes. A task done the same way each time is a routine step.',
          },
          exercise: {
            question: 'Which of these is a routine step?',
            choices: ['Choosing between two job offers', 'Adding up the hours in a week', 'Explaining a design to a client'],
            correctIndex: 1,
            reason: 'It is done the same way every time, so software can do it.',
          },
          video: null,
        },
        {
          key: 'it-1-1-4',
          title: 'An agent: a helper that does the steps',
          intro:
            'Some software only answers a question. An agent is a helper that does not just answer: it does steps for you. ' +
            'It looks things up, uses tools, and finishes a small job. ' +
            'A reminder about late hours is a routine step, so an agent can do it. ' +
            'On the screen, you may meet one as a short letter: your hours for last week are missing. ' +
            'Behind the screen, an agent at your firm looked up who had not filed hours and wrote that letter. ' +
            'A person at the firm said yes before it was sent. ' +
            'Technical note: every agent starts switched off, and only the firm’s Owner switches one on.',
          introduces: ['agent'],
          uses: ['routine step', 'staffing firm'],
          example: {
            mono: true,
            text:
              'Software that only answers\n' +
              '  You ask who has not filed hours.\n' +
              '  It tells you three names. You do the rest.\n\n' +
              'An agent\n' +
              '  looks up who has not filed hours\n' +
              '  uses a tool to write each reminder\n' +
              '  waits for a person’s yes, then sends\n' +
              '  the small job is finished',
          },
          tryIt: {
            prompt: 'In one sentence, say what an agent does that a plain answer does not. Use the word steps or the word job.',
            starter: 'An agent ',
            rules: [
              { kind: 'containsAny', values: ['steps', 'job'], says: 'It says the agent does steps or a job, not only an answer.' },
              { kind: 'minWords', value: 6, says: 'It is a whole sentence.' },
            ],
            expected: 'Yes. An agent does the steps and finishes a small job for you.',
          },
          exercise: {
            question: 'Which of these is an agent?',
            choices: ['A page that shows your hours', 'A helper that looks up who is late and writes each reminder', 'A search box that answers one question'],
            correctIndex: 1,
            reason: 'An agent does the steps of a small job, and does not only answer.',
          },
          video: null,
        },
      ],
    },
    {
      key: 'it-ch2-record-week-bench',
      title: 'The record, your week and the bench',
      lessons: [
        {
          key: 'it-1-2-1',
          title: 'One record, read by each party',
          intro:
            'Etyme keeps one record of each job. The record is the shared set of facts: who works where, which weeks, which papers. ' +
            'On the screen, “Where you work” names your site and every firm between you and the client. ' +
            'You see your own pay rate, and no other firm’s rate. ' +
            'Behind the screen, each party reads the same record, and the server sends each reader only its own part. ' +
            'Technical note: every read of another person’s facts is written to a log, and so is every refused read.',
          introduces: ['record'],
          uses: ['Etyme', 'staffing firm'],
          example: {
            mono: true,
            text:
              'One week on the record: 40 hours\n\n' +
              'You read\n  your hours, your pay\n' +
              'Your firm reads\n  your hours, your pay, its bill\n' +
              'The client reads\n  your hours, what it pays',
          },
          tryIt: {
            prompt: 'A firm you never worked with asks to read your pay. Write what happens.',
            starter: 'The read is ',
            rules: [
              { kind: 'containsAny', values: ['refus', 'denied', 'cannot', 'not allowed', 'may not'], says: 'It says the read is refused.' },
              { kind: 'containsAny', values: ['log', 'written down', 'recorded'], says: 'It says the refusal is logged.' },
            ],
            expected: 'Yes. The read is refused, and the refusal itself is logged.',
          },
          exercise: {
            question: 'Three parties work on your week. How many copies of it does Etyme keep?',
            choices: ['Three, one for each party', 'One, and each party reads its own part', 'None'],
            correctIndex: 1,
            reason: 'One record means one set of facts, so the parties cannot disagree.',
          },
          video: null,
        },
        {
          key: 'it-1-2-2',
          title: 'A week of hours',
          intro:
            'You report your hours on a timesheet. A timesheet is one week of hours, from Sunday to Saturday. ' +
            'On the screen, “File your hours” shows a week picker, one box for each day, and a running total. ' +
            'The line above it reads “Only you can file your hours.” ' +
            'Behind the screen, the screen sends the week’s first day and the hours for each day, and the record keeps them. ' +
            'Technical note: a week that is already filed is refused in a sentence, so nothing is saved twice.',
          introduces: ['timesheet'],
          uses: ['record'],
          example: {
            mono: true,
            text:
              'POST /api/me/work\n' +
              '{\n' +
              '  "contractId": "…",\n' +
              '  "periodStart": "2026-12-06",\n' +
              '  "hours": { "2026-12-07": 8, "2026-12-08": 8, "2026-12-09": 8 }\n' +
              '}',
          },
          tryIt: {
            prompt: 'You worked 8 hours on each day from Monday to Friday. Type the total for the week.',
            starter: '',
            rules: [
              { kind: 'contains', value: '40', says: 'Five days of eight hours make 40.' },
              { kind: 'maxWords', value: 3, says: 'It is just the total.' },
            ],
            expected: '40 hours. The screen keeps the same running total as you type.',
          },
          exercise: {
            question: 'Who may file your timesheet?',
            choices: ['Your recruiter', 'Only you', 'The client'],
            correctIndex: 1,
            reason: 'They are your hours, so the screen takes them only from you.',
          },
          video: null,
        },
        {
          key: 'it-1-2-3',
          title: 'Approval: who says the week is right',
          intro:
            'A filed week is only a claim until somebody confirms it. Approval is the client’s yes that the hours are right. ' +
            'On the screen, one button reads “Send for approval”. The week then reads “Waiting for” and the client’s name. ' +
            'Later it reads “Owed to you”, and at last “Paid”. ' +
            'Behind the screen, the client approves the week, and the firm that pays you accepts it. ' +
            'Only after both does the record call the money owed. ' +
            'Technical note: a week holds one status at a time, and the screen reads that status from the record.',
          introduces: ['approval'],
          uses: ['timesheet', 'record'],
          example: {
            mono: true,
            text:
              'The usual path of one week\n\n' +
              'You file the week\n' +
              '  ↓\n' +
              'Waiting for the client      (the client approves)\n' +
              '  ↓\n' +
              'Waiting for your employer   (your employer accepts)\n' +
              '  ↓\n' +
              'Owed to you\n' +
              '  ↓\n' +
              'Paid',
          },
          tryIt: {
            prompt: 'The client approved your week. Your employer has not accepted it yet. Type the missing word: the money is not yet ____.',
            starter: '',
            rules: [
              { kind: 'contains', value: 'owed', says: 'The word is “owed”.' },
              { kind: 'maxWords', value: 3, says: 'It is just the one word.' },
            ],
            expected: 'Owed. The money is owed to you once your employer accepts the week.',
          },
          exercise: {
            question: 'The client approved your week this morning. Is the money owed to you now?',
            choices: ['Yes, at once', 'Not until the firm that pays you accepts the week', 'Only after a month'],
            correctIndex: 1,
            reason: 'Owed means your employer accepted the week, not only the client.',
          },
          video: null,
        },
        {
          key: 'it-1-2-4',
          title: 'The bench, and your own yes',
          intro:
            'Between jobs, a firm can offer you to new jobs. The bench is a firm’s list of people it may put forward. ' +
            'On the screen, “Who has you” lists every firm that holds your yes, and how long you chose to stay. ' +
            'A firm that asks to market you waits there for your yes or your no. ' +
            'Behind the screen, a firm that does not employ you cannot put you forward without that yes on the record. ' +
            'Each firm sees only its own listing, and you can take a yes back at any time. ' +
            'Technical note: a stay can have an end date. After it, nobody can put you forward through that firm.',
          introduces: ['bench'],
          uses: ['staffing firm', 'record'],
          example: {
            mono: true,
            text:
              'A firm asks to market you.\n' +
              'You say yes, for 60 days.\n' +
              'The firm may now put you forward to jobs.\n' +
              'After 60 days the yes ends by itself, unless you renew it.',
          },
          tryIt: {
            prompt: 'A firm asks to market you. Type your yes and how long it lasts: a number of days, or “until I cancel”.',
            starter: 'Yes, ',
            rules: [
              { kind: 'contains', value: 'yes', says: 'It says yes.' },
              { kind: 'containsAny', values: ['days', 'until i cancel'], says: 'It says how long the yes lasts.' },
            ],
            expected: 'Recorded as your own choice. The firm may put you forward for that long, and no longer.',
          },
          exercise: {
            question: 'Who decides that you are on a firm’s bench?',
            choices: ['The firm', 'The client', 'You'],
            correctIndex: 2,
            reason: 'A firm that does not employ you needs your own yes first.',
          },
          video: null,
        },
        {
          key: 'it-1-2-5',
          title: 'A skill: one job, written down as steps',
          intro:
            'An agent cannot do a job nobody wrote down for it. ' +
            'A skill is one job the agent knows how to do well, written down as steps. ' +
            'Think of a recipe card: one card, one dish, the same steps each time. ' +
            'More skills mean more jobs the agent can do. ' +
            'On the screen, the reminder about a late timesheet is the result of one skill. ' +
            'Behind the screen, the firm’s agent for late weeks has three skills: propose a reminder, send the letter, and close the job. ' +
            'Technical note: a skill is saved as data, with a name and a list of what it may do. ' +
            'An agent with no skill for a job cannot do that job.',
          introduces: ['skill'],
          uses: ['agent', 'timesheet', 'staffing firm'],
          example: {
            mono: true,
            text:
              'A recipe card\n' +
              '  Dish: tomato soup\n' +
              '  1 chop   2 cook   3 taste   4 serve\n\n' +
              'A skill\n' +
              '  Job: remind a person about a late week\n' +
              '  1 find the week that is missing\n' +
              '  2 write the reminder\n' +
              '  3 wait for a yes, then send\n' +
              '  4 stop when the week is filed',
          },
          tryIt: {
            prompt: 'Write a skill as a recipe card: name one job, then give three numbered steps. Use 1, 2 and 3.',
            starter: 'Job: ',
            rules: [
              { kind: 'contains', value: '1', says: 'It has a step 1.' },
              { kind: 'contains', value: '2', says: 'It has a step 2.' },
              { kind: 'contains', value: '3', says: 'It has a step 3.' },
              { kind: 'minWords', value: 10, says: 'It names the job and says each step in words.' },
            ],
            expected: 'One job, written down as steps: that is a skill.',
          },
          exercise: {
            question: 'An agent has two skills. Its firm writes a third one for it. What changes?',
            choices: ['It does the first two jobs faster', 'It can do one more job', 'Nothing changes'],
            correctIndex: 1,
            reason: 'Each skill is one job, so more skills mean more jobs it can do.',
          },
          video: null,
        },
      ],
    },
    {
      key: 'it-ch3-a-first-chatbot',
      title: 'A first chatbot',
      lessons: [
        {
          key: 'it-1-3-1',
          title: 'A chat that answers',
          intro:
            'A chatbot is a program that answers typed questions in a chat. Etyme has one, named Ask Etyme. ' +
            'On the screen, you see a greeting about your own work, a text box, and a few ready questions. ' +
            'One ready question is “Is my week signed?” ' +
            'Behind the screen, the chatbot reads your question and answers from your own record. ' +
            'Technical note: each conversation is kept for the person who had it, and nobody else may open it.',
          introduces: ['chatbot'],
          uses: ['Etyme', 'record'],
          example: {
            mono: true,
            text:
              'Ready questions in a worker’s chat\n' +
              '  What needs me today?\n' +
              '  Is my week signed?\n' +
              '  What am I owed?\n' +
              '  What papers are due?\n' +
              '  Who has my consent?',
          },
          tryIt: {
            prompt: 'Pick one thing about your own work you would ask a chatbot. Type it as a question.',
            starter: '',
            rules: [
              { kind: 'contains', value: '?', says: 'It is a question.' },
              { kind: 'containsAny', values: ['my ', ' i ', ' me'], says: 'It is about your own work.' },
              { kind: 'maxWords', value: 12, says: 'It asks one thing, in a few words.' },
            ],
            expected: 'A good question: short, and about your own work.',
          },
          exercise: {
            question: 'What is a chatbot?',
            choices: ['A person who answers by phone', 'A program that answers typed questions in a chat', 'A page of settings'],
            correctIndex: 1,
            reason: 'It is software, and you talk to it by typing.',
          },
          video: null,
        },
        {
          key: 'it-1-3-2',
          title: 'The prompt: what you send',
          intro:
            'The text you send to a chatbot is a prompt. A clear prompt asks one thing and says what it is about. ' +
            'On the screen, you type in the box and press Send. Your prompt appears in the chat. ' +
            'Behind the screen, the prompt travels to the server as plain text. The server keeps it in your conversation. ' +
            'Technical note: it is one HTTPS POST with a small JSON body, and one answer comes back for it.',
          introduces: ['prompt'],
          uses: ['chatbot'],
          example: {
            mono: true,
            text: 'POST /api/conversations/twin\n{ "text": "Is my week signed?" }',
          },
          tryIt: {
            prompt: 'This prompt is vague: “Tell me about stuff.” Rewrite it to ask one thing about your week.',
            starter: '',
            rules: [
              { kind: 'contains', value: 'week', says: 'It says what it is about: your week.' },
              { kind: 'contains', value: '?', says: 'It asks a question.' },
              { kind: 'maxWords', value: 12, says: 'It asks one thing.' },
            ],
            expected: 'A clear prompt: one question, about one week.',
          },
          exercise: {
            question: 'Which is the clearer prompt?',
            choices: ['Stuff about pay?', 'What am I owed for last week?'],
            correctIndex: 1,
            reason: 'It asks one thing and says which week.',
          },
          video: null,
        },
        {
          key: 'it-1-3-3',
          title: 'The model: where many chatbots get their words',
          intro:
            'Many chatbots pass your prompt to a model. ' +
            'A model is a program that learned the patterns of language from a great deal of text. ' +
            'It writes an answer by choosing likely next words, one after another. ' +
            'On the screen, you cannot tell: a model’s answer and a coded answer look the same. ' +
            'Behind the screen, the difference is large. A model has not read your record unless someone puts it in the prompt. ' +
            'Technical note: in a worker’s Ask Etyme, nothing you type is sent to a model. Its answers come from code.',
          introduces: ['model'],
          uses: ['chatbot', 'prompt', 'record'],
          example: {
            mono: true,
            text:
              'A chatbot with a model\n' +
              '  prompt → model → words chosen one by one\n\n' +
              'A worker’s Ask Etyme\n' +
              '  prompt → code reads your record → a sentence built from facts',
          },
          tryIt: {
            prompt: 'Finish the sentence: say what a model learned from.',
            starter: 'A model learned from ',
            rules: [
              { kind: 'containsAny', values: ['text', 'writing', 'words', 'language'], says: 'It names what the model learned from.' },
              { kind: 'minWords', value: 5, says: 'It is a whole sentence.' },
            ],
            expected: 'Yes. A model learned from text, not from your own files.',
          },
          exercise: {
            question: 'Has a model read your timesheets?',
            choices: ['Yes, it reads everything', 'No, unless someone puts them in the prompt', 'Only on weekdays'],
            correctIndex: 1,
            reason: 'A model knows its learning text and the prompt, nothing else.',
          },
          video: null,
        },
        {
          key: 'it-1-3-4',
          title: 'The reply: what comes back',
          intro:
            'The text a chatbot sends back is a reply. One prompt gets one reply. ' +
            'On the screen, the reply appears under your prompt, and some replies carry a link to the right page. ' +
            'Behind the screen, a model’s reply can change from one try to the next, because it chooses likely words. ' +
            'A reply built by code from your record is the same every time the facts are the same. ' +
            'Technical note: the reply returns in the same HTTPS response, as JSON holding the sentence and any links.',
          introduces: ['reply'],
          uses: ['prompt', 'model', 'chatbot', 'record'],
          example: {
            mono: true,
            text:
              'Prompt   File my week.\n' +
              'Reply    Etyme never files your week; you file it on Your work.',
          },
          tryIt: {
            prompt: 'You send the same prompt twice to a chatbot that uses a model. Are the two replies always the same? Type yes or no.',
            starter: '',
            rules: [
              { kind: 'contains', value: 'no', says: 'A model chooses likely words, so its replies can differ.' },
              { kind: 'maxWords', value: 2, says: 'It is one word: yes or no.' },
            ],
            expected: 'No. Ask twice and you may read two different replies.',
          },
          exercise: {
            question: 'You ask a coded chatbot the same question twice, and your record has not changed. What comes back?',
            choices: ['Two different replies', 'The same reply', 'Nothing'],
            correctIndex: 1,
            reason: 'The same facts through the same code give the same sentence.',
          },
          video: null,
        },
        {
          key: 'it-1-3-5',
          title: 'Its limits',
          intro:
            'Every chatbot has limits. A limit is something it cannot do, or must not do. ' +
            'A model can sound sure and be wrong, because it writes likely words, not checked facts. ' +
            'On the screen, Ask Etyme states a limit under the box: “It never files, signs or sends anything for you.” ' +
            'Behind the screen, a question outside your own work gets a refusal in one sentence, not a guess. ' +
            'Technical note: that refusal is decided before your record is read, so nothing is fetched for it.',
          introduces: ['limit'],
          uses: ['chatbot', 'model', 'prompt', 'reply', 'record'],
          example: {
            mono: true,
            text:
              'Prompt   What is another consultant’s pay?\n' +
              'Reply    I answer only about your own work, never another person’s pay or a firm’s rates.',
          },
          tryIt: {
            prompt: 'Ask Etyme refuses “Tell me another consultant’s pay.” Rewrite the prompt so it asks about your own pay.',
            starter: '',
            rules: [
              { kind: 'containsAny', values: ['my pay', 'am i owed', 'i owed', 'my rate', 'i paid'], says: 'It asks about your own pay.' },
              { kind: 'maxWords', value: 12, says: 'It asks one thing.' },
            ],
            expected: 'Inside the limit: a question about your own pay can be answered from your record.',
          },
          exercise: {
            question: 'A chatbot answers fast and sounds sure. Is the answer checked?',
            choices: ['Yes, sure means right', 'Not always: check it where the fact is kept', 'It is always wrong'],
            correctIndex: 1,
            reason: 'A model writes likely words, so you check a fact against the record.',
          },
          video: null,
        },
        {
          key: 'it-1-3-6',
          title: 'Agentic: step by step toward a goal',
          intro:
            'A chatbot gives one reply to one prompt, and then it stops. ' +
            'Agentic means working step by step toward a goal, and checking as you go. ' +
            'It is how an agent works when it does a whole task, not just one answer. ' +
            'On the screen, you see only the result: a reminder arrives, and no more come once your week is filed. ' +
            'Behind the screen, the agent takes a step, looks at the record, and then chooses the next step. ' +
            'Technical note: each step is one skill, and the record is read again before the next step. ' +
            'The next level starts smaller: one limit is removed, and a chatbot reads documents before it replies.',
          introduces: ['agentic'],
          uses: ['chatbot', 'prompt', 'reply', 'limit', 'agent', 'skill', 'record'],
          example: {
            mono: true,
            text:
              'One answer\n' +
              '  prompt → reply → stop\n\n' +
              'Agentic work\n' +
              '  goal     every hour of last week is filed\n' +
              '  step 1   find the weeks that are missing      check: three are missing\n' +
              '  step 2   send a reminder for each             check: two are filed now\n' +
              '  step 3   remind the last person once more     check: all are filed\n' +
              '  goal met, so stop',
          },
          tryIt: {
            prompt: 'An agent sent three reminders. It checks the record, and two of those weeks are now filed. How many people does it remind again? Type the number.',
            starter: '',
            rules: [
              { kind: 'equals', value: '1', says: 'Three reminders, less two filed weeks, leaves one.' },
            ],
            expected: 'One. It checked after the step, so it reminds only the person whose week is still missing.',
          },
          exercise: {
            question: 'Which of these is agentic work?',
            choices: ['Giving one reply to one prompt', 'Taking a step, checking the result, then choosing the next step until the goal is met', 'Showing a page of settings'],
            correctIndex: 1,
            reason: 'Agentic work moves step by step toward a goal and checks as it goes.',
          },
          video: null,
        },
      ],
    },
  ],
  project: {
    key: 'it-simple-project',
    title: 'Follow one week from your hours to a reply',
    checklist: [
      'Drew the three parties of one job and named each',
      'Wrote a sample week of hours, Sunday to Saturday, with its total',
      'Marked who approves the week and who accepts it',
      'Named one routine step software would do for that week',
      'Wrote three prompts about the week, each asking one thing',
      'Wrote the reply you expect for each prompt, using only facts from your sample week',
      'Wrote one prompt a chatbot must refuse, and the one sentence it should say',
      'Named one limit of a chatbot that uses a model',
      'Wrote one small job an agent could finish for that week, as a skill in three steps',
    ],
  },
}

/** For each try-it: one input its rules accept and one they refuse. Read by the content test, and by a hint later. */
export const SIMPLE_TRY_SAMPLES: Record<string, { right: string; wrong: string }> = {
  'it-1-1-1': { right: 'A staffing firm connects a consultant with a client who needs her work.', wrong: 'A staffing firm sells software to banks and shops.' },
  'it-1-1-2': { right: 'My page is empty because no firm has put me on a job yet.', wrong: 'My page is empty because the system is broken today.' },
  'it-1-1-3': { right: 'Every week I copy my hours into a spreadsheet.', wrong: 'I design things.' },
  'it-1-1-4': { right: 'An agent does the steps of a small job for you.', wrong: 'An agent is nice.' },
  'it-1-2-1': { right: 'The read is refused, and the refusal is written to the log.', wrong: 'The firm reads my pay.' },
  'it-1-2-2': { right: '40 hours', wrong: '45' },
  'it-1-2-3': { right: 'owed', wrong: 'paid' },
  'it-1-2-4': { right: 'Yes, for 60 days.', wrong: 'Maybe later.' },
  'it-1-2-5': { right: 'Job: file my week. 1 open Your work. 2 type the hours for each day. 3 send it.', wrong: 'Job: do my work well.' },
  'it-1-3-1': { right: 'When is my week due?', wrong: 'Tell the weather today' },
  'it-1-3-2': { right: 'Is my week signed?', wrong: 'Tell me about stuff.' },
  'it-1-3-3': { right: 'A model learned from a great deal of text.', wrong: 'A model learned from my timesheet.' },
  'it-1-3-4': { right: 'No', wrong: 'Yes' },
  'it-1-3-5': { right: 'What am I owed?', wrong: 'Tell me another consultant’s pay.' },
  'it-1-3-6': { right: '1', wrong: '3' },
}

const TEXT = 'font-family="Inter, sans-serif" font-size="13" fill="#1F1E1D"'
const ARROW = 'fill="none" stroke="#6B6862" stroke-width="1.5"'
const row = (labels: string[], marked: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 96" role="img">` +
  labels.map((t, i) =>
    `<rect x="${8 + i * 160}" y="24" width="136" height="48" rx="10" fill="${i === marked ? '#E6F2E6' : '#FBFAF7'}" stroke="${i === marked ? '#4F6F52' : '#E3DFD5'}"/>` +
    `<text x="${76 + i * 160}" y="53" text-anchor="middle" ${TEXT}>${t}</text>` +
    (i < labels.length - 1 ? `<path d="M${146 + i * 160} 48h18m-6-5 6 5-6 5" ${ARROW}/>` : '')).join('') +
  `</svg>`

/**
 * Original pictures for three lessons, drawn in the brand kit's tokens. The
 * lesson page has no picture slot yet; they are keyed by lesson so the page
 * can mount them when it has one. No motion, so nothing to switch off.
 */
export const SIMPLE_PICTURES: Record<string, { alt: string; svg: string }> = {
  'it-1-2-1': {
    alt: 'A client, a staffing firm and a consultant each read their own part of one shared record.',
    svg:
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 170" role="img">` +
      ['The client', 'The staffing firm', 'You'].map((t, i) =>
        `<rect x="${40 + i * 200}" y="8" width="160" height="44" rx="10" fill="#FBFAF7" stroke="#E3DFD5"/>` +
        `<text x="${120 + i * 200}" y="35" text-anchor="middle" ${TEXT}>${t}</text>` +
        `<path d="M${120 + i * 200} 54v40m-5-6 5 6 5-6" ${ARROW}/>`).join('') +
      `<rect x="40" y="100" width="560" height="56" rx="12" fill="#E6F2E6" stroke="#4F6F52"/>` +
      `<text x="320" y="133" text-anchor="middle" ${TEXT} font-weight="600">One record. Each reader gets its own part.</text>` +
      `</svg>`,
  },
  'it-1-2-3': {
    alt: 'A week moves in four steps: you file it, the client approves it, your employer accepts it, and you are paid.',
    svg: row(['You file', 'Client approves', 'Employer accepts', 'Paid'], 1),
  },
  'it-1-3-4': {
    alt: 'A prompt goes in, the chatbot works on it, and one reply comes back.',
    svg: row(['Your prompt', 'The chatbot', 'One reply'], 2),
  },
}
