# System overview

## Product boundary

Vira Enterprise GenUI consumes canonical intent, task state, and normalized domain data. It plans and composes a semantic experience, renders that experience in a host web application, and emits canonical user actions back to the host.

The host remains responsible for AI inference, business logic, authentication, authorization outside the experience boundary, persistence, and execution of business-side actions.

## Primary flow

```text
Host AI/backend
  -> Intent + State + DomainData
  -> protocol
  -> planner
  -> composer
  -> runtime-core
  -> adapter-sdk
  -> runtime-web
  -> host UI

host UI action
  -> runtime-web
  -> runtime-core permission/lifecycle checks
  -> canonical Action
  -> host application
```

## Design principles

1. Protocol first.
2. Capability is semantic and is not a component.
3. Runtime-core is the state source of truth.
4. Planner decides what experience is needed; composer decides semantic organization; renderer only renders.
5. Raw external data is normalized before planning/rendering.
6. Business execution stays with the host.
7. Network access is not a default runtime capability.
8. Framework wrappers remain thin.
