import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

test('doctor refuses patch drift instead of silently accepting future SDK changes', () => {
  const dir=mkdtempSync(join(tmpdir(),'21life-doctor-'));
  try {
    const file=join(dir,'output.txt');
    writeFileSync(file,'✖ Check that packages match versions required by installed Expo SDK\nexpo  ~57.0.28  57.0.27\n');
    const result=spawnSync(process.execPath,['scripts/expo-doctor-ci.mjs','--from-file',file],{encoding:'utf8'});
    assert.equal(result.status,1,result.stdout+result.stderr);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('doctor preserves other errors and unrecognized output as failure', () => {
  const dir=mkdtempSync(join(tmpdir(),'21life-doctor-'));
  try {
    const file=join(dir,'output.txt');
    for(const text of ['✖ Native configuration error\n','Unexpected doctor output\n']) {
      writeFileSync(file,text);
      assert.equal(spawnSync(process.execPath,['scripts/expo-doctor-ci.mjs','--from-file',file]).status,1);
    }
  } finally {rmSync(dir,{recursive:true,force:true});}
});
