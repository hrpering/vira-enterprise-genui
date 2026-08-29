# Deny-by-default network policy

The Security package evaluates outbound request intent; it does not execute requests.

```text
NetworkPolicy
  exact HTTPS origin -> explicit methods
                +
        candidate request
                |
                v
          allow / deny
```

An empty `rules` array is valid and denies every request. There is no wildcard, subdomain suffix, URL-prefix, or implicit same-origin behavior. Origins are parsed and normalized with the platform URL parser, so equivalent default-port forms collapse to one origin and duplicate normalized origins are rejected.

Only credential-free HTTPS is accepted. A configured origin is origin-level authorization: paths and query strings under that origin may pass when the method is also allowed. Per-path endpoint restrictions are deliberately not claimed by this MVP contract.

This gate is not a complete SSRF defense. It does not resolve DNS, inspect redirect chains, classify private networks, or execute a request. The host/network executor remains responsible for applying the decision immediately before I/O and for enforcing redirect/DNS policy appropriate to its environment.
