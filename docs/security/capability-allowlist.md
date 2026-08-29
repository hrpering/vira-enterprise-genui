# Exact capability allowlist

The Security package answers one narrow question:

```text
validated upstream capability key
             +
       exact allowlist
             |
             v
        allow / deny
```

It deliberately does not decide whether a capability key is semantically valid. Protocol remains the owner of capability syntax/version validation. Security treats the key as an opaque bounded string and performs exact, case-sensitive membership only.

There are no wildcards, namespace prefixes, regular expressions, fuzzy matches, roles, claims, inherited permissions, or implicit defaults. An empty allowlist is a valid deny-all policy.

This separation prevents Security from becoming a second capability protocol implementation while still providing a simple fail-closed gate that Runtime Web or a host policy layer can apply after canonical validation.
