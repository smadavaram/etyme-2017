import type { Level } from './types'

/**
 * IT — Upgrade, level 2: Medium (chapters 4 to 6). A chatbot that answers
 * from documents, then how Ask Etyme answers from a firm's own record,
 * then the data flow and the permissions around it.
 *
 * Every screen described here is read from the code as it stands:
 * `app/api/conversations/twin/ask.ts` (rules first, the model second,
 * the cited-line check), `./transaction` (questions off the record),
 * `./mask` (placeholders), `lib/model-boundary` (the switch and the
 * prompt log) and `lib/twin/ledger` (lines scoped to the reader).
 * A lesson that claims more than those files do is a bug.
 */

/** Terms the Simple level builds and this level uses. The assembled track's term check holds the two together. */
export const MEDIUM_BUILDS_ON: readonly string[] = ['record', 'chatbot', 'prompt', 'model', 'reply']

/** The order this level builds its own terms in: one new idea a lesson. */
export const MEDIUM_GLOSSARY: readonly string[] = [
  'document lookup', 'chunk', 'source', 'citation', 'missing document',
  'boundary line', 'rule', 'ledger line', 'cited-line check', 'off the record',
  'company switch', 'placeholder', 'permission', 'prompt log', 'describe, never act',
]

export const IT_UPGRADE_MEDIUM: Level = {
  key: 'medium',
  title: 'Medium',
  chapters: [
    {
      key: 'it-ch4-answer-from-documents',
      title: 'A chatbot that answers from documents',
      lessons: [
        {
          key: 'it-2-4-1',
          title: 'Look it up before you reply',
          intro:
            'On the screen, a user asks about the firm’s own holiday list. The model never read that list, so a plain reply is a guess. ' +
            'Behind the screen, one step is added before the reply: the system finds the right document and hands it to the model. ' +
            'That step is the document lookup. Technical note: the lookup is plain search code, and it runs before any model is asked.',
          introduces: ['document lookup'],
          uses: ['chatbot', 'model', 'reply'],
          example: {
            mono: true,
            text:
              'Without a lookup\n  question -> model -> reply (a guess)\n\n' +
              'With a lookup\n  question -> document lookup -> model reads the document -> reply',
          },
          tryIt: {
            prompt: 'A user asks: “Is the day after the national holiday a day off?” Write the step the system does before it replies.',
            starter: 'First, the system ',
            rules: [
              { kind: 'containsAny', values: ['look up', 'looks up', 'lookup', 'search', 'find', 'read'], says: 'It looks something up before it replies.' },
              { kind: 'containsAny', values: ['document', 'holiday list', 'file'], says: 'It names the document it needs.' },
              { kind: 'minWords', value: 6, says: 'It is a whole sentence.' },
            ],
            expected: 'Right order: the lookup comes first, and the reply comes after it.',
          },
          exercise: {
            question: 'A chatbot answers a question about your firm’s holiday list with no lookup. What is the answer?',
            choices: ['A fact from the holiday list', 'A guess that reads like a fact', 'An error message'],
            correctIndex: 1,
            reason: 'The model never read the list, so it can only guess.',
          },
          video: null,
        },
        {
          key: 'it-2-4-2',
          title: 'Chunks: small pieces of a document',
          intro:
            'On the screen, nothing changes: the user still types one question. ' +
            'Behind the screen, a long document is cut into small pieces before any lookup. Each piece is a chunk. ' +
            'The lookup hands the model only the chunks that match the question. ' +
            'Technical note: a model reads a limited amount of text, so a whole handbook does not fit.',
          introduces: ['chunk'],
          uses: ['document lookup', 'model'],
          example: {
            mono: true,
            text:
              'Handbook, cut into chunks\n' +
              '  1  The week runs Sunday to Saturday.\n' +
              '  2  Hours are due on Monday.\n' +
              '  3  Your manager approves the week by Wednesday.',
          },
          tryIt: {
            prompt: 'The question is “When are my hours due?” Type the number of the one chunk the lookup should hand to the model.',
            starter: '',
            rules: [{ kind: 'equals', value: '2', says: 'It is the chunk that names the day hours are due.' }],
            expected: 'Chunk 2 goes to the model. Chunks 1 and 3 stay behind.',
          },
          exercise: {
            question: 'Why is a document cut into chunks?',
            choices: ['To hide parts of it from the user', 'So the model gets only the pieces that match the question', 'To make the document longer'],
            correctIndex: 1,
            reason: 'A model reads a limited amount of text, so it gets the matching pieces only.',
          },
          video: null,
        },
        {
          key: 'it-2-4-3',
          title: 'Sources: where a chunk came from',
          intro:
            'On the screen, the user wants to know where an answer came from. ' +
            'Behind the screen, every chunk keeps a label: the document it was cut from, and the place in it. That label is its source. ' +
            'Technical note: the source travels with the chunk as plain data, so nothing has to remember it later.',
          introduces: ['source'],
          uses: ['chunk', 'document lookup'],
          example: {
            mono: true,
            text:
              'chunk   Hours are due on Monday.\n' +
              'source  handbook, section 3\n' +
              'id      handbook-3',
          },
          tryIt: {
            prompt: 'Chunk 3 says “Your manager approves the week by Wednesday.” It came from section 4 of the handbook. Write its source.',
            starter: '',
            rules: [
              { kind: 'contains', value: 'handbook', says: 'It names the document.' },
              { kind: 'containsAny', values: ['section 4', 'section four', '-4'], says: 'It names the place in the document.' },
              { kind: 'maxWords', value: 6, says: 'It is a short label, not a sentence.' },
            ],
            expected: 'A source says the document and the place, and nothing else.',
          },
          exercise: {
            question: 'A chunk has lost its source. What can the user no longer do?',
            choices: ['Read the answer', 'Check where the answer came from', 'Ask another question'],
            correctIndex: 1,
            reason: 'Without a source, nobody can open the document behind the answer.',
          },
          video: null,
        },
        {
          key: 'it-2-4-4',
          title: 'Citing: the answer names its source',
          intro:
            'On the screen, the answer ends with a short mark in square brackets. The user opens it and reads the document. ' +
            'Behind the screen, the model is told to write the id of each chunk it used. That mark is a citation. ' +
            'Technical note: the system can check a citation, because it knows which ids it handed over.',
          introduces: ['citation'],
          uses: ['source', 'chunk', 'model'],
          example: {
            mono: true,
            text:
              'Handed to the model\n  [handbook-3] Hours are due on Monday.\n\n' +
              'The answer\n  Hours are due on Monday [handbook-3].',
          },
          tryIt: {
            prompt: 'The model was handed “[handbook-4] Your manager approves the week by Wednesday.” Write an answer with its citation.',
            starter: 'Your manager approves the week by Wednesday',
            rules: [
              { kind: 'contains', value: '[handbook-4]', says: 'It cites the id it was handed, in square brackets.' },
              { kind: 'contains', value: 'wednesday', says: 'It keeps the fact from the chunk.' },
            ],
            expected: 'The answer can be checked: the id leads back to the handbook.',
          },
          exercise: {
            question: 'An answer cites [handbook-9]. The system handed over only [handbook-3]. What is true?',
            choices: ['The citation is fine', 'The citation points to nothing the model was given', 'The answer is shorter'],
            correctIndex: 1,
            reason: 'A citation counts only when its id is one the system handed over.',
          },
          video: null,
        },
        {
          key: 'it-2-4-5',
          title: 'When the document is missing',
          intro:
            'On the screen, the user asks about something no document covers. ' +
            'Behind the screen, the lookup returns nothing. This is the missing document case, and it is the main failure mode. ' +
            'A model with nothing to read still writes a smooth answer. ' +
            'The safe design says so in one sentence and points to where to look.',
          introduces: ['missing document'],
          uses: ['document lookup', 'chunk', 'citation', 'model'],
          example: {
            mono: true,
            text:
              'Question   How many sick days do I have?\n' +
              'Lookup     no chunk matches\n' +
              'Bad reply  You have ten sick days.\n' +
              'Good reply I cannot answer that yet. Ask HR for the leave policy.',
          },
          tryIt: {
            prompt: 'The lookup found nothing for “Can I work from another country?” Write the reply the user should read.',
            starter: '',
            rules: [
              { kind: 'containsAny', values: ['cannot answer', 'can not answer', 'no document', 'did not find', 'nothing in the documents'], says: 'It says plainly that there is no answer.' },
              { kind: 'containsAny', values: ['ask', 'open', 'check', 'look'], says: 'It points to where to look next.' },
              { kind: 'maxWords', value: 25, says: 'It stays short.' },
            ],
            expected: 'No guess. The user knows there is no answer here, and where to go.',
          },
          exercise: {
            question: 'The lookup returns nothing. What should the system do?',
            choices: ['Let the model answer anyway', 'Say it cannot answer, and point to where to look', 'Show an empty reply'],
            correctIndex: 1,
            reason: 'A guess that reads like a fact is worse than an honest “not yet”.',
          },
          video: null,
        },
      ],
    },
    {
      key: 'it-ch5-etyme-answers-from-the-record',
      title: 'How Ask Etyme answers from a firm’s own record',
      lessons: [
        {
          key: 'it-2-5-1',
          title: 'The Ask Etyme screen',
          intro:
            'On the screen, Ask Etyme is a chat, and it is the first screen after sign-in. ' +
            'One line there is the boundary line: “Your data stays in your company. Every read is logged.” ' +
            'Behind the screen, the documents are not files. They are the firm’s own record: jobs, timesheets, bills, papers and people. ' +
            'Technical note: the chat keeps each conversation for the person who had it.',
          introduces: ['boundary line'],
          uses: ['document lookup', 'chatbot', 'record'],
          example: {
            mono: true,
            text:
              'You        Which weeks are unsigned?\n' +
              'Ask Etyme  A sentence with the count and the oldest week,\n' +
              '           and the list as a table beside the chat.',
          },
          tryIt: {
            prompt: 'Type a question the record can answer. Use a word a recruiter or an AP clerk says, and end with a question mark.',
            starter: '',
            rules: [
              { kind: 'containsAny', values: ['timesheet', 'weeks', 'invoice', 'bill', 'contract', 'submission', 'payroll', 'paper', 'applied'], says: 'It uses a word the record holds.' },
              { kind: 'contains', value: '?', says: 'It is a question.' },
              { kind: 'minWords', value: 3, says: 'It says enough to be answered.' },
            ],
            expected: 'That question has a record behind it, so Ask Etyme can look it up.',
          },
          exercise: {
            question: 'What does Ask Etyme look things up in?',
            choices: ['The public internet', 'The firm’s own record', 'Other companies’ records'],
            correctIndex: 1,
            reason: 'It answers from the signed-in firm’s own record and nothing else.',
          },
          video: null,
        },
        {
          key: 'it-2-5-2',
          title: 'Rules answer first',
          intro:
            'On the screen, a common question gets an exact answer at once. ' +
            'Behind the screen, plain code read the question and fetched the figure from the record. That code is a rule. ' +
            'No model was asked, so the figure is the record’s own, the same every time. ' +
            'Technical note: only a question no rule reads goes on to the next step.',
          introduces: ['rule'],
          uses: ['record', 'model'],
          example: {
            mono: true,
            text:
              'Questions a rule answers\n' +
              '  What needs me today?\n' +
              '  Which weeks are unsigned?\n' +
              '  Who is near the time limit?\n' +
              '  What did we spend by supplier this month?',
          },
          tryIt: {
            prompt: 'Type one question from the example that a rule answers with no model.',
            starter: '',
            rules: [
              { kind: 'containsAny', values: ['what needs me', 'weeks are unsigned', 'near the time limit', 'spend by supplier'], says: 'It is a question a rule reads.' },
            ],
            expected: 'A rule answers this from the record. Nothing is sent to a model.',
          },
          exercise: {
            question: 'Why does Ask Etyme try its rules before a model?',
            choices: ['Rules sound friendlier', 'A rule gives the record’s own figure, the same every time', 'Rules can answer anything'],
            correctIndex: 1,
            reason: 'A figure about money or hours must come from the record, never from a guess.',
          },
          video: null,
        },
        {
          key: 'it-2-5-3',
          title: 'Ledger lines are the chunks',
          intro:
            'On the screen, the user types a question no rule reads. ' +
            'Behind the screen, Etyme keeps a ledger of what it checked and did. Each entry is one ledger line. ' +
            'For this question, the lookup takes up to 60 lines, newest first. ' +
            'Technical note: each line carries an id, a date, an outcome, the rule it followed and the reason.',
          introduces: ['ledger line'],
          uses: ['chunk', 'source', 'citation', 'rule', 'record', 'document lookup'],
          example: {
            mono: true,
            text:
              '[ck4821ab] 2026-12-01 · REFUSED · Invoice receipt held:\n' +
              'hours differ from the signed week · Invoice inv-204 ·\n' +
              'Rule: order, signed week and invoice must agree ·\n' +
              'Why: 42 hours billed, 40 hours signed',
          },
          tryIt: {
            prompt: 'Read the ledger line in the example. Type its id, the part a citation would use.',
            starter: '',
            rules: [
              { kind: 'contains', value: 'ck4821ab', says: 'It is the id at the start of the line.' },
              { kind: 'maxWords', value: 1, says: 'It is the id alone.' },
            ],
            expected: 'That id is what an answer cites, and what the link under the answer opens.',
          },
          exercise: {
            question: 'In the last chapter, a chunk carried a source. What plays that part in Ask Etyme?',
            choices: ['The user’s question', 'A ledger line with its id', 'The model’s memory'],
            correctIndex: 1,
            reason: 'Each ledger line is a small piece of the record with an id to cite.',
          },
          video: null,
        },
        {
          key: 'it-2-5-4',
          title: 'No cited line, no answer',
          intro:
            'On the screen, a model answer ends with links named “Entry” and six characters. Each opens the entry it cites. ' +
            'Behind the screen, Etyme runs the cited-line check before it shows anything. ' +
            'The answer must cite at least one id that was handed over. ' +
            'An answer that cites none is not shown; the user reads “I cannot answer that yet.” with a link to the ledger.',
          introduces: ['cited-line check'],
          uses: ['citation', 'ledger line', 'missing document', 'record', 'model'],
          example: {
            mono: true,
            text:
              'Handed over   [ck4821ab] [ck4821cd]\n\n' +
              'Shown         The invoice receipt is held; the hours differ [ck4821ab].\n' +
              'Not shown     The invoice receipt is held because the hours differ.\n' +
              'Not shown     The invoice receipt is held [zz999999].',
          },
          tryIt: {
            prompt: 'The model was handed [ck4821ab] and [ck4821cd]. Write an answer that passes the check.',
            starter: 'The invoice receipt is held',
            rules: [
              { kind: 'containsAny', values: ['[ck4821ab]', '[ck4821cd]'], says: 'It cites an id that was handed over.' },
              { kind: 'minWords', value: 5, says: 'It says something about the record.' },
            ],
            expected: 'Shown, with a link to the entry it cites.',
          },
          exercise: {
            question: 'A model writes a clear paragraph and cites no line. What does the user read?',
            choices: ['The paragraph', '“I cannot answer that yet.” and a link to the ledger', 'Nothing at all'],
            correctIndex: 1,
            reason: 'A fluent answer with no line behind it is treated as a missing document.',
          },
          video: null,
        },
        {
          key: 'it-2-5-5',
          title: 'Questions off the record',
          intro:
            'On the screen, somebody asks for a poem, the weather, or another company’s rates, and reads one sentence back. ' +
            'Behind the screen, a rule refused the question before any lookup and before any model. Such a question is off the record. ' +
            'Technical note: the test is one-sided on purpose. ' +
            'A question must use a word of the trade, or name a person or firm the reader may read.',
          introduces: ['off the record'],
          uses: ['rule', 'record', 'model', 'document lookup'],
          example: {
            mono: true,
            text:
              'You        What is the weather tomorrow?\n' +
              'Ask Etyme  I answer only about your company’s own record: jobs,\n' +
              '           submissions, contracts, timesheets, bills, invoice\n' +
              '           receipts, payroll, papers and people.',
          },
          tryIt: {
            prompt: 'Type a question Ask Etyme refuses before any model is asked.',
            starter: '',
            rules: [
              { kind: 'containsAny', values: ['weather', 'poem', 'joke', 'capital of', 'other companies', 'another company', 'competitor', 'market rate'], says: 'It is a general question, or one about another company’s book.' },
              { kind: 'minWords', value: 3, says: 'It is a whole question.' },
            ],
            expected: 'Refused in one sentence by a rule. No lookup ran, and nothing left the company.',
          },
          exercise: {
            question: 'Why is “write a poem about our timesheets” refused, though it says timesheets?',
            choices: ['The model is switched off', 'It is a writing job with no record behind it', 'Timesheets are secret'],
            correctIndex: 1,
            reason: 'A poem is still a poem; no entry in the record answers it.',
          },
          video: null,
        },
      ],
    },
    {
      key: 'it-ch6-data-flow-and-permissions',
      title: 'Data flow and permissions',
      lessons: [
        {
          key: 'it-2-6-1',
          title: 'The company switch',
          intro:
            'On the screen, Settings has a panel named “Ask Etyme and the model”. An Owner or an Admin turns the model on there. ' +
            'Behind the screen, that is the company switch, and it starts off. ' +
            'Text leaves for a model only when the switch is on and the deployment has a model set up. ' +
            'Technical note: with the switch off, the rules still answer.',
          introduces: ['company switch'],
          uses: ['model', 'rule'],
          example: {
            mono: true,
            text:
              'switch off                -> OFF     nothing leaves; the rules answer\n' +
              'switch on, no model set up -> NO_KEY  nothing leaves; the rules answer\n' +
              'switch on, model set up    -> ON      free text may go to the model',
          },
          tryIt: {
            prompt: 'The Owner turned the switch on. The deployment has no model set up. Type the state: OFF, NO_KEY or ON.',
            starter: '',
            rules: [{ kind: 'equals', value: 'NO_KEY', says: 'The switch is on, and there is still no model to ask.' }],
            expected: 'NO_KEY. The user reads that the model is not set up here, and nothing leaves.',
          },
          exercise: {
            question: 'A new company signs up. Does its free text go to a model?',
            choices: ['Yes, from the first day', 'No, not until an Owner or Admin turns the switch on', 'Only on weekdays'],
            correctIndex: 1,
            reason: 'The switch is off by default, so the choice is the company’s own.',
          },
          video: null,
        },
        {
          key: 'it-2-6-2',
          title: 'Names and figures leave as placeholders',
          intro:
            'On the screen, the user sees real names in the question and in the answer. ' +
            'Behind the screen, the model never sees them. Each name, rate and amount is swapped for a placeholder before the text leaves. ' +
            'The real values are put back when the answer returns. ' +
            'Technical note: the list of swaps lives for one request only and is never stored.',
          introduces: ['placeholder'],
          uses: ['company switch', 'ledger line', 'model'],
          example: {
            mono: true,
            text:
              'Typed     Why is Priya Shah’s invoice from Pinnacle Resourcing held?\n' +
              'Sent      Why is PERSON_1’s invoice from FIRM_2 held?\n' +
              'Returned  FIRM_2’s invoice for PERSON_1 is held [ck4821ab].\n' +
              'Shown     Pinnacle Resourcing’s invoice for Priya Shah is held [ck4821ab].',
          },
          tryIt: {
            prompt: 'Mask this line before it leaves: “Priya Shah bills through Pinnacle Resourcing.” Use PERSON_1 and FIRM_2.',
            starter: 'Priya Shah bills through Pinnacle Resourcing.',
            rules: [
              { kind: 'contains', value: 'PERSON_1', says: 'The person is a placeholder.' },
              { kind: 'contains', value: 'FIRM_2', says: 'The firm is a placeholder.' },
              { kind: 'maxWords', value: 4, says: 'No word of a real name is left behind.' },
            ],
            expected: 'PERSON_1 bills through FIRM_2. That is all the model reads.',
          },
          exercise: {
            question: 'The same person appears in the question and in three ledger lines. What does the model see?',
            choices: ['Four different placeholders', 'The same placeholder each time', 'The real name once'],
            correctIndex: 1,
            reason: 'A placeholder is stable inside one request, so the model can follow who is who.',
          },
          video: null,
        },
        {
          key: 'it-2-6-3',
          title: 'Permissions decide what is looked up',
          intro:
            'On the screen, two people at one firm ask the same question and read different answers. ' +
            'Behind the screen, each role holds a set of permissions. The lookup returns only what the reader may already read. ' +
            'A firm’s margin is never shown to anybody else, and a rule says so before any lookup. ' +
            'Technical note: the filter sits in the query, not in the prompt.',
          introduces: ['permission'],
          uses: ['document lookup', 'ledger line', 'rule', 'prompt', 'record'],
          example: {
            mono: true,
            text:
              'A client asks   What margin does our supplier make?\n' +
              'Ask Etyme       Etyme never shows a firm’s margin to anybody else;\n' +
              '                your dashboard shows what you pay each supplier.',
          },
          tryIt: {
            prompt: 'A client asks for a supplier’s margin. Write the one-sentence refusal. Say what the reader may open instead.',
            starter: '',
            rules: [
              { kind: 'contains', value: 'margin', says: 'It says what is refused.' },
              { kind: 'containsAny', values: ['never', 'cannot', 'may not', 'does not'], says: 'It refuses plainly.' },
              { kind: 'containsAny', values: ['dashboard', 'what you pay', 'your own'], says: 'It names what the reader may open instead.' },
              { kind: 'maxWords', value: 25, says: 'It is one short sentence.' },
            ],
            expected: 'The reader knows what is closed and what is open.',
          },
          exercise: {
            question: 'Where should a permission be enforced?',
            choices: ['In the prompt, by asking the model to keep a secret', 'In the query, so the data is never fetched', 'On the screen, by hiding a column'],
            correctIndex: 1,
            reason: 'Data that was never fetched cannot leak, whatever the model writes.',
          },
          video: null,
        },
        {
          key: 'it-2-6-4',
          title: 'Every prompt is logged',
          intro:
            'On the screen, the company’s Settings lists each prompt that left and its answer, both masked. ' +
            'Behind the screen, that list is the prompt log. It also keeps which model answered and how much text went each way. ' +
            'Technical note: the log checks its own input. ' +
            'A text that still holds a real name is not kept, and the entry reads “withheld”.',
          introduces: ['prompt log'],
          uses: ['placeholder', 'prompt', 'company switch', 'ledger line', 'cited-line check'],
          example: {
            mono: true,
            text:
              'Prompt   Ledger lines: [ck4821ab] ... FIRM_2 ... PERSON_1 ...\n' +
              '         Question: Why is PERSON_1’s invoice from FIRM_2 held?\n' +
              'Answer   FIRM_2’s invoice for PERSON_1 is held [ck4821ab].\n' +
              'Note     An answer that cited no line is kept here, marked “not shown”.',
          },
          tryIt: {
            prompt: 'A prompt reaches the log with a real name still in it. What does the log keep for that text? Type one word.',
            starter: '',
            rules: [{ kind: 'equals', value: 'withheld', says: 'The log refuses to keep an unmasked text.' }],
            expected: 'Withheld. The entry stays, and the unmasked text does not.',
          },
          exercise: {
            question: 'The model wrote an answer that cited no line, so the user never saw it. Is it in the prompt log?',
            choices: ['No, it is deleted', 'Yes, masked and marked as not shown', 'Yes, with real names'],
            correctIndex: 1,
            reason: 'The company can audit everything the model wrote, shown or not.',
          },
          video: null,
        },
        {
          key: 'it-2-6-5',
          title: 'The model describes; it never acts',
          intro:
            'On the screen, typing “Approve 1” draws a card with Yes and Not now. The model did not draw it. ' +
            'Behind the screen, a rule read the words and prepared the card, and a person’s yes goes to the one approval route. ' +
            'Free text that asks the model to do something gets one fixed sentence. ' +
            'This is describe, never act: the model reads and explains, and a person decides.',
          introduces: ['describe, never act'],
          uses: ['model', 'rule', 'permission', 'reply'],
          example: {
            mono: true,
            text:
              'Free text   Please go ahead and settle that one for me.\n' +
              'The model   I cannot do that; ask the person whose job it is.',
          },
          tryIt: {
            prompt: 'Free text asks the model to send a bill. Type the fixed sentence the model is told to answer with.',
            starter: 'I cannot ',
            rules: [
              { kind: 'contains', value: 'cannot do that', says: 'It refuses the act.' },
              { kind: 'containsAny', values: ['ask the person', 'whose job'], says: 'It sends the user to the person whose job it is.' },
            ],
            expected: 'The model stays a reader. The next level builds the step that plans and acts, with a person’s yes.',
          },
          exercise: {
            question: 'Who approves a timesheet in Ask Etyme?',
            choices: ['The model, when it is confident', 'A person, by pressing Yes on a card', 'Nobody; it approves itself'],
            correctIndex: 1,
            reason: 'The model is never the gate; a person’s yes goes through the approval route.',
          },
          video: null,
        },
      ],
    },
  ],
  project: {
    key: 'it-medium-project',
    title: 'Trace one answer from the question to the entry',
    checklist: [
      'Wrote one question the record can answer, in a recruiter’s or an AP clerk’s words',
      'Said whether a rule answers it, or it goes on to the model',
      'Wrote two ledger lines the lookup would hand over, each with an id',
      'Masked every name and figure in the question and the lines with placeholders',
      'Wrote the model’s answer with a citation to one of the two ids',
      'Ran the cited-line check by hand and said whether the answer is shown',
      'Wrote the reply the user reads when no line matches',
      'Named one question that is off the record, and the sentence that refuses it',
      'Named one thing a second role at the firm may not read, and where the filter sits',
      'Listed what the prompt log keeps for this one question',
    ],
  },
}

/** For each try-it: one input its rules accept and one they refuse. Read by the content test, and by a hint later. */
export const MEDIUM_TRY_SAMPLES: Record<string, { right: string; wrong: string }> = {
  'it-2-4-1': { right: 'First, the system looks up the holiday list document.', wrong: 'First, the system replies from what it remembers.' },
  'it-2-4-2': { right: '2', wrong: '3' },
  'it-2-4-3': { right: 'Handbook, section 4', wrong: 'Chunk three' },
  'it-2-4-4': { right: 'Your manager approves the week by Wednesday [handbook-4].', wrong: 'Your manager approves the week by Wednesday.' },
  'it-2-4-5': { right: 'I cannot answer that yet. Ask HR for the work location policy.', wrong: 'Yes, you can work from any country.' },
  'it-2-5-1': { right: 'Which weeks are unsigned?', wrong: 'What is the tallest mountain?' },
  'it-2-5-2': { right: 'Who is near the time limit?', wrong: 'Tell me something interesting.' },
  'it-2-5-3': { right: 'ck4821ab', wrong: 'inv-204' },
  'it-2-5-4': { right: 'The invoice receipt is held; the hours differ [ck4821ab].', wrong: 'The invoice receipt is held [zz999999] for now.' },
  'it-2-5-5': { right: 'What is the weather tomorrow?', wrong: 'Which weeks are unsigned?' },
  'it-2-6-1': { right: 'NO_KEY', wrong: 'ON' },
  'it-2-6-2': { right: 'PERSON_1 bills through FIRM_2.', wrong: 'PERSON_1 Shah bills through FIRM_2.' },
  'it-2-6-3': { right: 'Etyme never shows a firm’s margin to anybody else; your dashboard shows what you pay.', wrong: 'The margin is eighteen percent.' },
  'it-2-6-4': { right: 'withheld', wrong: 'everything' },
  'it-2-6-5': { right: 'I cannot do that; ask the person whose job it is.', wrong: 'Done, the bill is sent.' },
}

const BOX = 'font-family="Inter, sans-serif" font-size="13" fill="#1F1E1D"'

/**
 * Original pictures for two lessons, drawn in the brand kit's tokens. The
 * lesson page has no picture slot yet; they are keyed by lesson so the
 * page can mount them when it has one. No motion, so nothing to switch off.
 */
export const MEDIUM_PICTURES: Record<string, { alt: string; svg: string }> = {
  'it-2-4-1': {
    alt: 'A question goes to the document lookup, the lookup hands a document to the model, and the model writes the reply.',
    svg:
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 96" role="img">` +
      ['Question', 'Document lookup', 'Model reads it', 'Reply'].map((t, i) =>
        `<rect x="${8 + i * 160}" y="24" width="136" height="48" rx="10" fill="${i === 1 ? '#E6F2E6' : '#FBFAF7'}" stroke="${i === 1 ? '#4F6F52' : '#E3DFD5'}"/>` +
        `<text x="${76 + i * 160}" y="53" text-anchor="middle" ${BOX}>${t}</text>` +
        (i < 3 ? `<path d="M${146 + i * 160} 48h18m-6-5 6 5-6 5" fill="none" stroke="#6B6862" stroke-width="1.5"/>` : '')).join('') +
      `</svg>`,
  },
  'it-2-6-2': {
    alt: 'Real names are swapped for placeholders before the text leaves the company, and put back when the answer returns.',
    svg:
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 150" role="img">` +
      `<rect x="8" y="8" width="300" height="134" rx="12" fill="#FBFAF7" stroke="#E3DFD5"/>` +
      `<text x="24" y="32" ${BOX} font-weight="600">Inside your company</text>` +
      `<text x="24" y="66" ${BOX}>Priya Shah · Pinnacle Resourcing</text>` +
      `<text x="24" y="120" ${BOX}>Priya Shah · Pinnacle Resourcing</text>` +
      `<line x1="324" y1="8" x2="324" y2="142" stroke="#C0622E" stroke-dasharray="4 4"/>` +
      `<rect x="340" y="8" width="292" height="134" rx="12" fill="#E7E4DA" stroke="#E3DFD5"/>` +
      `<text x="356" y="32" ${BOX} font-weight="600">What the model reads</text>` +
      `<text x="356" y="93" font-family="IBM Plex Mono, monospace" font-size="13" fill="#1F1E1D">PERSON_1 · FIRM_2</text>` +
      `<path d="M250 62h96m-6-5 6 5-6 5" fill="none" stroke="#6B6862" stroke-width="1.5"/>` +
      `<path d="M346 116h-96m6-5-6 5 6 5" fill="none" stroke="#6B6862" stroke-width="1.5"/>` +
      `</svg>`,
  },
}
