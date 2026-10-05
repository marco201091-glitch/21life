<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Self-hosted Supabase operations

Supabase is self-hosted in Dokploy on the project's VM; `.env.local` contains separate Dev and production SSH targets, Compose project names, database roles, and key paths. Missing Docker/Podman on the Windows workstation only means the *local* Supabase stack is unavailable. It does not block database work: use the SSH-backed runner from the repository root:

```powershell
node scripts/selfhosted-db.mjs apply dev supabase/migrations/<migration-file>.sql
```

Choose `dev` or `production` explicitly. Production database changes require explicit PM authorization. The runner executes SQL against the selected remote Compose `db` container in a transaction and records a SHA-256 checksum in `app_private.schema_migrations`; it does not update Supabase CLI's migration history. Verify changes with read-only SQL over the same SSH target. Do not use `supabase status` as a remote health check; it inspects local containers.

## Mandatory merge and pre-build checks

PM instruction, 2026-10-05: whenever a merge fails, record its cause and check a
persistent checklist before compiling again.

- Read `.agents/MERGE_FAILURES.md` and `.agents/RELEASE_PREBUILD_CHECKLIST.md`
  before every build, release tag or deployment; follow every applicable gate.
- On failed or uncertain merge, stop dependent actions, verify remote PR state,
  record observed error/cause/recovery and add the preventive check before retrying.
- Native command failures must stop orchestration. In PowerShell use both
  `$ErrorActionPreference = 'Stop'` and
  `$PSNativeCommandUseErrorActionPreference = $true`, or check each native exit
  code immediately. Check tool exit codes and API success before dependent calls.
- A release must verify the final remote merge commit, clean source worktree,
  actual fix, version and annotated tag. All requested platforms must build the
  requested branch's final SHA; never substitute Dev when the PM requested main.
