import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.location = { hash: '#/cases/rectification' };
globalThis.window = { scrollTo() {} };
globalThis.document = {
  getElementById() {
    return null;
  },
  querySelectorAll() {
    return [];
  }
};

const navigation = await import('../static/app/navigation.js');

test('stale workspace route sync is ignored after the hash changes', () => {
  assert.equal(
    navigation.shouldIgnoreStaleWorkspaceRoute('#/cases/rectification', '#/import'),
    true
  );
  assert.equal(
    navigation.shouldIgnoreStaleWorkspaceRoute('#/import', '#/import'),
    false
  );
});
