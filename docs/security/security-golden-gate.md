# Security golden gate

This integration gate locks the MVP security owners together without collapsing their responsibilities.

```text
untrusted/generated text -> PlainTextContent -> plain-text sink only
semantic capability      -> exact allowlist  -> allow / deny
outbound request          -> NetworkPolicy    -> exact origin + method
validated NetworkPolicy   -> CSP requirements -> host enforcement guidance
```

The controls are complementary, not substitutes:

- Plain-text authorization does not grant a capability.
- Capability authorization does not grant network access.
- CSP `connect-src` requirements do not replace NetworkPolicy method checks.
- A Component Adapter mapping is not authorization.
- CSP guidance does not make Vira the owner of the host application's CSP header.

The golden test uses only public Security package APIs. It intentionally adds no production behavior and exists to catch cross-control drift, including wildcard network regression, HTML sink expansion, fuzzy capability authorization, mutation leakage, or CSP/network responsibility conflation.
