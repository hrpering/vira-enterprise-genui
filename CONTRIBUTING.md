# Contributing

## Workflow

1. Start from a written PR plan in `docs/pr-plans/`.
2. Keep each PR limited to one architectural responsibility.
3. Do not mix unrelated refactors with feature work.
4. Keep generic packages customer-, domain-, framework-, and transport-neutral unless their package contract explicitly says otherwise.
5. Run `pnpm verify` before review.
6. Perform an independent reverse-engineering/QC pass without modifying code.
7. Merge only after the RE verdict is `PASS`.

## Architectural shortcuts that are forbidden

- Raw LLM output directly to DOM.
- Raw tool output directly to DOM.
- Planner-to-DOM dependencies.
- Runtime-web business API calls.
- Components performing arbitrary network calls.
- Hidden global runtime state.
- React/browser concepts inside protocol or runtime-core.
- Customer-specific names inside generic packages.
- Unvalidated patches.
- Unregistered actions or capabilities.
- Silent security fallbacks.
- Arbitrary JavaScript or HTML execution.
