const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { runCli, tmpDir, rmDir } = require('./helpers');

test('resolveTargetDir supports the claude platform', () => {
  const os = require('node:os');
  const { resolveTargetDir } = require('../bin/cli.js');
  const saved = process.env.AG_SKILLS_DIR;
  delete process.env.AG_SKILLS_DIR;
  try {
    assert.strictEqual(resolveTargetDir(true, 'claude'), path.join(os.homedir(), '.claude', 'skills'));
    assert.strictEqual(resolveTargetDir(false, 'claude'), path.join(process.cwd(), '.claude', 'skills'));
    assert.strictEqual(resolveTargetDir(true), path.join(os.homedir(), '.gemini', 'antigravity', 'skills'));
  } finally {
    if (saved !== undefined) process.env.AG_SKILLS_DIR = saved;
  }
});

test('info shows skill details without installing', () => {
  const r = runCli(['info', 'python-pro']);
  assert.strictEqual(r.code, 0);
  assert.ok(/python-pro/.test(r.stdout));
  assert.ok(/Tags:|Category:/.test(r.stdout));
});

test('info --json emits parseable JSON', () => {
  const r = runCli(['info', 'python-pro', '--json']);
  assert.strictEqual(r.code, 0);
  const data = JSON.parse(r.stdout);
  assert.strictEqual(data.id, 'python-pro');
  assert.ok(Array.isArray(data.files));
  assert.ok(data.files.includes('SKILL.md'));
});

test('info suggests similar names for unknown skills', () => {
  const r = runCli(['info', 'python-proo']);
  assert.notStrictEqual(r.code, 0);
  assert.ok(/Did you mean/.test(r.stdout));
});

test('bundles lists available bundles', () => {
  const r = runCli(['bundles']);
  assert.strictEqual(r.code, 0);
  assert.ok(/core-dev/.test(r.stdout));
});

test('bundles <name> lists skills in the bundle', () => {
  const r = runCli(['bundles', 'k8s-core']);
  assert.strictEqual(r.code, 0);
  assert.ok(/kubernetes/.test(r.stdout));
});

test('list --json emits parseable JSON and supports filters', () => {
  const r = runCli(['list', '--json', '--category', 'security']);
  assert.strictEqual(r.code, 0);
  const data = JSON.parse(r.stdout);
  assert.ok(Array.isArray(data));
  assert.ok(data.length > 0);
  assert.ok(data.every(skill => skill.category === 'security'));
});

test('search --json emits scored results', () => {
  const r = runCli(['search', 'kubernetes', '--json', '--limit', '5']);
  assert.strictEqual(r.code, 0);
  const data = JSON.parse(r.stdout);
  assert.ok(Array.isArray(data));
  assert.ok(data.length > 0);
  assert.ok(data[0].score > 0);
});

test('uninstall removes an installed skill', () => {
  const dest = tmpDir();
  try {
    let r = runCli(['install', 'python-pro'], { env: { AG_SKILLS_DIR: dest } });
    assert.strictEqual(r.code, 0);
    assert.ok(fs.existsSync(path.join(dest, 'python-pro', 'SKILL.md')));

    r = runCli(['uninstall', 'python-pro'], { env: { AG_SKILLS_DIR: dest } });
    assert.strictEqual(r.code, 0);
    assert.ok(!fs.existsSync(path.join(dest, 'python-pro')));
  } finally {
    rmDir(dest);
  }
});

test('install writes a manifest and installed reports drift status', () => {
  const dest = tmpDir();
  try {
    runCli(['install', 'python-pro'], { env: { AG_SKILLS_DIR: dest } });
    assert.ok(fs.existsSync(path.join(dest, '.ag-skills.json')));

    let r = runCli(['installed', '--json'], { env: { AG_SKILLS_DIR: dest } });
    let data = JSON.parse(r.stdout);
    assert.strictEqual(data.skills[0].status, 'up-to-date');

    // Modify the installed copy: should now be reported as outdated.
    fs.appendFileSync(path.join(dest, 'python-pro', 'SKILL.md'), '\nlocal change\n');
    r = runCli(['installed', '--json'], { env: { AG_SKILLS_DIR: dest } });
    data = JSON.parse(r.stdout);
    assert.strictEqual(data.skills[0].status, 'outdated');
  } finally {
    rmDir(dest);
  }
});

test('update skips unchanged skills and restores modified ones', () => {
  const dest = tmpDir();
  try {
    runCli(['install', 'python-pro'], { env: { AG_SKILLS_DIR: dest } });

    let r = runCli(['update'], { env: { AG_SKILLS_DIR: dest } });
    assert.strictEqual(r.code, 0);
    assert.ok(/already up-to-date: 1/.test(r.stdout));

    fs.appendFileSync(path.join(dest, 'python-pro', 'SKILL.md'), '\nlocal change\n');
    r = runCli(['update'], { env: { AG_SKILLS_DIR: dest } });
    assert.strictEqual(r.code, 0);
    assert.ok(/Updated: 1/.test(r.stdout));
  } finally {
    rmDir(dest);
  }
});

test('doctor reports both platforms', () => {
  const r = runCli(['doctor']);
  assert.strictEqual(r.code, 0);
  assert.ok(/Antigravity/.test(r.stdout));
  assert.ok(/Claude Code/.test(r.stdout));
});

test('suggestSimilar finds close matches', () => {
  const { suggestSimilar } = require('../lib/skill-utils');
  const result = suggestSimilar('python-proo', ['python-pro', 'golang-pro', 'rust-pro']);
  assert.deepStrictEqual(result[0], 'python-pro');
});
