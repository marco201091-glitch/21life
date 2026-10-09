import {readFileSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';

// The Vitest 5 mapping/transform pipeline changes coverage measurements.
// Keep a reviewed per-file ratchet in addition to aggregate thresholds.
export function checkCoverageBaseline(report,baseline,root){
  const entries=Object.fromEntries(Object.entries(report).filter(([file])=>file!=='total')
    .map(([file,data])=>[relative(root,file).replaceAll('\\','/'),data]));
  const errors=[];
  for(const [file,floors] of Object.entries(baseline)){
    if(!entries[file]){errors.push('Missing coverage: '+file);continue;}
    for(const [metric,floor] of Object.entries(floors)){
      const pct=entries[file][metric]?.pct;
      if(!Number.isFinite(pct)||pct<floor)errors.push(`${file} ${metric}: ${pct} < ${floor}`);
    }
  }
  return errors;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=process.cwd();
  const report=JSON.parse(readFileSync(resolve(root,'coverage/coverage-summary.json'),'utf8'));
  const baseline=JSON.parse(readFileSync(resolve(root,'coverage-baseline.json'),'utf8'));
  const errors=checkCoverageBaseline(report,baseline,root);
  if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}
  else console.log(`Coverage ratchet passed: ${Object.keys(baseline).length} files.`);
}
