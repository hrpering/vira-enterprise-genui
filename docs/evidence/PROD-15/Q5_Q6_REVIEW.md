# PROD-15 Q5/Q6 — Security, UX and architecture review

## PASS findings

- web code imports no canonical semantic owner and cannot become Application, runtime, transaction or billing authority;
- BFF requests are same-origin, no-store and explicitly scoped;
- uncertain/offline copy is fail-closed and does not claim provider success;
- protected mutations are not simulated by client state;
- Radix dialog preserves focus semantics on mobile;
- command search, navigation and state controls expose visible focus;
- axe serious/critical findings are zero in desktop and mobile projects;
- motion explains evidence progression and is disabled under `prefers-reduced-motion`.

## Deferred

Authenticated production API wiring, real SSE traffic, Vercel smoke and design-partner UAT remain live gates. The code exposes reconnect/offline semantics but does not manufacture live evidence.
