# Flow Atlas MVP — final verification

Date: 2026-11-02. Branch: `feature/flow-atlas-mvp`, based on `develop` at `1f12e65`. This release checks the Flow Atlas project and checked-in synthetic fixtures only; no corporate tree or real exports were accessed.

## Fresh release checks

| Command | Result |
|---|---|
| `npm test` | Passed: 36 tests, 0 failed; production build succeeded (177 modules). |
| `npm run typecheck` | Passed: `tsc --noEmit`. |
| `npm run build` | Passed: 177 modules. Existing informational `@xyflow/react` `"use client"` bundler warning remains. |
| `npm run test:e2e` | Passed: 2 browser tests, 0 failed. |
| `git diff --cached --check` | Passed on staged docs/screenshots. |
| `gitleaks dir --redact --no-banner .` | Passed: approximately 1.54 MB scanned; no leaks. |
| `gitleaks git --redact --no-banner .` | Passed: 10 existing commits / approximately 310.88 KB scanned; no leaks (before the docs commit). |

Earlier scoped final-fix scan evidence (not rerun as part of this release): Semgrep production JavaScript/TypeScript ran 74 rules across 28 targets with zero findings; separate non-deployed synthetic Kubernetes fixtures produced three findings, and the intentionally malformed YAML fixture produced one parser error. Those fixture findings are missing `runAsNonRoot` (line 7) and `readOnlyRootFilesystem` (lines 9 and 14); the parse error is deliberately malformed fixture YAML at line 3. No production JS/TS findings or parser errors were reported.

## Product scope and evidence limits

Flow Atlas is a local-first synthetic architecture-map editor with deterministic educational traffic simulation and bounded read-only source discovery. Supported discovery is heuristic: Spring Boot/module ownership from Maven/Gradle files; selected PostgreSQL/Redis properties and YAML; literal/supported resolved HTTP client endpoints including Feign; Kafka/RabbitMQ patterns; and limited Compose/Kubernetes service/image declarations. It does not execute builds, resolve arbitrary environments/framework profiles, inspect dependency trees, or infer runtime traffic. Supported tech and confidence semantics are documented in the [README](../README.md).

The checked-in demo root `server/fixtures/synthetic/` contains two synthetic Spring services (`orders`, `catalog`), Maven and Gradle examples, Java client/listener examples, properties, Compose and Kubernetes examples. Regression fixtures under `server/fixtures/scanner-regressions/` are synthetic parser/security cases, not production data. No real Alibaba integration or external repository review was run; it was unavailable. Semgrep fixture findings are not deployed-manifest findings.

RabbitMQ deliberately does not infer exchange-to-queue bindings: real named-exchange topologies can therefore appear disconnected. Only supported simple literal argument shapes are recognized; dynamic, multiline, unsupported or unsafe syntax can be omitted. The default-exchange two-argument literal form is modeled as a destination. Feign resolution is limited to `${clients.<alias>.url}` in scanned module properties/YAML; resolved config evidence is MEDIUM and literal annotation evidence HIGH. The YAML parser is intentionally partial. Evidence is a file/line pointer, not source text.

Other limits: simulation values are deterministic educational values, not observations; discovery only examines explicitly allowlisted local roots and does not transmit source. Local checks do not constitute a security certification or validate actual Alibaba integration behavior.

## Review and human validation

The approved scoped final review addressed the RabbitMQ identity/binding conservatism, Feign evidence/confidence, and readable discovered names. It approved the bounded final-fix wave, not a fresh comprehensive review of every unchanged security boundary. Remaining risk includes heuristic false negatives, incomplete YAML/framework resolution, and intentionally absent RabbitMQ binding edges. See the separate [human review exercise](human-review-exercise.md) and [answer key](human-review-answers.md).
