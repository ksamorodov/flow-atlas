# Flow Atlas MVP Design

## Intent

Flow Atlas is a local-first tool for developers to see how services in a Java/Spring repository communicate. It combines a manually editable React Flow canvas with deterministic source discovery, evidence-backed edges, and a lightweight simulation. The MVP should make architecture understandable without sending source code anywhere or executing repository code.

## Goals

- Provide a React + TypeScript + Vite editor using React Flow and Zustand. Support manual nodes and connections, six node types, presets, and JSON import/export.
- Provide a Node.js backend that scans explicitly allowed local roots and returns deterministic findings for Java/Spring Maven or Gradle (including multi-module) services; Feign, RestTemplate, WebClient, and HTTP interfaces; Kafka/Rabbit topics; PostgreSQL/Redis; and Compose/Kubernetes declarations.
- Attach file, line, protocol, and confidence evidence to every discovered edge. Let users filter the graph and inspect node/edge details.
- Simulate a graph from derived metrics with pause/resume, intensity, failure/recovery, and retries; simulation is visualization, not execution or a performance prediction.
- Keep the product local, safe by default, and testable on synthetic fixtures.

## Non-goals and anti-goals

- No repository code execution, external service calls, telemetry, cloud service, or automatic publishing.
- No promise of complete static analysis or inferred runtime truth; uncertain findings must retain confidence and evidence.
- No unrestricted filesystem API, arbitrary path access, corporate repository scans, or real-repository experiment without explicit isolation confirmation.

## Constraints and safety

- Bind the backend to `127.0.0.1`; serve the UI and API same-origin, validate same-origin mutation requests, and bound request, response, and scan sizes.
- Default scan allowlist is fixture-only. Additional roots require explicit server CLI/environment configuration. Canonicalize roots and candidates, reject traversal and symlink escapes, and re-check boundaries before reading.
- Expose only `GET /api/roots` and `POST /api/discover` with `{ rootId }`; discovery returns sanitized, bounded evidence or opaque `scanId`/`evidenceId` references resolved only within the scan. Never expose a general-purpose file-reading endpoint.
- Use synthetic fixtures exclusively in automated tests. Do not inspect corporate directories.

## Approaches considered

1. **Browser-only editor with imported scan results.** Smallest server surface, but cannot safely and consistently enumerate repositories or enforce a root allowlist from a browser.
2. **Local Node service with a React/Vite client (chosen).** Enables canonicalized filesystem access behind a narrow localhost API while retaining a familiar graph editor. It adds a trust boundary that must be tested explicitly.
3. **Remote analysis service.** Easier centralized updates, but conflicts with local-first privacy and source-code handling; rejected.

## Design decisions

- **Task 3 implementation:** network access was restored and the preferred React + TypeScript + Vite + React Flow + Zustand stack is used. Vite bundles all frontend dependencies locally; the localhost Node server exposes only the built index and strict hashed-asset allowlist. Native Node tests remain in use for backend and shared modules.

- Keep a shared, versioned JSON graph model for manual and discovered graphs. Stable IDs, typed nodes, edges, positions, and evidence make import/export and frontend/backend boundaries explicit.
- Use deterministic rule-based parsing and normalized paths/line references. Findings deduplicate by stable identity; confidence is explicit, never silently promoted to certainty.
- Model the simulation as a pure deterministic transformation of graph + simulation settings + seed/time step. No network or wall-clock dependencies; metrics derive from topology and configurable intensity.
- UI filtering and details consume the same evidence-bearing graph model. Imported JSON is size-limited and schema-validated before use.
- Keep the default fixture root configured by the server; extra roots are explicit opt-ins. Do not scan until the user selects a root and starts discovery.

## Open implementation choices

The builder may choose package boundaries and concrete scanner libraries after checking current dependency availability, but must preserve the API, safety rules, evidence shape, graph semantics, and synthetic-only test policy above. This design was authorized for autonomous local planning; no product code or dependencies are added in this setup task.
