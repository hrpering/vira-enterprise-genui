# MASTER-13 — Studio Brand Console

## Responsibility

Provide an enterprise-scope-aware console domain facade over the existing canonical Studio Brand and Studio Workbench authorities.

```text
Enterprise Scope
      ↓
Studio Brand Console
      ├── validate/import Brand Package -> studio-brand
      ├── inspect templates/catalog
      └── open template -> studio-workbench
                              ├── edit
                              ├── preview
                              └── canonical publish
```

## Invariants

1. MASTER-13 does not define a second Brand schema.
2. `createStudioBrandPackage()` remains Brand Package validation authority.
3. `createStudioWorkbenchSession()` remains authoring/editing authority.
4. Console sessions bind one exact organization/project/environment scope.
5. Enterprise scope input passes the canonical JSON boundary before use; accessor/prototype-backed hostile input fails closed.
6. Template IDs resolve exactly within the active validated Brand Package; no fallback.
7. Brand package data is immutable canonical output from studio-brand.
8. Console does not own multi-platform rendering; MASTER-14 does.
9. Console does not own deployment promotion; MASTER-11 does.
10. Console does not expose raw secrets; MASTER-12 SecretRef/lease boundaries remain intact.
11. Console is exported through the canonical `genui` facade; product code should not require private deep imports.

## Verification policy

Hosted CI is deferred. Final local/full CI must cover exact scope, hostile accessor scope rejection, invalid Brand Package rejection, exact template lookup, Workbench handoff and public package-boundary hygiene.
