# Active Phase

**Phase:** MASTER-25R — Enterprise RC Evidence Closure  
**Status:** Q0–Q6 ACTIVE / EXTERNAL EXACT-HEAD EVIDENCE REQUIRED  
**Base SHA:** `9d451b809e14538edcf2c0ed2d913de8fc724377`  
**Previous:** CLEAN-00 merged via PR #184  
**Next after merge:** Enterprise GenUI RC1 → MASTER-26

MASTER-25 implementation already exists in `main`. MASTER-25R does not add a second release path: it re-binds the existing repository/browser, native conformance, real iOS Simulator, real Android Emulator and external-brand proof gates to the exact post-CLEAN-00 release tree.

Current blocker is external proof evidence whose `viraHead` must equal the exact executable checkout. No RC1 declaration and no MASTER-26 branch is allowed until `pnpm verify:enterprise-rc` passes with that evidence and the resulting PR completes independent Q8 review.
