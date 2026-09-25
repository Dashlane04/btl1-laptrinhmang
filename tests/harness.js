/**
 * Harness test tối giản, không phụ thuộc thư viện ngoài.
 * Dùng cho các unit test luật chơi OTTv2 chạy thuần Node.
 */
'use strict';

const state = {
  suites: [],
  current: null,
  passed: 0,
  failed: 0,
  failures: []
};

function describe(name, fn) {
  const suite = { name, tests: [] };
  state.suites.push(suite);
  const prev = state.current;
  state.current = suite;
  fn();
  state.current = prev;
}

function it(name, fn) {
  if (!state.current) throw new Error('it() phải nằm trong describe()');
  state.current.tests.push({ name, fn });
}

class AssertionError extends Error {}

function fail(message) {
  throw new AssertionError(message);
}

function stringify(value) {
  if (typeof value === 'string') return JSON.stringify(value);
  if (value === undefined) return 'undefined';
  try {
    return JSON.stringify(value);
  } catch (e) {
    return String(value);
  }
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (typeof a !== 'object') return Number.isNaN(a) && Number.isNaN(b);
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(k => deepEqual(a[k], b[k]));
}

function expect(actual) {
  return {
    toBe(expected, note) {
      if (actual !== expected) {
        fail(`${note ? note + ': ' : ''}mong đợi ${stringify(expected)}, nhận được ${stringify(actual)}`);
      }
    },
    toEqual(expected, note) {
      if (!deepEqual(actual, expected)) {
        fail(`${note ? note + ': ' : ''}mong đợi ${stringify(expected)}, nhận được ${stringify(actual)}`);
      }
    },
    toBeTruthy(note) {
      if (!actual) fail(`${note ? note + ': ' : ''}mong đợi truthy, nhận được ${stringify(actual)}`);
    },
    toBeFalsy(note) {
      if (actual) fail(`${note ? note + ': ' : ''}mong đợi falsy, nhận được ${stringify(actual)}`);
    },
    toBeNull(note) {
      if (actual !== null) fail(`${note ? note + ': ' : ''}mong đợi null, nhận được ${stringify(actual)}`);
    },
    toHaveLength(n, note) {
      const len = actual == null ? undefined : actual.length;
      if (len !== n) fail(`${note ? note + ': ' : ''}mong đợi length ${n}, nhận được ${stringify(len)}`);
    },
    toContain(needle, note) {
      if (!Array.isArray(actual) && typeof actual !== 'string') {
        fail(`${note ? note + ': ' : ''}toContain cần array hoặc string`);
      }
      if (!actual.includes(needle)) {
        fail(`${note ? note + ': ' : ''}mong đợi chứa ${stringify(needle)}, nhận được ${stringify(actual)}`);
      }
    }
  };
}

async function run() {
  const t0 = Date.now();

  for (const suite of state.suites) {
    console.log(`\n  ${suite.name}`);
    for (const test of suite.tests) {
      try {
        await test.fn();
        state.passed++;
        console.log(`    \x1b[32m✓\x1b[0m ${test.name}`);
      } catch (err) {
        state.failed++;
        const isAssertion = err instanceof AssertionError;
        state.failures.push({ suite: suite.name, test: test.name, err });
        console.log(`    \x1b[31m✗\x1b[0m ${test.name}`);
        console.log(`        \x1b[31m${isAssertion ? err.message : (err && err.stack) || err}\x1b[0m`);
      }
    }
  }

  const ms = Date.now() - t0;
  console.log('\n' + '─'.repeat(60));
  if (state.failed === 0) {
    console.log(`\x1b[32m  ✓ ${state.passed} test passed\x1b[0m  (${ms}ms)`);
  } else {
    console.log(`\x1b[31m  ✗ ${state.failed} failed\x1b[0m, \x1b[32m${state.passed} passed\x1b[0m  (${ms}ms)`);
  }
  console.log('─'.repeat(60) + '\n');

  return state.failed === 0;
}

module.exports = { describe, it, expect, run, fail };
