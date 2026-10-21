import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('admin-social-accounts.js', import.meta.url), 'utf8');
const grid = { replaceChildren(...items) { this.items = items; } };
const context = {
  currentAdminLocationId: () => 'navotas', renderCollectorStatuses: () => {},
  socialCollectorMessage: () => 'legacy', socialCollectorBadge: () => 'legacy',
  document: { getElementById: () => grid, createElement: () => ({
    dataset: {}, append(...children) { this.children = children; },
  }) },
};
context.window = context;
vm.runInNewContext(source.slice(source.indexOf('// Monitor the selected')), context);
const health = { lgu_social_collectors: {
  'navotas:Facebook': { connected: true, last_error: 'Search parser unavailable', posts_processed: 0 },
  'navotas:X': { connected: false, posts_processed: 0 },
} };
context.renderCollectorStatuses('nlp-collector-statuses', health);
assert.equal(grid.items[1].children[1].textContent, 'Needs attention');
assert.equal(grid.items[0].children[1].textContent, 'Account not connected');
assert.equal(context.socialCollectorBadge(health), 'Social collectors need attention');
assert.equal(context.socialCollectorMessage(health), 'Facebook: Search parser unavailable');
assert.equal(context.socialCollectorBadge({}), 'legacy');
console.log('Scoped monitor status and legacy fallback checks passed');
