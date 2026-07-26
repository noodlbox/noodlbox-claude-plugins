/**
 * Routing tests for the Claude hook dispatcher (node:test).
 *
 * Run manually (no JS CI lane):
 *   node --test crates/noodlbox-integrate/plugins/platforms/claude/scripts/
 *
 * The dispatcher guards `main()` behind `require.main === module`, so
 * requiring it here executes nothing; lib functions are stubbed on the
 * SHARED module instance (`../shared/hooks/lib.js` is the same file the
 * dispatcher requires — a symlink in the source tree, a copy on install).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const lib = require(path.join(__dirname, '../shared/hooks/lib.js'));
const hook = require('./noodlbox.js');

function withStubs(stubs, fn) {
  const saved = {};
  for (const [name, impl] of Object.entries(stubs)) {
    saved[name] = lib[name];
    lib[name] = impl;
  }
  try {
    fn();
  } finally {
    for (const [name, impl] of Object.entries(saved)) {
      lib[name] = impl;
    }
  }
}

test('PostToolUse: successful git commit in an indexed repo spawns the re-analyze', () => {
  let spawned = 0;
  withStubs(
    {
      getIndexedRepoInfo: () => ({ boxId: 'test' }),
      postCommitAnalyzeDue: () => true,
      spawnPostCommitAnalyze: () => {
        spawned += 1;
        return true;
      },
    },
    () => {
      hook.handlePostToolUse({
        tool_name: 'Bash',
        tool_input: { command: 'git commit -m "x"' },
        tool_response: { exit_code: 0 },
        cwd: '/tmp/repo',
      });
    }
  );
  assert.equal(spawned, 1);
});

test('PostToolUse: non-commit Bash never spawns', () => {
  let spawned = 0;
  withStubs(
    {
      getIndexedRepoInfo: () => ({ boxId: 'test' }),
      postCommitAnalyzeDue: () => true,
      spawnPostCommitAnalyze: () => {
        spawned += 1;
        return true;
      },
    },
    () => {
      hook.handlePostToolUse({
        tool_name: 'Bash',
        tool_input: { command: 'git log --grep commit' },
        tool_response: { exit_code: 0 },
        cwd: '/tmp/repo',
      });
    }
  );
  assert.equal(spawned, 0);
});

test('PostToolUse: unindexed repo never spawns (global plugin, unrelated repos)', () => {
  let spawned = 0;
  withStubs(
    {
      getIndexedRepoInfo: () => null,
      postCommitAnalyzeDue: () => true,
      spawnPostCommitAnalyze: () => {
        spawned += 1;
        return true;
      },
    },
    () => {
      hook.handlePostToolUse({
        tool_name: 'Bash',
        tool_input: { command: 'git commit -m "x"' },
        tool_response: { exit_code: 0 },
        cwd: '/tmp/not-a-box',
      });
    }
  );
  assert.equal(spawned, 0);
});

test('PostToolUse: visibly failed commit neither spawns nor claims the debounce window', () => {
  let spawned = 0;
  let windowClaimed = 0;
  withStubs(
    {
      getIndexedRepoInfo: () => ({ boxId: 'test' }),
      postCommitAnalyzeDue: () => {
        windowClaimed += 1;
        return true;
      },
      spawnPostCommitAnalyze: () => {
        spawned += 1;
        return true;
      },
    },
    () => {
      hook.handlePostToolUse({
        tool_name: 'Bash',
        tool_input: { command: 'git commit -m "x"' },
        tool_response: { exit_code: 1 },
        cwd: '/tmp/repo',
      });
    }
  );
  assert.equal(spawned, 0);
  assert.equal(windowClaimed, 0, 'a rejected commit must not burn the window');
});

test('commitVisiblyFailed: fails open on unknown response shapes', () => {
  assert.equal(hook.commitVisiblyFailed(undefined), false);
  assert.equal(hook.commitVisiblyFailed('string output'), false);
  assert.equal(hook.commitVisiblyFailed({}), false);
  assert.equal(hook.commitVisiblyFailed({ exit_code: 0 }), false);
  assert.equal(hook.commitVisiblyFailed({ exit_code: 128 }), true);
  assert.equal(hook.commitVisiblyFailed({ exitCode: 1 }), true);
  assert.equal(hook.commitVisiblyFailed({ interrupted: true }), true);
});
