# PROD-17 Q0–Q9 provisional evidence

The orchestrator is evidence-only and preserves existing semantic owners. Contract tests require ordered, unique, exact tenant/application evidence and reject restart gaps, duplicate delivery, TOCTOU, partial, mismatch, uncertain, rollback-gap, and restore-gap simulations.

`verify:production-e2e` and `verify:production-mvp-rc` are code/CI gates. Passing them means `PROVISIONAL CODE-COMPLETE`, never RC. Live pilot, deploy, UAT, SLO, and DR blockers remain open.
