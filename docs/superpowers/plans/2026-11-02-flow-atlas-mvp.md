# Flow Atlas MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-first service dependency atlas with a safe Java/Spring scanner, editable graph, evidence, and deterministic simulation.

**Architecture:** A same-origin Vite React/TypeScript client uses React Flow and Zustand with a versioned shared graph schema. A localhost-only Node API owns root allowlisting, secure bounded file traversal, and deterministic discovery; the client renders scanner findings, manual edits, and simulation without executing source.

**Task 3 implementation note:** Network access was restored before implementation; the frontend uses the preferred React + TypeScript + Vite + React Flow + Zustand stack. Vite bundles the frontend and the Node server serves only the built index and constrained hashed assets on loopback.

**Tech Stack:** React, TypeScript, Vite, React Flow, Zustand, Node.js, shared JSON schema, Vitest, and Playwright browser tests where the browser tooling is available.

**Spec:** `docs/superpowers/specs/2026-11-02-flow-atlas-design.md`

## Global Constraints

- Backend binds only to `127.0.0.1`; UI/API are same-origin and mutation requests validate origin.
- Default root allowlist is synthetic fixtures only; extra scan roots require explicit server CLI/environment configuration.
- Canonicalize and bound all filesystem traversal; reject traversal and symlink escapes; never execute repository code.
- Provide only `GET /api/roots` and `POST /api/discover { rootId }`; evidence is bounded/sanitized or referenced by scan-local opaque IDs, never by an unrestricted file endpoint.
- Tests use synthetic fixtures only. Never scan corporate repositories or directories.
- Discovery is deterministic; every discovered edge has file, line, protocol, and confidence evidence.
- Validate and size-limit graph JSON import/export; simulation is deterministic and has no external side effects.

## Review Focus

- A symlink or traversal path escapes an allowed root — scanner test asserts no outside file is read and reports a safe rejection.
- An oversized/deep repository or request exceeds bounds — API/scanner tests assert bounded failure without crash or unbounded response.
- Malformed or hostile imported graph JSON — import tests assert schema/size rejection without corrupting current graph.
- Ambiguous source pattern looks like a dependency but lacks reliable evidence — fixture test pins line, protocol, and confidence and does not overstate certainty.
- Repeated scan or simulation run changes output — determinism tests assert identical graph IDs/findings and seeded simulation output.

---

## File map

- `package.json`, `tsconfig*.json`, `vite.config.ts`, `vitest.config.ts`: workspace scripts and frontend/test tooling.
- `src/shared/graph.ts`, `src/shared/validation.ts`, `src/shared/presets.ts`, `src/shared/simulation.ts`: graph contracts, validation, presets, deterministic simulation.
- `server/index.ts`, `server/security/roots.ts`, `server/security/walk.ts`, `server/api.ts`: localhost startup, canonical allowlist boundary, bounded traversal, narrow API.
- `server/scanner/{index,java,config,findings}.ts`: deterministic framework/dependency parsing and evidence normalization.
- `server/fixtures/synthetic/`, `server/**/*.test.ts`: synthetic-only scanner/security/API fixtures.
- `src/store/graph-store.ts`, `src/components/{Atlas,Toolbar,Inspector,Filters,DiscoveryPanel,SimulationControls}.tsx`, `src/styles.css`: interactive editor, discovery, evidence, filters, and simulation controls.
- `e2e/`, `docs/`: browser and security coverage plus user-facing local setup/usage documentation.

## Task 1: Workspace, shared graph contract, presets, and simulation

**Files:** Create workspace/config files above; `src/shared/graph.ts`, `validation.ts`, `presets.ts`, `simulation.ts`, and colocated tests.

**Interfaces:** `GraphDocument { version: 1; nodes: AtlasNode[]; edges: AtlasEdge[] }`; `AtlasNode` has stable `id`, one of six types (`service`, `database`, `cache`, `topic`, `external`, `gateway`), position, and JSON-safe data; `AtlasEdge` has stable `id`, source/target, optional protocol, and `Evidence[]` (path, line, protocol, confidence). Export `validateGraph(input: unknown): GraphDocument`, `createPreset(name: PresetName): GraphDocument`, and `stepSimulation(graph, settings, seed, tick): SimulationFrame`.

- [ ] **RED** Add tests for graph round-trip and malformed input rejection, each preset's valid node/edge set, and stable seeded simulation metrics plus pause/intensity/failure/recovery/retry behavior; run targeted tests and observe failure.
- [ ] **GREEN** Implement the versioned contracts, runtime validation/size limits, named presets, and pure deterministic simulation; no clock or network use.
- [ ] **VERIFY** Run the shared unit tests and TypeScript check; confirm identical inputs yield identical serialized results.
- [ ] **COMMIT** `git add ... && git commit -m "feat: add shared graph and simulation model"`.

## Task 2: Secure roots, deterministic scanner, and API

**Files:** `server/security/{roots,walk}.ts`, `server/scanner/{index,java,config,findings}.ts`, `server/api.ts`, `server/index.ts`, `server/fixtures/synthetic/`, server unit tests.

**Interfaces:** `listRoots(): SafeRoot[]`; `discover(rootId: string): Promise<GraphDocument>`; `POST /api/discover` accepts exactly `{ rootId }`. Root resolution canonicalizes configured roots and all candidates, refuses symlink escapes, enforces file/depth/byte caps, and exposes no path-taking read API. Findings normalize stable IDs and include `{ path, line, protocol, confidence }` evidence.

- [x] **RED** Create synthetic Maven/Gradle multi-module fixtures with Spring service, Feign/RestTemplate/WebClient/HTTP interface calls, Kafka/Rabbit, PostgreSQL/Redis, Compose, and Kubernetes; test expected findings and evidence. Add symlink escape, traversal, unconfigured-root, oversized-input, malformed-body, origin, and response-bound tests; run targeted tests and observe failure.
- [x] **GREEN** Implement deterministic parsers, deduplication, canonical allowlist traversal, bounded same-origin API, and loopback-only server. Keep the configured default root fixture-only; gate any additional roots behind explicit CLI/environment configuration.
- [x] **VERIFY** Run server tests and typecheck; repeat fixture scan and compare output byte-for-byte; verify a test outside the allowlist is never read. (Native tests and deterministic fixture check passed; typecheck unavailable because `tsc` is not installed.)
- [x] **COMMIT** `git add ... && git commit -m "feat: add safe deterministic repository discovery"`.

## Task 3: Polished graph editor, discovery, and evidence UX

**Files:** `src/store/graph-store.ts`, components and styles listed in File map, UI tests, package scripts as needed.

**Interfaces:** Store actions `addNode(type, position)`, `connect(source, target)`, `replaceGraph(document)`, `setFilters(filters)`, `setSimulation(settings)`. UI consumes `GraphDocument`, calls `GET /api/roots` and `POST /api/discover { rootId }`, and offers details for node/edge evidence. Manual editing covers six node types, connections, presets, and validated JSON import/export.

- [x] **RED** Add store regression tests for simulation state preservation and imported ID collisions; run targeted tests and observe failure.
- [x] **GREEN** Implement the responsive React Flow atlas, inspector/evidence, filters, discovery, import/export, and deterministic simulation controls.
- [x] **VERIFY** Run Node unit tests, TypeScript check, production build, and Playwright browser flow; verify static assets are bundled and restricted.
- [x] **COMMIT** Commit Task 3 implementation and record the review package; implementation is awaiting review.

## Task 4: End-to-end safety, review, docs, and publish-ready state

**Files:** `e2e/`, `server/**/*.test.ts`, relevant UI tests, `README.md`, `TOOLING.md`.

**Interfaces:** Document loopback startup, fixture-only default and explicit additional-root opt-in, scan scope, supported heuristics, evidence confidence, import/export, and simulation limitations. E2E tests use only the synthetic fixture root.

- [ ] **RED** Add browser flows for fixture discovery → evidence inspection/filter → edit/export/import → seeded simulation controls, and security regression flows for rejected outside roots and invalid input; run targeted tests and observe failure.
- [ ] **GREEN** Fix only failures attributable to this feature; document limitations and safe local configuration, with no claims of exhaustive static analysis.
- [ ] **VERIFY** Run changed-area tests, typecheck, production build, staged/working-tree Gitleaks scan, and review `git diff --check` plus the full diff. Run browser tests if a Playwright browser is available; otherwise record the blocker and leave tests ready to run.
- [ ] **COMMIT** `git add ... && git commit -m "test: harden flow atlas MVP and document usage"`.
