# Branch and release workflow

The supported development path is `feature/*` → `Dev` → `main`. Keep feature
changes reviewable in pull requests and preserve the ancestry of the long-lived
release branches.

## Feature integration

1. Fetch `origin` and create a feature branch or isolated worktree from the
   current `origin/Dev` tip. Record the base SHA and keep unrelated changes out
   of the branch.
2. Run the affected web and Expo checks locally. Open a pull request into
   `Dev`; squash is suitable for a self-contained feature when its history does
   not need to be preserved.
3. Merge only after the `web` and `expo` required checks pass. Do not bypass
   branch protection or rewrite a shared branch.

## Release promotion

1. Freeze the intended `Dev` SHA and review the application diff against
   `main`, version and runtime configuration, ordered migration manifest,
   release notes, and standard/F-Droid differences.
2. Open a promotion pull request from `Dev` to `main`. Preserve branch
   ancestry with a merge commit; do not squash a long-lived branch promotion.
   Resolve conflicts by reviewing each file and rerun the relevant gates.
3. Tag only the reviewed, merged `main` commit. Build release assets from that
   tag and verify the APK, checksum, both SBOMs, package/version, and signature
   before publication.

## Hotfix return path

Start a production hotfix from `main`, merge it through its own pull request,
then merge `main` back into `Dev` so the fix is available to the next release.
Do not copy a hand-selected subset if that would omit related schema or tests.

## Recovery and branch governance

Recover a bad change with a reviewed revert commit and a new release version;
never move or replace a public tag. `Dev` and `main` currently require the
`web` and `expo` status checks, disallow force pushes and deletion, and do not
require pull requests at the GitHub protection level. Use pull requests as the
project process regardless of that platform setting. Do not change repository
protection in an implementation ticket without a separate governance decision.

The current `main`/`Dev` history differs by 15 commits unique to `main` and 35
unique to `Dev`; the IMP-00 audit found matching application and lockfile
content at that time, with checklist-only content differences. Recompute this
comparison before a promotion instead of treating that historical result as
current evidence.

## Reconciliation simulation, 2026-10-01

`node scripts/simulate-branch-promotion.mjs` used main
`b11b2034f3dd539fff21b58460bc4644a84cd9c8` and Dev
`29316afa765090ebc7aa1dd0da662baa7bef74d0`. Application contents match;
the sole conflict is three release completion records in the checklist.
Keeping the completed Dev records produces tree
`ff50b9bf43cc2248cd220e083357589e6ee93dfd`, identical to Dev.
The simulation uses a temporary Git index and changes no branch or worktree.
GitHub currently permits merge commits. This establishes the reconciliation
procedure without publishing or merging a promotion.


Live enforcement check (2026-10-01): GitHub REST reports merge commits enabled
for the repository, but both main and Dev require linear history. An actual
feature PR merge using `--merge` was rejected; the authorized feature was
integrated with squash, preserving the protected checks. The proposed merge
promotion/back-merge process needs a separate PM decision to disable only the
linear-history requirement on these branches. Do not change governance or
remove web/expo checks to work around this restriction.

## Governance decision, 2026-10-05

The PM authorized removing only required_linear_history on main and Dev because it prevented the agreed ancestry-preserving promotion. Applied and verified: required web/expo checks, strict up-to-date requirement, admin enforcement, signature settings, and force-push/deletion restrictions remain unchanged. PR #149 promoted the tested tree with merge ancestry; PR #151 returns published main ancestry to Dev without application changes. The October 1 enforcement notes above describe the former policy.
