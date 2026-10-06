import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ARCHETYPE_GROUPS, BROAD_ARCHETYPE_BY_GROUP, TASK_ARCHETYPES, TASK_ARCHETYPE_BY_KEY, TASK_ARCHETYPE_KEYS,
} from '../src/domains/object-space/archetypes.js';
import {
  CLASSIFICATION_JSON_SCHEMA, ClassificationSchema, GeneratedPlaybookSchema, PLAYBOOK_JSON_SCHEMA,
  PlaybookRequestSchema, STEP_TYPES,
} from '../src/domains/object-space/schemas.js';

test('catalogue has the 24 archetypes from the design doc, grouped 4/5/3/4/3/5', () => {
  assert.equal(TASK_ARCHETYPES.length, 24);
  assert.equal(new Set(TASK_ARCHETYPES.map((a) => a.key)).size, 24);
  assert.deepEqual([...TASK_ARCHETYPES.map((a) => a.key)].sort(), [...TASK_ARCHETYPE_KEYS].sort());
  const counts = Object.fromEntries(ARCHETYPE_GROUPS.map((g) => [g, TASK_ARCHETYPES.filter((a) => a.group === g).length]));
  assert.deepEqual(counts, {
    execution_production: 4, communication_relationship: 5, problem_solving: 3,
    knowledge_work: 4, decision_approval: 3, people_process: 5,
  });
});

test('every archetype carries classifier and generator knowledge', () => {
  for (const a of TASK_ARCHETYPES) {
    assert.ok(a.description.length > 10, a.key);
    assert.ok(a.disambiguation.length > 20, a.key);
    assert.ok(a.guidance.length >= 4, `${a.key} guidance`);
    assert.ok(a.typicalShape.length > 20, a.key);
    for (const t of a.typicalShape.match(/\b(checklist|script_viewer|input_form|connector_action)\b/g) ?? []) {
      assert.ok((STEP_TYPES as readonly string[]).includes(t));
    }
  }
});

test('broad fallbacks stay inside their own group', () => {
  for (const g of ARCHETYPE_GROUPS) assert.equal(TASK_ARCHETYPE_BY_KEY[BROAD_ARCHETYPE_BY_GROUP[g]].group, g);
});

test('JSON schemas given to Gemini stay in step with zod', () => {
  assert.deepEqual(CLASSIFICATION_JSON_SCHEMA.properties.archetypes.items.properties.key.enum, [...TASK_ARCHETYPE_KEYS]);
  assert.deepEqual(PLAYBOOK_JSON_SCHEMA.properties.steps.items.properties.type.enum, [...STEP_TYPES]);
});

test('request, classification and playbook parse realistic payloads', () => {
  const req = PlaybookRequestSchema.parse({
    taskKey: 't1', title: 'Follow up with Lumina Cloud on Q4 renewal',
    assignee: { name: 'Alex', jobTitle: 'Outbound SDR' }, department: { name: 'Outbound Sales & BDR' },
  });
  assert.equal(req.isTeamTask, false);
  assert.deepEqual(req.labels, []);
  assert.equal(PlaybookRequestSchema.safeParse({ ...req, title: '' }).success, false);

  ClassificationSchema.parse({ archetypes: [{ key: 'follow_up', weight: 0.7 }, { key: 'negotiation', weight: 0.3 }], confidence: 0.9, bestGroup: 'communication_relationship' });
  assert.equal(ClassificationSchema.safeParse({ archetypes: [{ key: 'not_real', weight: 1 }], confidence: 1, bestGroup: 'people_process' }).success, false);

  const pb = GeneratedPlaybookSchema.parse({
    steps: [{ title: 'Review thread', type: 'checklist', instructions: null, checklistItems: [{ label: 'Re-read the last email', notes: null }], connector: null }],
  });
  assert.equal(pb.steps[0].instructions, '');
  assert.equal(pb.steps[0].formFields.length, 0);
});
