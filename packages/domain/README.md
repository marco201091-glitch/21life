# Pure shared domain

Rules used by web and native clients. No UI, network, storage, platform globals or runtime configuration belong here. Compatibility adapters remain at the previous import paths.

`win-rate.ts` owns the draw-neutral convention; `participant-keys.ts` owns participant identity; `deck-ranking-visibility.ts` owns provisional ranking rules. Changes must be exercised by both client suites. Coverage floors apply to these implementations as well as compatibility wrappers.

`scripts/verify-domain-boundaries.mjs` rejects platform dependencies and circular imports. Run it from either client root; both quality commands include it. The module is local and private, not a registry package.
