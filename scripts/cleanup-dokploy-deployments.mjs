import { readFileSync } from 'node:fs';

const apply = process.argv.includes('--apply');

function loadLocalEnv() {
  try {
    return Object.fromEntries(readFileSync('.env.local', 'utf8')
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index), line.slice(index + 1).replace(/^"|"$/g, '')];
      }));
  } catch {
    return {};
  }
}

const localEnv = loadLocalEnv();
const baseUrl = (process.env.DOKPLOY_URL ?? localEnv.DOKPLOY_URL ?? '').replace(/\/$/, '');
const apiKey = process.env.DOKPLOY_API_KEY ?? localEnv.DOKPLOY_API_KEY;

if (!baseUrl || !apiKey) {
  throw new Error('DOKPLOY_URL and DOKPLOY_API_KEY are required.');
}

const targets = [
  { name: 'main', type: 'application', id: '-luoc-a5Mx9QJnAHuBiRV', keepDone: 2 },
  { name: 'dev', type: 'application', id: '0y9Dk8lwDTwkeBuM0hEJt', keepDone: 1 },
  { name: 'website-production', type: 'application', id: '7OAYW622qEnzw5Y-w9vZl', keepDone: 2 },
  { name: 'supabase-production', type: 'compose', id: 'zvgvfKmFaDK3SZXu2sNPj', keepDone: 2 },
  // Dokploy still exposes the legacy compose label "supabase-staging".
  // This ID is exclusively the isolated Supabase Test stack.
  { name: 'supabase-test', type: 'compose', id: '5VlzcL_rCdZmzqkravyE6', keepDone: 1 },
];

const headers = { 'x-api-key': apiKey, 'Content-Type': 'application/json' };

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, { headers, ...options });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.status === 204 ? null : response.json();
}

function staleDeploymentIds(deployments, keepDone) {
  const failed = deployments.filter((item) => ['error', 'cancelled'].includes(item.status));
  if (keepDone === null) return failed.map((item) => item.deploymentId);

  const oldDone = deployments
    .filter((item) => item.status === 'done')
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(keepDone);

  return [...failed, ...oldDone].map((item) => item.deploymentId);
}

let removed = 0;
for (const target of targets) {
  try {
    const query = target.type === 'application'
      ? `/api/application.one?applicationId=${encodeURIComponent(target.id)}`
      : `/api/compose.one?composeId=${encodeURIComponent(target.id)}`;
    const resource = await request(query);
    const ids = staleDeploymentIds(resource.deployments ?? [], target.keepDone);

    for (const deploymentId of ids) {
      if (apply) {
        await request('/api/deployment.removeDeployment', {
          method: 'POST',
          body: JSON.stringify({ deploymentId }),
        });
      }
      removed += 1;
    }

    console.log(`${target.name}: ${ids.length} ${apply ? 'removed' : 'would-remove'}`);
  } catch (err) {
    console.error(`${target.name}: SKIPPED — ${err.message}`);
  }
}

console.log(`total: ${removed} ${apply ? 'removed' : 'would-remove'}`);
