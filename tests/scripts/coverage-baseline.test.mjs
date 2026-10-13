import test from 'node:test';
import assert from 'node:assert/strict';
import {checkCoverageBaseline} from '../../scripts/coverage-baseline.mjs';

const metric=(pct)=>({pct,total:10,covered:pct/10});
const entry=(pct)=>Object.fromEntries(['lines','branches','functions','statements'].map(k=>[k,metric(pct)]));
test('coverage ratchet refuses per-file loss even when aggregate stays green',()=>{
  const baseline={'lib/api.ts':{lines:80,branches:70,functions:70,statements:80}};
  const report={total:entry(95),'/project/lib/api.ts':entry(60)};
  assert.ok(checkCoverageBaseline(report,baseline,'/project').some(e=>e.includes('lib/api.ts')));
});
test('coverage ratchet rejects missing files and invalid metrics and allows improvements',()=>{
  const baseline={'lib/api.ts':{lines:80,branches:70,functions:70,statements:80}};
  assert.ok(checkCoverageBaseline({},baseline,'/project').length);
  assert.deepEqual(checkCoverageBaseline({'/project/lib/api.ts':entry(90)},baseline,'/project'),[]);
  assert.ok(checkCoverageBaseline({'/project/lib/api.ts':{lines:{pct:NaN}}},baseline,'/project').length);
});
