# Action flow

Browser events and business actions are different concepts.

```text
DOM click/change/submit
        |
        v
 runtime-web event bridge
        |
        v
 canonical Action
        |
        v
 runtime-core permission + lifecycle checks
        |
        v
 host action adapter/callback
        |
        v
 existing host/backend/tool
```

The runtime must not hard-code customer endpoints. A canonical action such as `search.submit` is resolved by the host or adapter into the customer's own execution mechanism.
