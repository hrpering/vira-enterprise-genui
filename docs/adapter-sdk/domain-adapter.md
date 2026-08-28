# Adapter SDK Domain Adapter

Domain Adapter Contract declares which canonical DomainData shapes belong to a specific enterprise integration boundary.

Each contract contains:

- a semantic adapter `id`;
- exactly one semantic `domain` namespace;
- an explicit allowlist of DomainData `type` values for that domain.

`normalizeDomainDataForAdapter(contract, data)` first validates the contract, then delegates payload normalization to Protocol's DomainData parser, and finally enforces exact domain + type membership. Unmapped domain/type values fail closed.

This allowlist is **schema/integration membership, not authorization**. Passing it does not grant permission to call a tool, access a network, expose data, execute an action, or bypass Runtime Core permissions. Those decisions remain with their owning layers.

The contract is descriptive only. It contains no endpoint, token, credential, HTTP method, callback, parser function, execution code, permission rule, or customer-specific transport configuration. External APIs/tools are invoked by owning host/tool layers; this boundary only decides whether already-produced canonical DomainData matches this adapter contract.
