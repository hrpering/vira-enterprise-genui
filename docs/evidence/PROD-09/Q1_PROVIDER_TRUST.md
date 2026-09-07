# PROD-09 Q1 — Provider Trust Foundation

Provider Trust is intentionally narrower than Provider Connection. `provider-connection` remains the owner of provider/connector identity, enterprise scope, SecretRef metadata, granted scopes, operation bindings and pending/active/revoked/expired lifecycle.

`provider-trust` evaluates bounded trust evidence for an already canonical connection. Trust requires exact connection/provider/scope/credential parity, an active non-expired connection, healthy evidence, issue/health timestamps not in the future, unexpired evidence and no effective revocation. Trust validity is capped by the earlier of connection expiry and evidence expiry.

`provider-trust` does not grant governance permission, entitlement, Action execution authority, retry authority or postcondition verification.
