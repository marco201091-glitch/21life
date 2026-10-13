import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/fdroid-reproducible-release.yml', 'utf8');
const block = workflow.match(/name: Validate F-Droid tag and release configuration[\s\S]*?        run: \|\n([\s\S]*?)(?=\n      -)/)[1];
const validation = block.split('version=')[0].split('\n').map(line => line.replace(/^          /, '')).join('\n');
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';

for (const annotated of [true, false]) {
  test(annotated ? 'recovers checkout lightweight ref and verifies immutable annotated remote source' : 'rejects a lightweight remote release tag', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fdroid-tag-check-'));
    const source = join(dir, 'source');
    const checkout = join(dir, 'checkout');
    const tag = 'fdroid-v9.1.2';
    const git = (cwd, args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    try {
      mkdirSync(source);
      git(source, ['init', '-b', 'fdroid-prep']);
      git(source, ['config', 'user.name', 'Test']);
      git(source, ['config', 'user.email', 'test@example.invalid']);
      writeFileSync(join(source, 'source.txt'), 'immutable source');
      git(source, ['add', '.']);
      git(source, ['-c', 'commit.gpgsign=false', 'commit', '-m', 'source']);
      const sha = git(source, ['rev-parse', 'HEAD']);
      git(source, annotated ? ['-c', 'tag.gpgsign=false', 'tag', '-a', tag, '-m', 'release'] : ['tag', tag]);
      execFileSync('git', ['clone', '--no-local', source, checkout], { stdio: 'pipe' });
      git(checkout, ['tag', '-f', tag, sha]);
      assert.equal(git(checkout, ['cat-file', '-t', tag]), 'commit');
      const run = spawnSync(bash, ['-c', validation], { cwd: checkout, encoding: 'utf8', env: { ...process.env, SOURCE_TAG: tag, GITHUB_REF_NAME: tag, GITHUB_SHA: '0'.repeat(40) } });
      if (annotated) {
        assert.equal(run.status, 0, run.stderr);
        assert.equal(git(checkout, ['cat-file', '-t', tag]), 'tag');
        assert.equal(git(checkout, ['rev-parse', `${tag}^{}`]), sha);
      } else assert.notEqual(run.status, 0);
    } finally {
      assert.ok(resolve(dir).startsWith(resolve(tmpdir()) + '/') || resolve(dir).startsWith(resolve(tmpdir()) + '\\'));
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
