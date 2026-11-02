# Flow Atlas MVP

Flow Atlas is a local-first, synthetic architecture-map editor. It combines a manually editable graph, deterministic educational traffic simulation, and bounded source discovery over explicitly allowed local roots. It is not a production observability or dependency-analysis product.

## Run locally

Requirements: Node.js 22+ and npm. From the project root:

```sh
npm install
npm start
```

Open <http://127.0.0.1:4317>. The server binds to loopback only. By default, discovery exposes the checked-in synthetic fixture at `server/fixtures/synthetic/`; no corporate or arbitrary directory is configured.

To allow another local synthetic repository, set the server-side allowlist explicitly (replace the example path with a directory you own):

```sh
FLOW_ATLAS_ROOTS='[{"id":"demo","label":"Synthetic demo","path":"/path/to/your/synthetic-project"}]' npm start
```

The application accepts opaque root IDs from that allowlist, not client-supplied paths. The server checks loopback binding, Host and Origin, allowed root IDs, canonical containment, symlinks, file identity, safe extensions, sensitive filenames, traversal limits, and actual bytes read. There is no arbitrary file-reading endpoint, code execution, or source upload/transmission. Only the small supported metadata formats are parsed.

## Build and checks

```sh
npm run build       # production bundle in dist/
npm run typecheck   # TypeScript checks
npm test            # production build plus native Node test suite
npm run test:e2e    # Playwright + Chromium browser checks
```

The Playwright server reuses the local `npm start` server on port 4317 when available; the browser suite requires a built `dist/` first (included in `npm test`). Browser checks exercise synthetic content only. The human-review exercise and separate answer key are in [`docs/human-review-exercise.md`](docs/human-review-exercise.md) and [`docs/human-review-answers.md`](docs/human-review-answers.md). Task 4's commands, outcomes, and limitations are recorded in `.superpowers/sdd/2026-11-02-flow-atlas-mvp/task-4-report.md`; Gitleaks passed, while a fresh Semgrep registry scan was blocked by a proxy error. Alibaba review integration and GitHub CLI (`gh`) were unavailable; no Alibaba review occurred.

## Layout

- `src/main.ts`, `src/graph-view.tsx`, `src/styles.css`: browser UI and interactions.
- `src/shared/`: graph schema, presets, validation, and deterministic simulation.
- `src/store/`: immutable graph state and selectors.
- `server/index.ts`, `server/api.ts`, `server/security/`: loopback HTTP server, strict API, allowlisted roots, bounded file walker.
- `server/scanner/`: read-only metadata heuristics and evidence-backed graph generation.
- `server/fixtures/`: synthetic examples only.
- `e2e/`: browser coverage; `docs/screenshots/`: synthetic manual and discovered maps.

## Discovery heuristics and confidence

Discovery recognizes Spring Boot applications and module ownership from `pom.xml`, `build.gradle`, and `build.gradle.kts`; Spring application names and selected PostgreSQL/Redis settings from properties/YAML; literal or safely resolved HTTP URLs from common Java/Kotlin client calls and annotations (including Feign); Kafka/RabbitMQ use; and limited Compose/Kubernetes service and image declarations. YAML parsing is intentionally small and is not a full YAML implementation. It does not execute builds, resolve arbitrary environment variables, infer runtime traffic, or scan dependency trees.

Each relationship carries an evidence file path, line number, protocol, and `HIGH` or `MEDIUM` confidence. Literal source endpoints and explicit code-level relationships are `HIGH`; configuration-derived database/cache settings are `MEDIUM`. Safely resolved config URLs currently resolve to sanitized endpoints but are mistakenly labeled `HIGH`; see the finding in [`docs/human-review-answers.md`](docs/human-review-answers.md). Unsupported syntax, unresolved URL placeholders, dynamic construction, aliases and framework-specific semantics may be missed. Endpoint identity retains host and port while omitting URL credentials, paths, fragments and queries. Exact known service identities may map to local service nodes; unrelated DNS suffixes are not treated as aliases. Evidence is a pointer only: source lines/snippets are not returned.

## Simulation, graph import/export

Traffic, latency, health, failure propagation, and retries are deterministic educational simulation values, not measurements of a running system. Use intensity, pause/resume, retry, failure and recovery controls to explore map behavior; simulated failures are not emitted to services.

Export downloads the full validated graph as JSON. Import accepts a validated graph JSON document up to 1 MB; malformed input leaves the current graph unchanged. Presets and imported maps are client-side editable. Manual relationships have no source evidence unless they came from discovery, and filtering does not delete evidence or graph data.

## Security boundary and limitations

Use only repositories and fixtures that you are authorized to inspect. Configure roots through `FLOW_ATLAS_ROOTS`; never expose this demo server to a network or treat its heuristic output as a source of truth. Discovery limits depth, entry count, file count, elapsed time and total actual bytes read, and skips symlinks, ignored build/dependency directories and sensitive filenames. These controls reduce accidental exposure but do not replace OS-level isolation or a security review. The product intentionally has no external discovery calls, arbitrary path API, source execution, credential access, or remote source transmission.
