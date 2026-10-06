// Task archetypes: a department-independent classification of the *nature* of work.
// Not to be confused with business-model archetypes (pms_archetype_templates: b2b_saas, d2c, ...).
//
// This catalogue is the knowledge base for the playbook generator. `description` and `disambiguation`
// feed the classifier; `guidance` and `typicalShape` feed the step generator for whichever archetypes win.
// Bump TASK_ARCHETYPE_VERSION whenever guidance changes so generations stay comparable.

export const TASK_ARCHETYPE_VERSION = 'v1';

export const ARCHETYPE_GROUPS = [
  'execution_production',
  'communication_relationship',
  'problem_solving',
  'knowledge_work',
  'decision_approval',
  'people_process',
] as const;
export type ArchetypeGroup = (typeof ARCHETYPE_GROUPS)[number];

export const ARCHETYPE_GROUP_LABELS: Record<ArchetypeGroup, string> = {
  execution_production: 'Execution & Production',
  communication_relationship: 'Communication & Relationship',
  problem_solving: 'Problem Solving',
  knowledge_work: 'Knowledge Work',
  decision_approval: 'Decision & Approval',
  people_process: 'People & Process',
};

export const TASK_ARCHETYPE_KEYS = [
  'delivery', 'implementation', 'migration', 'maintenance',
  'outreach', 'follow_up', 'negotiation', 'relationship_nurture', 'escalation',
  'resolution', 'debugging', 'crisis_response',
  'research', 'analysis', 'planning', 'documentation',
  'review', 'audit', 'decision',
  'coordination', 'onboarding', 'delegation', 'hiring', 'training',
] as const;
export type TaskArchetypeKey = (typeof TASK_ARCHETYPE_KEYS)[number];

export interface TaskArchetype {
  key: TaskArchetypeKey;
  label: string;
  group: ArchetypeGroup;
  /** One line, from the product design doc. Shown to the classifier. */
  description: string;
  /** How to tell this apart from its nearest neighbours. Shown to the classifier. */
  disambiguation: string;
  /** What good execution looks like. Shown to the generator when this archetype wins. */
  guidance: string[];
  /** The typical flow, expressed in step types, so the generator picks the right widget per step. */
  typicalShape: string;
}

export const TASK_ARCHETYPES: readonly TaskArchetype[] = [
  // ───────────── Execution & Production ─────────────
  {
    key: 'delivery',
    label: 'Delivery',
    group: 'execution_production',
    description: 'Building, shipping, or producing something tangible.',
    disambiguation: 'There is a concrete artifact or deliverable at the end (a feature, a campaign, a report, a shipment). If the work is configuring existing systems use Implementation; if it is only scoping use Planning.',
    guidance: [
      'Start by pinning the definition of done: what exactly is handed over, to whom, in what format, by when.',
      'Gather inputs and dependencies before producing anything, so the person is not blocked halfway.',
      'Break production into the smallest shippable slices and order them so something usable exists early.',
      'Include a quality gate (self-check against the definition of done) before handover.',
      'End with the handover itself plus logging what shipped, so the outcome is traceable.',
    ],
    typicalShape: 'checklist (scope + inputs) → checklist (produce in slices) → checklist (quality gate) → connector_action (hand over to the recipient) → input_form (log what shipped).',
  },
  {
    key: 'implementation',
    label: 'Implementation',
    group: 'execution_production',
    description: 'Configuring, setting up, or integrating systems or processes.',
    disambiguation: 'Setting up or wiring an existing tool, integration or process so it works. Building a new artifact from scratch is Delivery; moving existing data between systems is Migration.',
    guidance: [
      'Confirm access, credentials ownership and prerequisites first. Never assume them.',
      'Configure in a staging or low-risk context before touching anything live.',
      'Verify with a concrete test case that proves the setup works end to end, not just that settings were saved.',
      'Record the configuration decisions made so the next person can reproduce or reverse them.',
      'Tell the affected users or teams what changed and how to use it.',
    ],
    typicalShape: 'checklist (prerequisites + access) → checklist (configure) → checklist (verify with a test case) → input_form (record config decisions) → connector_action (notify affected users).',
  },
  {
    key: 'migration',
    label: 'Migration',
    group: 'execution_production',
    description: 'Moving, transferring, or transforming data or workflows.',
    disambiguation: 'Existing data, records or a workflow moves from one place or shape to another. Success is measured by completeness and fidelity, not by new output.',
    guidance: [
      'Inventory what exists and define what must move, what can be left behind, and the mapping between old and new.',
      'Take a backup or snapshot and agree a rollback path before changing anything.',
      'Run a small pilot batch first and compare counts and samples before the full run.',
      'Reconcile after the run: record counts, spot checks, and a list of exceptions.',
      'Define the cut-over moment and who is told when the old system stops being the source of truth.',
    ],
    typicalShape: 'checklist (inventory + mapping + backup) → checklist (pilot batch) → input_form (reconciliation counts) → checklist (full run + exceptions) → connector_action (announce cut-over).',
  },
  {
    key: 'maintenance',
    label: 'Maintenance',
    group: 'execution_production',
    description: 'Keeping something operational; preventing degradation.',
    disambiguation: 'Routine, recurring or preventive upkeep of something that already works (renewals, updates, clean-ups, health checks). If something is already broken use Resolution or Debugging.',
    guidance: [
      'Start from a standard check routine so nothing is skipped when the work is repetitive.',
      'Capture current readings or state before changing anything, to detect drift over time.',
      'Fix only what is within the routine scope; anything bigger becomes a separate task, noted explicitly.',
      'Log what was checked and changed, plus the date of the next due maintenance.',
    ],
    typicalShape: 'checklist (routine checks) → input_form (readings before/after) → checklist (corrective actions in scope) → input_form (log + next due date).',
  },

  // ───────────── Communication & Relationship ─────────────
  {
    key: 'outreach',
    label: 'Outreach',
    group: 'communication_relationship',
    description: 'Cold or first-contact communication to initiate a relationship.',
    disambiguation: 'No prior conversation exists with this person or account. If a thread already exists use Follow-Up. If the aim is long-term stewardship use Relationship Nurture.',
    guidance: [
      'Research the recipient for two or three specific, recent, relevant facts before writing anything. Personalisation beats volume.',
      'Define one clear, low-friction ask (a short call, a reply, a referral), never several.',
      'Lead the message with relevance to the recipient, not with the sender or product.',
      'Plan the follow-up cadence up front: when the next touch happens if there is no reply, and over which channel.',
      'Log the attempt and the response so the account history stays accurate.',
    ],
    typicalShape: 'checklist (research the recipient) → script_viewer (opening message / talk track) → connector_action (send via the right channel) → input_form (log attempt + response) → checklist (schedule the next touch).',
  },
  {
    key: 'follow_up',
    label: 'Follow-Up',
    group: 'communication_relationship',
    description: 'Continuing or advancing an existing thread or relationship.',
    disambiguation: 'A conversation, quote, meeting or commitment already exists and the goal is to move it forward. If terms are actively being negotiated also tag Negotiation.',
    guidance: [
      'Re-read the previous thread and last commitments first so the message references real context, not a generic nudge.',
      'Say what changed or what is new since the last touch; give the recipient a reason to reply now.',
      'Make the next step concrete and dated (a proposed time, a decision date), not open-ended.',
      'Update the record of the relationship immediately after the touch, and set the next follow-up date.',
    ],
    typicalShape: 'checklist (review the history + last commitments) → script_viewer (follow-up message with new value) → connector_action (send or propose a meeting) → input_form (outcome + next follow-up date).',
  },
  {
    key: 'negotiation',
    label: 'Negotiation',
    group: 'communication_relationship',
    description: 'Aligning on terms, handling objections, reaching agreement.',
    disambiguation: 'There are terms, price, scope or conditions in contention and the two sides must converge. Pure relationship upkeep without terms is Nurture; choosing between internal options is Decision.',
    guidance: [
      'Define your walk-away point, your ideal outcome and what you can trade before any conversation starts.',
      'Anticipate the three most likely objections and prepare a response for each, tied to the other side\'s stated interests.',
      'Trade concessions, never give them for free; always attach a condition or a return ask.',
      'Confirm every agreed point in writing right after the conversation.',
      'Know the approval path for anything outside your authority, and escalate before promising.',
    ],
    typicalShape: 'checklist (limits, goals, tradeables) → script_viewer (talk track + objectionCheats) → connector_action (schedule the call or send the proposal) → input_form (agreed terms + open points) → connector_action (written confirmation).',
  },
  {
    key: 'relationship_nurture',
    label: 'Relationship Nurture',
    group: 'communication_relationship',
    description: 'Long-term trust-building and account stewardship.',
    disambiguation: 'No immediate transaction is being pushed; the goal is health, trust and retention over time (check-ins, QBRs, value reviews, thank-yous).',
    guidance: [
      'Review the account\'s health signals and recent history before reaching out; arrive with something useful, not just a check-in.',
      'Lead with value for the other side: an insight, an introduction, a result achieved, an upcoming risk.',
      'Listen for expansion, risk and sentiment signals and record them explicitly.',
      'Close with a small commitment that keeps the relationship moving (a next review date, an intro made).',
    ],
    typicalShape: 'checklist (account health review) → script_viewer (value-led conversation outline) → connector_action (schedule or send) → input_form (sentiment, risks, opportunities) → checklist (commitments to keep).',
  },
  {
    key: 'escalation',
    label: 'Escalation',
    group: 'communication_relationship',
    description: 'Surfacing a problem or decision to a higher authority.',
    disambiguation: 'The work is mainly about handing a problem or decision up the chain with the right framing. If the problem is an active emergency also tag Crisis Response.',
    guidance: [
      'Write the escalation so it can be understood in thirty seconds: the situation, impact, what has been tried, and the exact ask.',
      'State the decision or help needed and by when; never escalate without an ask.',
      'Bring evidence (links, numbers, timeline), not opinions.',
      'Use the right channel and recipient for the urgency level, and say who else has been informed.',
      'Agree on the follow-up checkpoint so the escalation does not stall silently.',
    ],
    typicalShape: 'checklist (collect the evidence + what has been tried) → script_viewer (escalation brief: situation, impact, ask, deadline) → connector_action (send to the right person) → input_form (response + agreed next checkpoint).',
  },

  // ───────────── Problem Solving ─────────────
  {
    key: 'resolution',
    label: 'Resolution',
    group: 'problem_solving',
    description: 'Fixing a known issue with a defined solution path.',
    disambiguation: 'The cause is known or the fix is clear; the work is applying it. If the cause is unknown use Debugging.',
    guidance: [
      'Restate the issue and the intended fix so the person confirms they are solving the right problem.',
      'Apply the fix in the safest order and keep each change small and reversible.',
      'Verify the fix with the same scenario that exposed the issue, plus one adjacent case.',
      'Communicate the resolution to whoever raised the issue and record what was done to prevent a repeat.',
    ],
    typicalShape: 'checklist (confirm issue + fix plan) → checklist (apply fix) → checklist (verify with original scenario) → connector_action (tell the reporter) → input_form (root cause + prevention note).',
  },
  {
    key: 'debugging',
    label: 'Debugging',
    group: 'problem_solving',
    description: 'Diagnosing and identifying an unknown or unclear issue.',
    disambiguation: 'Something is wrong and the cause is not known yet; the output is a diagnosis. Not limited to software: any unexplained failure, discrepancy or anomaly.',
    guidance: [
      'Reproduce or concretely characterise the problem first: when it happens, when it does not, what changed recently.',
      'List hypotheses ordered by likelihood and cost to test, then test one variable at a time.',
      'Capture evidence at each step (logs, readings, screenshots) so conclusions are traceable.',
      'Stop at a confirmed cause; if the fix is large, hand over to a separate Resolution task with the diagnosis attached.',
    ],
    typicalShape: 'checklist (reproduce + scope) → input_form (hypotheses tested + evidence) → checklist (isolate the cause) → input_form (confirmed diagnosis) → connector_action (hand over or report).',
  },
  {
    key: 'crisis_response',
    label: 'Crisis Response',
    group: 'problem_solving',
    description: 'Urgent, high-stakes response to an active problem.',
    disambiguation: 'Something is actively causing harm now (outage, public incident, major customer loss risk, safety or legal exposure) and speed plus coordination matter more than polish.',
    guidance: [
      'First stabilise: contain the damage before investigating the cause.',
      'Name one incident owner and open one communication channel; notify the people who must know within minutes, not hours.',
      'Keep a running timeline of actions and decisions as they happen.',
      'Communicate status on a fixed cadence even if there is nothing new, so stakeholders do not fill the silence themselves.',
      'Schedule the post-incident review before closing the incident.',
    ],
    typicalShape: 'checklist (contain + stabilise) → connector_action (notify owners and stakeholders) → input_form (running timeline) → script_viewer (status update template) → checklist (close out + schedule review).',
  },

  // ───────────── Knowledge Work ─────────────
  {
    key: 'research',
    label: 'Research',
    group: 'knowledge_work',
    description: 'Gathering information to inform a view or decision.',
    disambiguation: 'The output is collected facts and sources. If the output is a conclusion drawn from data use Analysis.',
    guidance: [
      'Write the question being answered and what the findings will be used for before searching.',
      'Define sources to check (internal records, public sources, people to ask) and a time box.',
      'Capture findings with their source, not just the conclusion.',
      'End with a short summary of what was found, what is uncertain, and what to do next.',
    ],
    typicalShape: 'checklist (question + sources + time box) → input_form (findings with sources) → checklist (verify the key facts) → script_viewer or input_form (summary + open questions).',
  },
  {
    key: 'analysis',
    label: 'Analysis',
    group: 'knowledge_work',
    description: 'Synthesising data or information into actionable insight.',
    disambiguation: 'Data already exists and the work is to interpret it and recommend action. The deliverable is insight, not new data collection.',
    guidance: [
      'Define the question and the decision the analysis supports before opening the data.',
      'Validate the data first (completeness, freshness, definitions) so conclusions are not built on bad inputs.',
      'Look for the two or three drivers that explain most of the movement, not an exhaustive list.',
      'State findings as "so what" recommendations with the supporting numbers.',
      'Share the result with the decision-maker along with the assumptions and limits.',
    ],
    typicalShape: 'checklist (question + data checks) → input_form (key metrics) → checklist (drivers + comparisons) → script_viewer (findings and recommendations) → connector_action (share).',
  },
  {
    key: 'planning',
    label: 'Planning',
    group: 'knowledge_work',
    description: 'Defining how to achieve something before work begins.',
    disambiguation: 'The output is a plan (scope, sequence, owners, timeline), not the work itself. If the plan is being executed it is Delivery or Implementation.',
    guidance: [
      'Start from the outcome and constraints (deadline, budget, people), then work backwards.',
      'Break the work into ordered milestones with an owner and a date each.',
      'Identify the top risks and dependencies and decide what happens if each one hits.',
      'Get the people who must commit to read and agree to the plan; an unshared plan is not a plan.',
    ],
    typicalShape: 'checklist (outcome + constraints) → input_form (milestones, owners, dates) → checklist (risks + dependencies) → connector_action (share for agreement).',
  },
  {
    key: 'documentation',
    label: 'Documentation',
    group: 'knowledge_work',
    description: 'Capturing and structuring knowledge for future reference.',
    disambiguation: 'The output is a durable written artifact (guide, SOP, notes, spec, playbook) for others to use later. If the aim is teaching a person live use Training.',
    guidance: [
      'Identify the reader, what they are trying to do, and what they already know; write for that person.',
      'Outline the structure first, then fill it; lead with the task the reader came to do.',
      'Use concrete examples and screenshots/links, and verify each procedure by following it as written.',
      'Name an owner and a review date so the document does not rot.',
    ],
    typicalShape: 'checklist (audience + outline) → checklist (draft sections) → checklist (verify by following it) → connector_action (publish and notify readers) → input_form (owner + review date).',
  },

  // ───────────── Decision & Approval ─────────────
  {
    key: 'review',
    label: 'Review',
    group: 'decision_approval',
    description: 'Evaluating work before it advances.',
    disambiguation: 'Someone else\'s work product is being evaluated to approve or send back. If checking against a formal standard or compliance rule use Audit.',
    guidance: [
      'Confirm the review criteria first (what must be true to approve) so feedback is consistent.',
      'Check the highest-risk parts of the work first, not in reading order.',
      'Give feedback that is specific, prioritised (blocking vs nice-to-have) and actionable.',
      'End with an explicit decision (approve, approve with changes, send back) and tell the author.',
    ],
    typicalShape: 'checklist (criteria + context) → checklist (inspect high-risk areas first) → input_form (findings: blocking / non-blocking) → connector_action (decision sent to the author).',
  },
  {
    key: 'audit',
    label: 'Audit',
    group: 'decision_approval',
    description: 'Verifying compliance, correctness, or quality.',
    disambiguation: 'Checking something against a defined standard, policy, ledger or specification, with evidence. Output is a pass/fail-style finding list, not an opinion.',
    guidance: [
      'Fix the standard and the scope (what is in, what is out, which period) before collecting evidence.',
      'Sample deliberately and record exactly what was sampled and how.',
      'Record every finding with evidence and severity; do not fix things silently during the audit.',
      'Report findings with owners and due dates for remediation, and schedule the re-check.',
    ],
    typicalShape: 'checklist (standard + scope + sampling) → input_form (findings with evidence + severity) → script_viewer (audit report outline) → connector_action (send to owners) → input_form (remediation dates).',
  },
  {
    key: 'decision',
    label: 'Decision',
    group: 'decision_approval',
    description: 'Assessing options and committing to a course of action.',
    disambiguation: 'A choice between alternatives must be made and recorded. If the work is mostly gathering facts first it is Research; if executing the chosen option, it is Delivery.',
    guidance: [
      'State the decision to be made, the deadline, and who has the authority.',
      'Define two to four options including doing nothing, with cost, benefit, risk and reversibility for each.',
      'Name the deciding criteria and weight them before looking at which option wins.',
      'Record the decision, the reasoning and who was informed, so it does not get reopened without new facts.',
    ],
    typicalShape: 'checklist (decision, deadline, authority) → input_form (options vs criteria) → checklist (consult the people affected) → input_form (decision + reasoning) → connector_action (announce).',
  },

  // ───────────── People & Process ─────────────
  {
    key: 'coordination',
    label: 'Coordination',
    group: 'people_process',
    description: 'Aligning multiple people or teams toward a shared outcome.',
    disambiguation: 'The core challenge is keeping several parties in sync (schedules, handoffs, dependencies). If the work is assigning tasks to others use Delegation.',
    guidance: [
      'List everyone involved with what each is responsible for and what they need from the others.',
      'Set a single shared source of truth and a clear cadence for updates.',
      'Make handoffs explicit: who passes what to whom, by when, in what condition.',
      'Check for blockers early with each party instead of waiting for status to be volunteered.',
    ],
    typicalShape: 'checklist (parties + responsibilities) → connector_action (kickoff or shared channel) → input_form (handoffs and dates) → checklist (blocker check) → connector_action (status update).',
  },
  {
    key: 'onboarding',
    label: 'Onboarding',
    group: 'people_process',
    description: 'Bringing a person or team up to speed.',
    disambiguation: 'A new person, customer or team is being brought to productive use for the first time. Ongoing capability building afterwards is Training.',
    guidance: [
      'Prepare access, tools and the first week\'s plan before the person arrives or starts.',
      'Sequence from the essential (who, what, where, how to ask for help) to the advanced.',
      'Give an early, achievable first win to build confidence.',
      'Schedule check-ins at fixed points and collect their feedback to improve the process.',
    ],
    typicalShape: 'checklist (access + tools ready) → connector_action (welcome + schedule) → checklist (first-week plan) → input_form (check-in notes) → checklist (first win + feedback).',
  },
  {
    key: 'delegation',
    label: 'Delegation',
    group: 'people_process',
    description: 'Assigning, framing, and tracking work done by others.',
    disambiguation: 'The assignee\'s own job is to hand work to others and make sure it lands. The deliverable is the delegated work being clearly framed and tracked, not doing it themselves.',
    guidance: [
      'Pick the owner by capability and capacity, not by who is nearest.',
      'Brief the owner on the outcome, the why, the deadline, the constraints and the decision rights they have.',
      'Agree on the checkpoints in advance so you can follow progress without micromanaging.',
      'Record the delegation where it can be tracked and follow up at the agreed checkpoints.',
    ],
    typicalShape: 'checklist (choose owner, define outcome) → script_viewer (the brief) → connector_action (send brief + schedule checkpoints) → input_form (checkpoint log).',
  },
  {
    key: 'hiring',
    label: 'Hiring',
    group: 'people_process',
    description: 'Recruiting, evaluating, and closing a candidate.',
    disambiguation: 'Any stage of finding, assessing or closing a candidate. Bringing them up to speed after joining is Onboarding.',
    guidance: [
      'Start from the role\'s outcomes and must-have criteria; evaluate every candidate against the same scorecard.',
      'Prepare structured questions tied to the criteria, and capture evidence for each score straight after the interview.',
      'Move quickly between stages and keep candidates informed; delay loses good people.',
      'When closing, understand what the candidate cares about and align the offer and the pitch to it.',
    ],
    typicalShape: 'checklist (role criteria + scorecard) → script_viewer (structured interview questions) → connector_action (schedule + message the candidate) → input_form (scorecard + decision) → connector_action (offer or decline).',
  },
  {
    key: 'training',
    label: 'Training',
    group: 'people_process',
    description: 'Building capability and knowledge in others.',
    disambiguation: 'The aim is for other people to be able to do something they could not before. If the output is a written reference only use Documentation.',
    guidance: [
      'Define what the learner should be able to do afterwards (observable skill), and their starting level.',
      'Teach with a real example and practice, not just explanation; keep sessions short and focused on one skill.',
      'Check understanding with a short exercise or question set, not "any questions?".',
      'Capture feedback and plan reinforcement (follow-up practice or a refresher).',
    ],
    typicalShape: 'checklist (learning goal + audience) → script_viewer (session outline + examples) → connector_action (schedule the session) → input_form (exercise results) → checklist (reinforcement plan).',
  },
];

export const TASK_ARCHETYPE_BY_KEY: Readonly<Record<TaskArchetypeKey, TaskArchetype>> = Object.freeze(
  Object.fromEntries(TASK_ARCHETYPES.map((a) => [a.key, a])) as Record<TaskArchetypeKey, TaskArchetype>,
);

/**
 * Broad archetype used when classification is uncertain. The design doc says to prefer the
 * most appropriate broad archetype over a narrow guess.
 */
export const BROAD_ARCHETYPE_BY_GROUP: Readonly<Record<ArchetypeGroup, TaskArchetypeKey>> = {
  execution_production: 'delivery',
  communication_relationship: 'follow_up',
  problem_solving: 'resolution',
  knowledge_work: 'planning',
  decision_approval: 'review',
  people_process: 'coordination',
};

/** The single most general archetype, used if no group can be inferred at all. */
export const DEFAULT_ARCHETYPE: TaskArchetypeKey = 'delivery';

export function isTaskArchetypeKey(value: unknown): value is TaskArchetypeKey {
  return typeof value === 'string' && (TASK_ARCHETYPE_KEYS as readonly string[]).includes(value);
}
