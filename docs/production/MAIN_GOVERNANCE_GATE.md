# Main Governance Release Gate

This gate closes the repository-governance item in `docs/production/LIVE_GATE_BLOCKERS.md`. It is intentionally separate from PROD-13/PROD-14 exact-head evidence.

## Required GitHub configuration

Configure classic branch protection for `main` in repository settings with all of the following:

- require a pull request before merging;
- require status checks to pass before merging;
- require branches to be up to date before merging (strict status checks);
- required status contexts:
  - `verify`
  - `ios-native`
  - `android-native`
- no user/team/app pull-request bypass allowances;
- force pushes disabled;
- branch deletion disabled.

The current CI workflow defines these three job names directly, so the required status contexts must use these exact strings.

## Proof command

Use an admin-capable token that can **read branch protection**. The token is process-only evidence input and must never be committed.

```bash
VIRA_GITHUB_ADMIN_READ_TOKEN='...' \
node tooling/verify-main-governance.mjs
```

The verifier reads live GitHub API truth for `hrpering/vira-enterprise-genui` / `main` and fails closed on:

- missing token or insufficient permission;
- missing branch protection;
- missing PR requirement;
- any missing required status context;
- non-strict status checks;
- any configured pull-request bypass allowance;
- enabled force pushes;
- enabled branch deletion.

A production-authoritative pass is only the structured stdout result containing:

```json
{
  "gate": "main-governance",
  "authority": "live-github-api",
  "repository": "hrpering/vira-enterprise-genui",
  "branch": "main",
  "closureEligible": true
}
```

Do not accept screenshots, repository UI appearance, fixture JSON, or a previous branch state as substitute evidence.

## Current status

As of the branch that introduced this verifier, `main` was observed as unprotected through the connected GitHub read surface. Therefore this document and verifier **do not themselves close the gate**. An administrator must first configure protection and then run the live verifier.
