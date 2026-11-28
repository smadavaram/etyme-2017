import type { Level } from './types'

/**
 * IT — Upgrade, level 3: Complex (chapters 7 to 9). The Simple level built
 * agent, skill and agentic in plain words; this level goes deeper. An
 * agent up close: its switch, its task, its plan, its act and its check;
 * then tools, approvals and what stays
 * with a person; then the ledger, the meter and what happens when a step
 * fails. It also holds the recap that closes the track.
 *
 * Every screen described here is read from the code as it stands:
 * `app/dashboard/decisions/agents` (Agent control: the switch, Actions
 * today, Meter, Cap, Tasks, and the performance panel's Planned and
 * Actual), `lib/agents/switch`, `lib/agents/tasks` (one yes a task, the
 * plan in words), `lib/skills/registry` and `lib/skills/runner` (the skills,
 * and the acts the lessons call tools), `lib/skills/checker` and `lib/skills/grade` (the
 * check), `app/dashboard/twin` and `lib/twin/role-contract` (the three
 * columns and the floor), `lib/twin/ledger` (no act without an entry, the
 * one approval route, nobody approves their own), `lib/skills/meter` and
 * `lib/model-gateway/call` (tiers, the next model in the same tier, one
 * move from low to high, then a person). A lesson that claims more than
 * those files do is a bug.
 */

/** Terms the Simple and Medium levels build and this level uses. */
export const COMPLEX_BUILDS_ON: readonly string[] = [
  'Etyme', 'routine step', 'agent', 'record', 'timesheet', 'approval', 'skill', 'model', 'rule', 'permission', 'describe, never act',
]

/** The order this level builds its own terms in: one new idea a lesson. */
export const COMPLEX_GLOSSARY: readonly string[] = [
  'agent switch', 'task', 'plan', 'act', 'check',
  'tool', 'role contract', 'approval route', 'segregation of duties', 'floor',
  'ledger entry', 'model tier', 'meter', 'fallback', 'escalation',
]

export const IT_UPGRADE_COMPLEX: Level = {
  key: 'complex',
  title: 'Complex',
  chapters: [
    {
      key: 'it-ch7-an-agent-plan-act-check',
      title: 'An agent up close: plan, act, check',
      lessons: [
        {
          key: 'it-3-7-1',
          title: 'Every agent has a switch',
          intro:
            'On the screen, the page named Agent control lists the firm’s agents by name, each with a switch: Off, Drafts only or On. ' +
            'Behind the screen, each one is the helper you met in the Simple level, doing a routine step inside rules a person set. ' +
            'The agent switch says how far it may go. ' +
            'Each one starts at Off, and only the firm’s Owner changes that. ' +
            'Technical note: at Drafts only, it prepares its work and sends nothing.',
          introduces: ['agent switch'],
          uses: ['routine step', 'agent', 'timesheet', 'rule'],
          example: {
            mono: true,
            text:
              'Agent control\n\n' +
              'Agent              Switch        Actions today\n' +
              'Timesheet chase    On            3\n' +
              'Match ranker       Drafts only   0\n' +
              'Payroll draft      Off           0',
          },
          tryIt: {
            prompt: 'The Owner wants Timesheet chase to prepare its reminders and send nothing. Type the switch state: Off, Drafts only or On.',
            starter: '',
            rules: [{ kind: 'equals', value: 'Drafts only', says: 'It prepares the work and holds every send.' }],
            expected: 'Drafts only. The agent prepares, and a person sees the work before anything leaves.',
          },
          exercise: {
            question: 'A new firm signs up. What state is every agent in?',
            choices: ['On, from the first day', 'Off, until the Owner switches it on', 'Drafts only, for the first week'],
            correctIndex: 1,
            reason: 'An agent is off until the Owner says otherwise, so nothing runs by surprise.',
          },
          video: null,
        },
        {
          key: 'it-3-7-2',
          title: 'A task: one piece of work, about one record',
          intro:
            'On the screen, Agent control has a panel named Tasks. ' +
            'Behind the screen, a task is one piece of an agent’s work, about one record. ' +
            'A late timesheet is one task, and a second late timesheet is another. ' +
            'Each task asks one person for one yes before anything is sent. ' +
            'Technical note: nothing carries from one task to the next.',
          introduces: ['task'],
          uses: ['record', 'timesheet', 'agent'],
          example: {
            mono: true,
            text:
              'Tasks\n' +
              'Each asks for one yes. One yes releases the whole task; a new task asks again.\n\n' +
              '  Priya Shah has not filed last week      Waiting for a yes from Mara Lindqvist\n' +
              '  Daniel Okoro has not filed last week    Running, 1 sent',
          },
          tryIt: {
            prompt: 'Three consultants have not filed last week’s hours. How many tasks does the agent open? Type the number.',
            starter: '',
            rules: [{ kind: 'equals', value: '3', says: 'Each late week is its own task.' }],
            expected: 'Three. Each late week is its own task, with its own yes.',
          },
          exercise: {
            question: 'A person said yes to one task yesterday. Today the agent has a new task of the same kind. What happens?',
            choices: ['It runs on yesterday’s yes', 'It asks again', 'It is deleted'],
            correctIndex: 1,
            reason: 'A yes belongs to one task and never carries across to another.',
          },
          video: null,
        },
        {
          key: 'it-3-7-3',
          title: 'The plan: what a yes releases',
          intro:
            'On the screen, each task shows its plan in plain words before anybody says yes. ' +
            'Behind the screen, a plan lists the letters the agent may send, how many times, and what closes the task. ' +
            'A yes releases that plan and nothing more. ' +
            'Technical note: a send outside the approved plan is refused, even after a yes.',
          introduces: ['plan'],
          uses: ['timesheet', 'agent', 'task'],
          example: {
            mono: true,
            text:
              'By default, a plan reads:\n' +
              'If you say yes, the agent sends “Timesheet reminder”.\n' +
              'Each may be sent again up to 2 times, 2 working days apart.\n' +
              'It closes the task when the week is filed.\n' +
              'Anything more is a new task and asks you again.',
          },
          tryIt: {
            prompt: 'A plan allows one letter and two retries. What is the most times that letter can be sent? Type the number.',
            starter: '',
            rules: [{ kind: 'equals', value: '3', says: 'It counts the first send and both retries.' }],
            expected: 'Three: the first send, then two retries. A fourth needs a new task and a new yes.',
          },
          exercise: {
            question: 'The week is filed after the first reminder. What does the agent do with the two retries it has left?',
            choices: ['Sends them anyway', 'Nothing; the task closes', 'Saves them for another task'],
            correctIndex: 1,
            reason: 'The plan says what closes the task, and a closed task sends nothing.',
          },
          video: null,
        },
        {
          key: 'it-3-7-4',
          title: 'The act: one thing done, and written down',
          intro:
            'On the screen, Agent control counts “Actions today” beside each agent. ' +
            'Behind the screen, each thing an agent does to the record is an act: a letter sent, a draft written, a question raised. ' +
            'This is the step past describe, never act, and it comes only after a yes. ' +
            'Every act is written down as it happens, with the agent’s name and the version of its rules. ' +
            'Technical note: the agent writes only through one door, so no act goes unrecorded.',
          introduces: ['act'],
          uses: ['record', 'timesheet', 'rule', 'describe, never act', 'agent', 'task', 'plan'],
          example: {
            mono: true,
            text:
              'plan   send “Timesheet reminder”, then up to 2 retries\n' +
              'yes    one person approved the task\n' +
              'act    the reminder is sent to Priya Shah\n' +
              'act    the task is closed when her week is filed',
          },
          tryIt: {
            prompt: 'The agent sent a reminder to Priya. Write the act as one short line: what was done, and to whom.',
            starter: 'The agent ',
            rules: [
              { kind: 'containsAny', values: ['sent', 'reminded'], says: 'It says what was done.' },
              { kind: 'contains', value: 'priya', says: 'It names who it was done to.' },
              { kind: 'maxWords', value: 10, says: 'It is one short line.' },
            ],
            expected: 'One act, in words a person can read later.',
          },
          exercise: {
            question: 'What is the difference between a plan and an act?',
            choices: ['A plan is what may happen; an act is what did happen', 'They are two names for one thing', 'An act comes first, and the plan is written after it'],
            correctIndex: 0,
            reason: 'A plan is approved before anything is done, and an act is one thing done under it.',
          },
          video: null,
        },
        {
          key: 'it-3-7-5',
          title: 'The check: read the record again',
          intro:
            'On the screen, an agent’s performance line shows Planned beside Actual. ' +
            'Behind the screen, Planned is the agent’s own count, and Actual comes from a check. ' +
            'A check is a second piece of code that reads the record again and compares. ' +
            'It is never handed the agent’s own report. ' +
            'Technical note: where it cannot read, the line says “Not graded”, never a pass.',
          introduces: ['check'],
          uses: ['record', 'agent', 'plan', 'act'],
          example: {
            mono: true,
            text:
              'plan    3 reminders planned                       Planned 3\n' +
              'act     the agent reports 3 sent\n' +
              'check   the record shows 3 letters   -> PASS      Actual 3\n\n' +
              'check   the record shows 2 letters   -> FAIL      Actual 2\n' +
              'check   the record cannot be read    -> UNKNOWN   Not graded',
          },
          tryIt: {
            prompt: 'The agent reports 5 reminders sent. The check finds 4 letters on the record. Type the verdict: PASS, FAIL or UNKNOWN.',
            starter: '',
            rules: [{ kind: 'equals', value: 'FAIL', says: 'The report and the record do not agree.' }],
            expected: 'FAIL. Actual reads 4, because the record wins over the report.',
          },
          exercise: {
            question: 'Why is the check never handed the agent’s own report?',
            choices: ['To save time', 'So it cannot grade from what the agent says about itself', 'Because the report is secret'],
            correctIndex: 1,
            reason: 'A check that reads the report only repeats the agent, so it reads the record instead.',
          },
          video: null,
        },
      ],
    },
    {
      key: 'it-ch8-tools-approvals-and-a-person',
      title: 'Tools, approvals, and what stays with a person',
      lessons: [
        {
          key: 'it-3-8-1',
          title: 'Tools: what an agent is able to do',
          intro:
            'On the screen, you see only what an agent did: a draft, a letter, a question for a person. ' +
            'Behind the screen, each of those is done with a tool. ' +
            'A tool is one named ability, such as read, draft, raise a question, write a row or send. ' +
            'Each skill lists the tools it may use, and anything else is refused. ' +
            'Technical note: in Etyme’s code, a skill is a row of data that names its tools.',
          introduces: ['tool'],
          uses: ['Etyme', 'timesheet', 'skill', 'model', 'agent', 'task'],
          example: {
            mono: true,
            text:
              'Timesheet chase has three skills, and each lists its tools\n' +
              '  propose a chase task      reads, writes a row, raises a question\n' +
              '  send an approved letter   reads, sends\n' +
              '  close on arrival          reads, writes a row\n\n' +
              'No skill has a tool that\n' +
              '  moves money, signs, awards, extends or ends a placement,\n' +
              '  decides about a person, or publishes compliance wording',
          },
          tryIt: {
            prompt: 'The skill “send an approved letter” lists two tools. One is “reads”. Type the other.',
            starter: '',
            rules: [
              { kind: 'contains', value: 'send', says: 'It names the second tool on that skill’s list.' },
              { kind: 'maxWords', value: 2, says: 'It names one tool.' },
            ],
            expected: 'Sends. That skill reads and sends, and paying is on no skill’s list.',
          },
          exercise: {
            question: 'A skill tries to use a tool that is not on its list. What happens?',
            choices: ['It runs, with a warning', 'It is refused before anything runs', 'It asks the model to decide'],
            correctIndex: 1,
            reason: 'Code reads the list before the step starts, so nothing outside it runs.',
          },
          video: null,
        },
        {
          key: 'it-3-8-2',
          title: 'The role contract: three columns',
          intro:
            'On the screen, a page shows three columns: Acts alone, Needs approval and Never touches. ' +
            'Behind the screen, that page is the role contract. ' +
            'It puts every act of the company’s main agent in exactly one column. ' +
            'A change is saved as a new version with a reason, and the old version stays. ' +
            'Technical note: code reads the columns as a plain list, and no model is asked.',
          introduces: ['role contract'],
          uses: ['Etyme', 'approval', 'model', 'rule', 'agent', 'act'],
          example: {
            mono: true,
            text:
              'What the twin may do        (Etyme names this agent a twin)\n\n' +
              'Acts alone       Reversible or tell-only, inside the company, within a rule.\n' +
              'Needs approval   Money, anything that leaves the company, anything that cannot be put back.\n' +
              'Never touches    Stays with a person. Some acts are here whatever the contract says.',
          },
          tryIt: {
            prompt: 'Drafting a bill stays inside the firm. Sending it leaves the company. Type the column that sending belongs in.',
            starter: '',
            rules: [{ kind: 'equals', value: 'Needs approval', says: 'Anything that leaves the company asks a person first.' }],
            expected: 'Needs approval. The agent may draft the bill alone, and a person says yes before it is sent.',
          },
          exercise: {
            question: 'A company wants to move “remind a colleague” from Acts alone to Needs approval. May it?',
            choices: ['Yes; a company may tighten any act', 'No; the columns are fixed', 'Only Etyme’s staff may'],
            correctIndex: 0,
            reason: 'A company may always make its role contract stricter than the one it started with.',
          },
          video: null,
        },
        {
          key: 'it-3-8-3',
          title: 'One approval route for every yes',
          intro:
            'On the screen, an act that needs approval appears as a card with Yes and Not now. ' +
            'Behind the screen, the agent has stopped and is waiting. ' +
            'A person’s yes goes to one place, the approval route, whether it comes from the web, Teams or the chat. ' +
            'The route reads the record again before it does anything. ' +
            'Technical note: a card answered twice replies “Somebody has already answered this.”',
          introduces: ['approval route'],
          uses: ['record', 'approval', 'permission', 'agent', 'act'],
          example: {
            mono: true,
            text:
              'Card      Send bill INV-1042?          [ Yes ]  [ Not now ]\n\n' +
              'Yes       -> the approval route\n' +
              '             1  does this person hold the permission?\n' +
              '             2  does the record still say the same?\n' +
              '             3  do it and write it down, together or not at all\n' +
              'Not now   -> Kept waiting. Nothing changed.',
          },
          tryIt: {
            prompt: 'A person presses Yes on a card drawn two days ago. What does the approval route do before anything else? Finish the sentence.',
            starter: 'First, the route ',
            rules: [
              { kind: 'containsAny', values: ['record again', 'reads the record', 'read the record', 'reads it again', 'looks at the record'], says: 'It reads the record again before it does anything.' },
              { kind: 'minWords', value: 6, says: 'It is a whole sentence.' },
            ],
            expected: 'Right. A yes on Monday’s reading is not a yes on Friday’s.',
          },
          exercise: {
            question: 'Who may press Yes on a card?',
            choices: ['Anybody at the company', 'A person who holds the permission that act needs', 'The agent, if nobody answers within a day'],
            correctIndex: 1,
            reason: 'The route refuses a yes from a person who lacks the permission for that act.',
          },
          video: null,
        },
        {
          key: 'it-3-8-4',
          title: 'Nobody approves their own',
          intro:
            'On the screen, a card never goes to the person who asked for the thing it decides. ' +
            'Behind the screen, the rule is segregation of duties: nobody approves their own work. ' +
            'An agent that asked a question may never answer it. ' +
            'The person the agent acts for may not answer it either, while somebody else at the firm can. ' +
            'Technical note: each refusal is written down, with the rule named.',
          introduces: ['segregation of duties'],
          uses: ['Etyme', 'rule', 'agent', 'act'],
          example: {
            mono: true,
            text:
              'The agent drafted a bill, asked “Send it?”, and is then told to answer its own question.\n\n' +
              'Ask Etyme asked for this itself, so it cannot be the one to approve it.\n' +
              'The person who decides it does.',
          },
          tryIt: {
            prompt: 'An agent drafted a bill, then asked “Send it?”. Who may answer? Type one word: agent or person.',
            starter: '',
            rules: [{ kind: 'equals', value: 'person', says: 'The one that asks is never the one that answers.' }],
            expected: 'A person. The one that asks is never the one that answers.',
          },
          exercise: {
            question: 'Why may an agent not approve its own draft?',
            choices: ['It is too slow', 'Then one party would both ask and decide, and nobody would review it', 'Drafts are always wrong'],
            correctIndex: 1,
            reason: 'Two different parties must ask and decide, or nobody has reviewed the work.',
          },
          video: null,
        },
        {
          key: 'it-3-8-5',
          title: 'The floor: what an agent may never do',
          intro:
            'On the screen, some acts sit under Never touches and cannot be moved out. ' +
            'Behind the screen, those acts are the floor: no saved role contract moves them. ' +
            'The floor holds releasing payroll, signing, and every decision about a person’s placement. ' +
            'Any other act that moves money always needs a person’s yes. ' +
            'Technical note: the floor is read first, before any saved role contract.',
          introduces: ['floor'],
          uses: ['Etyme', 'model', 'agent', 'act', 'role contract'],
          example: {
            mono: true,
            text:
              'Always with a person\n' +
              '  Release a payroll run.\n' +
              '  Sign an agreement, an order or a contract on the company’s behalf.\n' +
              '  Choose who is placed on a job.\n' +
              '  Turn a candidate down.\n' +
              '  End somebody’s placement.\n' +
              '  Extend somebody’s placement past its end date.\n' +
              '  Read another company’s data.\n\n' +
              'An Owner tries to move one out\n' +
              '  Release a payroll run stays with a person, whatever the contract says.\n\n' +
              'The agent is asked to do one anyway\n' +
              '  Ask Etyme may not release a payroll run. Its role contract keeps that with a person,\n' +
              '  so it is on their list instead.',
          },
          tryIt: {
            prompt: 'Name one act that stays with a person, whatever the role contract says.',
            starter: '',
            rules: [
              { kind: 'containsAny', values: ['payroll', 'sign', 'place', 'award', 'reject', 'turn a candidate down', 'extend', 'another company'], says: 'It is an act on the floor.' },
              { kind: 'maxWords', value: 12, says: 'It names one act, in a few words.' },
            ],
            expected: 'That one stays with a person. The agent can put it on their list, and nothing more.',
          },
          exercise: {
            question: 'A model writes a very convincing reason for the agent to release payroll. What happens?',
            choices: ['The agent releases it', 'The agent is refused, whatever the reason says', 'The agent asks the model a second time'],
            correctIndex: 1,
            reason: 'The floor is a plain list read by code, so no wording changes the answer.',
          },
          video: null,
        },
      ],
    },
    {
      key: 'it-ch9-ledger-meter-and-failure',
      title: 'The ledger, the meter, and when a step fails',
      lessons: [
        {
          key: 'it-3-9-1',
          title: 'No act without a ledger entry',
          intro:
            'On the screen, a table named “What the twin did” lists every act, with its outcome, authority, rule and reason. ' +
            'Behind the screen, each row is a ledger entry, and the agent cannot act without writing one. ' +
            'A refusal gets one too. ' +
            'Technical note: the act and its ledger entry are saved together, so both stand or neither does.',
          introduces: ['ledger entry'],
          uses: ['record', 'rule', 'agent', 'act', 'role contract'],
          example: {
            mono: true,
            text:
              'What happened   Told the AP clerk that an invoice receipt and the accepted hours do not agree\n' +
              'Outcome         Done\n' +
              'Authority       Program Manager\n' +
              'Tier            Acts alone   (its column in the role contract)\n' +
              'Rule            Hours differ by more than 0.5%\n' +
              'Reason          The receipt bills 42 hours, and 40 were accepted.\n\n' +
              'Outcomes: Done · Asked a person · Refused · Said no · Overtaken',
          },
          tryIt: {
            prompt: 'The agent was refused when it tried to end a placement. Its ledger entry carries one outcome word. Type it.',
            starter: '',
            rules: [{ kind: 'equals', value: 'Refused', says: 'A refusal is written down like any other outcome.' }],
            expected: 'Refused. What the agent was stopped from doing is on the record too.',
          },
          exercise: {
            question: 'The ledger cannot be written at the moment an agent acts. What happens to the act?',
            choices: ['It is done, and logged later', 'It is not done', 'It is done twice'],
            correctIndex: 1,
            reason: 'The act and its ledger entry are one save, so a failed entry undoes the act.',
          },
          video: null,
        },
        {
          key: 'it-3-9-2',
          title: 'Model tiers: rules first, then low, then high',
          intro:
            'On the screen, an agent’s performance line counts its calls three ways: Rules, Low tier and High tier. ' +
            'Behind the screen, each step names a model tier and never a model. ' +
            'Rules means no model at all, and it is always tried first. ' +
            'Low is the everyday tier, and high is kept for answers the low one got wrong. ' +
            'Technical note: tax IDs, bank details and social security numbers reach no model at any tier.',
          introduces: ['model tier'],
          uses: ['model', 'rule', 'agent', 'check'],
          example: {
            mono: true,
            text:
              'Step                        Model tier\n' +
              'Count active companies      rules   no model; plain code\n' +
              'Rank who matches a job      low     may move to high once\n' +
              'Read a W-9                  rules   never a model: it holds a tax ID',
          },
          tryIt: {
            prompt: 'A step must read a voided check, which shows bank details. Type the model tier it may use: rules, low or high.',
            starter: '',
            rules: [{ kind: 'equals', value: 'rules', says: 'Bank details reach no model.' }],
            expected: 'Rules. Bank details reach no model, so plain code or a person reads that paper.',
          },
          exercise: {
            question: 'Why does a step name a model tier and not a model?',
            choices: ['Model names are secret', 'So the model behind a tier can change without rewriting the step', 'Tiers are faster to type'],
            correctIndex: 1,
            reason: 'The model is a setting, so swapping it changes no step and no rule.',
          },
          video: null,
        },
        {
          key: 'it-3-9-3',
          title: 'The meter and the daily cap',
          intro:
            'On the screen, Agent control shows each agent’s count for today, such as “3 of 10 today”. ' +
            'Behind the screen, a meter does the counting: acts by agent, and calls by tool and by model tier. ' +
            'It holds counts only. ' +
            'The 10 is a daily cap the Owner may set, and none is set at the start. ' +
            'Technical note: at the cap the agent stops cleanly and writes one line that says so.',
          introduces: ['meter'],
          uses: ['record', 'timesheet', 'model', 'rule', 'agent', 'act', 'tool', 'model tier'],
          example: {
            mono: true,
            text:
              'Agent              Meter        Cap\n' +
              'Timesheet chase    3 actions    3 of 10 today\n' +
              'Match ranker       2 actions    2 today · no cap\n\n' +
              'At the cap\n' +
              'Timesheet chase reached its cap of 10 for today, so it stopped.\n' +
              'It starts again tomorrow, or when the Owner raises the cap.',
          },
          tryIt: {
            prompt: 'An agent has a cap of 10 and has done 10 acts today. An eleventh is due. Type one word: stops or continues.',
            starter: '',
            rules: [{ kind: 'equals', value: 'stops', says: 'At the cap, the agent does no more today.' }],
            expected: 'It stops, says so on the record, and starts again tomorrow.',
          },
          exercise: {
            question: 'What is a daily cap for?',
            choices: ['To make the agent slower', 'To bound how much an agent does in a day if something goes wrong', 'To hide the agent’s work'],
            correctIndex: 1,
            reason: 'A cap bounds the damage a faulty rule can do before a person looks.',
          },
          video: null,
        },
        {
          key: 'it-3-9-4',
          title: 'Fallback: the next model in the same tier',
          intro:
            'On the screen, the user notices nothing when one model is down. ' +
            'Behind the screen, the call moves to the next model in the same model tier. ' +
            'That move is a fallback, and it is recorded with the model it came from. ' +
            'It never drops to a lower model tier to get an answer. ' +
            'Technical note: with no model set up at all, nothing is sent and the rules answer.',
          introduces: ['fallback'],
          uses: ['Etyme', 'model', 'rule', 'model tier'],
          example: {
            mono: true,
            text:
              'Low tier, model A   -> timed out\n' +
              'Low tier, model B   -> answered        counted under Fallback, from A\n\n' +
              'No model set up\n' +
              'Not configured: no model is set up for this kind of data, so nothing was sent. The rules answer.',
          },
          tryIt: {
            prompt: 'Model A in the low tier fails. Where does the call go next? Finish the sentence.',
            starter: 'It goes to ',
            rules: [
              { kind: 'containsAny', values: ['next model', 'another model', 'model b', 'second model'], says: 'It tries another model.' },
              { kind: 'containsAny', values: ['same tier', 'same model tier', 'low tier', 'in the low'], says: 'It stays in the same model tier.' },
            ],
            expected: 'Same tier, next model, and the move is written down.',
          },
          exercise: {
            question: 'No model is set up for a company. A user asks Ask Etyme which weeks are unsigned. What happens?',
            choices: ['An error page', 'The rules answer, and nothing is sent to a model', 'The question waits until a model is added'],
            correctIndex: 1,
            reason: 'Rules come first, so a missing model never blocks the work.',
          },
          video: null,
        },
        {
          key: 'it-3-9-5',
          title: 'Escalation: once to the high tier, then a person',
          intro:
            'On the screen, a card sometimes asks a person to finish what a model could not. ' +
            'Behind the screen, the answer from the low tier failed its check. ' +
            'The step is asked once more on the high tier, and that move is an escalation. ' +
            'A second failure is never passed on as an answer. ' +
            'Technical note: it becomes a FAIL line and a card for a person.',
          introduces: ['escalation'],
          uses: ['record', 'model', 'check'],
          example: {
            mono: true,
            text:
              'Low tier    the answer fails its check\n' +
              'High tier   asked once more           counted under Escalated, from low\n' +
              '  passes -> the answer is used\n' +
              '  fails  -> FAIL on the record, and a card for a person\n\n' +
              'Never: a third try, or a failed answer shown as if it passed',
          },
          tryIt: {
            prompt: 'An answer fails its check on the low tier, then fails again on the high tier. Who gets it next? Type one word.',
            starter: '',
            rules: [
              { kind: 'containsAny', values: ['person', 'human'], says: 'After two failures, a person decides.' },
              { kind: 'maxWords', value: 3, says: 'It is one or two words.' },
            ],
            expected: 'A person. The system stops trying and says plainly that it failed.',
          },
          exercise: {
            question: 'How many times may one step make an escalation?',
            choices: ['Once', 'Until the answer passes', 'Never'],
            correctIndex: 0,
            reason: 'One move from low to high is allowed, and after that a person decides.',
          },
          video: null,
        },
      ],
    },
  ],
  project: {
    key: 'it-complex-project',
    title: 'Run one task by hand, from the plan to the ledger',
    checklist: [
      'Picked one routine step at a firm and named the agent that would do it',
      'Wrote one task for it, about one record',
      'Wrote the plan in plain words: what is sent, how many times, and what closes the task',
      'Listed the tools the agent needs, and one tool it must never have',
      'Put each act in a column of a role contract: Acts alone, Needs approval or Never touches',
      'Named one act on the floor, and wrote the sentence that refuses it',
      'Drew the card a person answers, and named the permission that person needs',
      'Said who may not answer the card, by segregation of duties',
      'Wrote the ledger entry for one act and for one refusal',
      'Wrote the check that reads the record again, and its verdict',
      'Chose a model tier for each step, with rules first',
      'Said what happens at the daily cap, on a fallback and after an escalation',
    ],
  },
}

/**
 * The recap that closes the track: each line of "What you will be good at"
 * (the Simple level's file holds the list), with where the learner did it.
 * The content test holds the two lists to the same lines in the same order.
 */
export const IT_UPGRADE_RECAP: { goodAt: string; youDid: string }[] = [
  {
    goodAt: 'Explain how a client, a staffing firm and a consultant work on one job',
    youDid: 'You named the three parties on one job and said what each one does.',
  },
  {
    goodAt: 'File a week of hours and follow it to pay day',
    youDid: 'You filed a week of hours and saw who approves it before it is paid.',
  },
  {
    goodAt: 'Write a clear request to a chatbot and check what comes back',
    youDid: 'You wrote prompts that name the task and the reader. You checked each reply before you trusted it.',
  },
  {
    goodAt: 'Find the answer to a question in your firm’s own documents',
    youDid: 'You traced one answer from the question, through the document lookup, to the line it cites.',
  },
  {
    goodAt: 'Say what software may do alone and what needs a person’s yes',
    youDid: 'You sorted an agent’s acts into three columns. You named what stays with a person: paying people, signing, and decisions about a person.',
  },
]

/** For each try-it: one input its rules accept and one they refuse. Read by the content test, and by a hint later. */
export const COMPLEX_TRY_SAMPLES: Record<string, { right: string; wrong: string }> = {
  'it-3-7-1': { right: 'Drafts only', wrong: 'On' },
  'it-3-7-2': { right: '3', wrong: '1' },
  'it-3-7-3': { right: '3', wrong: '2' },
  'it-3-7-4': { right: 'The agent sent a timesheet reminder to Priya.', wrong: 'The agent will think about it.' },
  'it-3-7-5': { right: 'FAIL', wrong: 'PASS' },
  'it-3-8-1': { right: 'Sends', wrong: 'Pays' },
  'it-3-8-2': { right: 'Needs approval', wrong: 'Acts alone' },
  'it-3-8-3': { right: 'First, the route reads the record again.', wrong: 'First, the route sends the bill at once.' },
  'it-3-8-4': { right: 'person', wrong: 'agent' },
  'it-3-8-5': { right: 'Release a payroll run', wrong: 'Remind a colleague' },
  'it-3-9-1': { right: 'Refused', wrong: 'Done' },
  'it-3-9-2': { right: 'rules', wrong: 'low' },
  'it-3-9-3': { right: 'stops', wrong: 'continues' },
  'it-3-9-4': { right: 'It goes to the next model in the same tier.', wrong: 'It goes to the high tier at once.' },
  'it-3-9-5': { right: 'A person', wrong: 'The model' },
}

const TXT = 'font-family="Inter, sans-serif" font-size="13" fill="#1F1E1D"'
const ARROW = 'fill="none" stroke="#6B6862" stroke-width="1.5"'

/**
 * Original pictures for three lessons, drawn in the brand kit's tokens. The
 * lesson page has no picture slot yet; they are keyed by lesson so the page
 * can mount them when it has one. No motion, so nothing to switch off.
 */
export const COMPLEX_PICTURES: Record<string, { alt: string; svg: string }> = {
  'it-3-7-5': {
    alt: 'Four steps in a row: the plan, a person’s yes, the act, and the check that reads the record again.',
    svg:
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 96" role="img">` +
      ['Plan', 'A person’s yes', 'Act', 'Check'].map((t, i) =>
        `<rect x="${8 + i * 160}" y="24" width="136" height="48" rx="10" fill="${i === 1 ? '#E6F2E6' : '#FBFAF7'}" stroke="${i === 1 ? '#4F6F52' : '#E3DFD5'}"/>` +
        `<text x="${76 + i * 160}" y="53" text-anchor="middle" ${TXT}>${t}</text>` +
        (i < 3 ? `<path d="M${146 + i * 160} 48h18m-6-5 6 5-6 5" ${ARROW}/>` : '')).join('') +
      `</svg>`,
  },
  'it-3-8-2': {
    alt: 'Three columns side by side: acts the agent does alone, acts that need approval, and acts it never touches.',
    svg:
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 150" role="img">` +
      [
        { t: 'Acts alone', a: 'Remind a colleague', b: 'Draft a bill', fill: '#FBFAF7', stroke: '#E3DFD5' },
        { t: 'Needs approval', a: 'Send a bill', b: 'Write to a supplier', fill: '#E6F2E6', stroke: '#4F6F52' },
        { t: 'Never touches', a: 'Release payroll', b: 'Sign an agreement', fill: '#E7E4DA', stroke: '#C0622E' },
      ].map((c, i) =>
        `<rect x="${8 + i * 212}" y="8" width="200" height="134" rx="12" fill="${c.fill}" stroke="${c.stroke}"/>` +
        `<text x="${24 + i * 212}" y="34" ${TXT} font-weight="600">${c.t}</text>` +
        `<text x="${24 + i * 212}" y="74" ${TXT}>${c.a}</text>` +
        `<text x="${24 + i * 212}" y="104" ${TXT}>${c.b}</text>`).join('') +
      `</svg>`,
  },
  'it-3-9-5': {
    alt: 'An answer that fails on the low tier is asked once on the high tier, and a second failure goes to a person.',
    svg:
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 96" role="img">` +
      [
        { t: 'Low tier', fill: '#FBFAF7', stroke: '#E3DFD5' },
        { t: 'High tier, once', fill: '#FBFAF7', stroke: '#E3DFD5' },
        { t: 'A person decides', fill: '#E6F2E6', stroke: '#4F6F52' },
      ].map((c, i) =>
        `<rect x="${8 + i * 216}" y="24" width="184" height="48" rx="10" fill="${c.fill}" stroke="${c.stroke}"/>` +
        `<text x="${100 + i * 216}" y="53" text-anchor="middle" ${TXT}>${c.t}</text>` +
        (i < 2 ? `<path d="M${194 + i * 216} 48h26m-6-5 6 5-6 5" ${ARROW}/><text x="${207 + i * 216}" y="38" text-anchor="middle" font-family="Inter, sans-serif" font-size="11" fill="#B83A3A">fails</text>` : '')).join('') +
      `</svg>`,
  },
}
