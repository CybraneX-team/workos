import assert from 'node:assert/strict';
import test from 'node:test';
import { parseIdtChatMessages, parseIdtChatModelOutput } from '../src/routes/referenceCompanies.ts';

test('IDT chat accepts a bounded conversation that ends with a user message', () => {
  const messages = parseIdtChatMessages([
    { role: 'user', text: 'What evidence supports this branch?' },
    { role: 'assistant', text: 'The branch has two attached sources.' },
    { role: 'user', text: 'Summarize them.' },
  ]);

  assert.deepEqual(messages, [
    { role: 'user', text: 'What evidence supports this branch?' },
    { role: 'assistant', text: 'The branch has two attached sources.' },
    { role: 'user', text: 'Summarize them.' },
  ]);
});

test('IDT chat rejects malformed, oversized, and assistant-terminated histories', () => {
  assert.equal(parseIdtChatMessages([]), null);
  assert.equal(parseIdtChatMessages([{ role: 'assistant', text: 'Not a request' }]), null);
  assert.equal(parseIdtChatMessages([{ role: 'user', text: 'x'.repeat(2_001) }]), null);
  assert.equal(parseIdtChatMessages([{ role: 'user', text: '' }]), null);
});

test('IDT chat accepts only structured model output with string citation IDs', () => {
  assert.deepEqual(
    parseIdtChatModelOutput({ reply: 'A source-backed answer.', citationIds: ['source-1'] }),
    { reply: 'A source-backed answer.', citationIds: ['source-1'] },
  );
  assert.equal(parseIdtChatModelOutput({ reply: '', citationIds: [] }), null);
  assert.equal(parseIdtChatModelOutput({ reply: 'Answer', citationIds: [42] }), null);
});
