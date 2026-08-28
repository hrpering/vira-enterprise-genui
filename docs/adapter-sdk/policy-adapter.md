# Adapter SDK Policy Adapter

Policy Adapter selects semantic **composition-policy references** for a validated Experience Recipe. It does not carry or evaluate authorization rules.

A mapping is exact:

```text
recipe: travel.flight.search-recipe
  -> layoutPolicy: acme.policy.layout.travel-search
  -> disclosurePolicy: acme.policy.disclosure.standard
```

Policy references are namespaced semantic identifiers only. They are registry keys that an owning host/Composer integration may later resolve to actual Layout Policy and Disclosure Policy values. Raw layout families, disclosure values, CSS, permission rules, network policies, roles, claims, or callbacks do not belong here.

There is no default/fallback mapping. An unmapped recipe fails closed.

Passing this adapter contract grants no Runtime Core permission and no network/tool access.