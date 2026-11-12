import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

test('backup producer enforces readonly source queries and emits reset SQL only to the restore file', () => {
  const source = readFileSync('ops/supabase-backup-package.py', 'utf8');
  const probe = `
import ast,json,sys
tree=ast.parse(sys.stdin.read())
fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='read_source_sql')
call=next(n for n in ast.walk(fn) if isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id=='command')
data=next(k.value for k in call.keywords if k.arg=='data')
assert 'BEGIN READ ONLY;' in ast.unparse(data) and 'ROLLBACK;' in ast.unparse(data)
produce=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='produce_package')
owners=next(n.value.args[0].value for n in ast.walk(produce) if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='owners' for t in n.targets))
assert 'DO $schema_acl$' not in owners
assert "'ALTER" in owners and "'GRANT" in owners
print('readonly source / restore-only mutation contract verified')
`;
  const result = spawnSync('python', ['-B', '-c', probe], { input: source, encoding: 'utf8' });
  if (result.error?.code === 'ENOENT') {
    // Linux CI image provides python3 rather than Windows' python launcher.
    const linux = spawnSync('python3', ['-B', '-c', probe], { input: source, encoding: 'utf8' });
    assert.equal(linux.status, 0, linux.stderr);
  } else assert.equal(result.status, 0, result.stderr);
});
