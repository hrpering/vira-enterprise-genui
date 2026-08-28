# Package boundaries

| Package | Responsibility | Must not own |
| --- | --- | --- |
| `protocol` | Versioned canonical contracts | DOM, React, CSS, network, customer APIs |
| `runtime-core` | State, actions, patches, lifecycle, permissions, typed errors | DOM rendering, business APIs, intent inference |
| `planner` | Resolve state/capabilities and produce semantic experience plans | HTML/CSS/DOM rendering, customer API execution |
| `composer` | Organize plans into semantic regions using layout/disclosure policy | Business reasoning, network calls, DOM rendering |
| `adapter-sdk` | Adapt brand/domain/intent/recipe/component/data/action/policy surfaces | Runtime state ownership |
| `runtime-web` | Render composed experiences and bridge browser events | Intent resolution, business reasoning, raw tool interpretation |
| `web-component` | Thin `<vira-experience>` wrapper | Duplicate runtime/planner logic |
| `react` | Thin React wrapper | Duplicate runtime/planner logic |
| `security` | Cross-cutting sanitization, allowlists, CSP and network policy contracts | Business execution |
| `telemetry` | Provider-neutral telemetry interface | Raw prompt/PII collection by default |
| `tool-bridge` | Normalize external tool results into domain data | Direct rendering |

## Planned internal modules

### runtime-core
`state`, `actions`, `patches`, `lifecycle`, `permissions`, `errors`

### protocol
`intent`, `domain-data`, `capability`, `experience-plan`, `patch`

### planner
`state-resolver`, `capability-resolver`, `experience-planner`, `composition-planner`

### composer
`semantic-regions`, `layout-policy`, `disclosure-policy`, `composition-engine`

### adapter-sdk
`brand`, `domain`, `intent`, `recipe`, `component`, `data`, `action`, `policy`

### runtime-web
`renderer`, `DOM lifecycle`, `events`, `accessibility`, `responsive`, `state bindings`
