import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const main = git('rev-parse', 'origin/main');
const dev = git('rev-parse', 'origin/Dev');
const applicationDiff = git('diff', '--name-only', main, dev);
if (applicationDiff !== '.agents/PROJECT_CHECKLIST.md') {
  throw new Error('Expected checklist-only historical divergence; review application changes before resolving.');
}
const merged = spawnSync('git', ['merge-tree', '--write-tree', main, dev], { encoding: 'utf8' });
if (merged.status !== 1 || !merged.stdout.includes('CONFLICT (content): Merge conflict in .agents/PROJECT_CHECKLIST.md')) {
  throw new Error('Unexpected merge result; no branch was changed.');
}
const tree = merged.stdout.split(/\r?\n/)[0];
const directory = mkdtempSync(join(tmpdir(), '21life-promotion-'));
const env = { ...process.env, GIT_INDEX_FILE: join(directory, 'index') };
const indexedGit = (...args) => execFileSync('git', args, { env, encoding: 'utf8' }).trim();
try {
  indexedGit('read-tree', tree);
  // The three stale main release checklist entries were completed on Dev;
  // retain those specific documented completion records, reviewed in IMP-14.
  const checklist = git('rev-parse', `${dev}:.agents/PROJECT_CHECKLIST.md`);
  indexedGit('update-index', '--cacheinfo', `100644,${checklist},.agents/PROJECT_CHECKLIST.md`);
  const resolvedTree = indexedGit('write-tree');
  if (git('diff', '--name-only', resolvedTree, dev)) throw new Error('Resolved promotion would lose Dev content.');
  console.log(JSON.stringify({ main, dev, resolvedTree, applicationChanges: 0, resolution: 'Dev completion records for three historical releases', sharedBranchesChanged: false }, null, 2));
} finally {
  rmSync(directory, { recursive: true, force: true });
}
