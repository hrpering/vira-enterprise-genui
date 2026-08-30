# Mock Airline Domain

A deterministic fake airline repository used by the Vira Enterprise GenUI demos.

It is intentionally **not** UI state and **not** LLM-generated content. The same package is consumed by:

- the Chat demo server tools,
- the airline brand renderers for fare/seat/baggage/extra catalogs,
- Experience Studio live runtime data bindings.

This gives the demos one source of truth while keeping the project independent from a real airline backend.

## Data owned here

- airports and route aliases,
- scheduled mock flights and availability,
- fare families,
- seat inventory,
- baggage,
- insurance and extras,
- special-assistance / missed-flight / visa guidance fixtures.

## Contract

`searchFlights()` accepts a structured search request and returns deterministic structured offers.

`createMockAirlineRuntimeData()` exposes a flat path/value view for Studio `domain` bindings. The path names are catalogued by the Experience Studio demo.

This package is demo infrastructure only. A production integration replaces it with a customer-owned domain adapter/API without changing the Studio document model.
