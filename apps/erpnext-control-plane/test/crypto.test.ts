import assert from 'node:assert/strict';
import test from 'node:test';
import { decrypt, encrypt } from '../src/crypto.js';

test('tenant credentials are encrypted with authenticated encryption', () => {
  const plaintext = 'frappe-api-secret';
  const encrypted = encrypt(plaintext);
  assert.notEqual(encrypted, plaintext);
  assert.equal(decrypt(encrypted), plaintext);
  const replacement = encrypted.endsWith('0') ? '1' : '0';
  assert.throws(() => decrypt(`${encrypted.slice(0, -1)}${replacement}`));
});
