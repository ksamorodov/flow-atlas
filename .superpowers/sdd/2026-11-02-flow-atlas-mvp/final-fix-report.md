# Final whole-branch fix wave report

Date: 2026-11-02. Base: `42f284a` (`BASE42f284a`). Scope stayed in this Flow Atlas clone and synthetic fixtures; no corporate tree, corporate access, pushes, or remote operations.

## Fixes

- **RabbitMQ topology —** `server/scanner/index.ts:101–129,247–280` now recognizes only conservative literal argument shapes. Three-argument `convertAndSend(exchange, routingKey, payload)` creates a distinct RabbitMQ `exchange-routing-key` node (separate exchange/routing metadata); `@RabbitListener` produces its own `queue` identity. Two-argument `convertAndSend(literalRoutingKey, payload)` represents the proven default-exchange destination. Unsupported/dynamic forms are omitted. No exchange-to-queue binding is inferred, including when source contains an explicit binding declaration or routing key equals a queue. Kafka topic code remains unchanged. Test coverage in `server/scanner/scanner.test.ts` covers same-key/no-binding topology, explicit-binding omission, default exchange, and separate listener nodes.
- **Feign evidence —** `server/scanner/index.ts:217–228` retains the actual config entry and cites its path/line with MEDIUM confidence when resolving a supported placeholder. Literal annotation URL evidence remains HIGH at the annotation location. Unresolved explicit placeholders create no invented target. Regression assertions pin sanitized host/port and exact path/line/confidence separately.
- **Readable UI —** `src/graph-view.tsx` and the connect dialog in `src/main.ts` choose `data.label`, then `data.name`, then ID. React text rendering and `textContent` remain in place, so names stay escaped. Playwright checks a discovered card's actual readable service title and selected evidence; `docs/screenshots/discovered-graph.png` was refreshed and visually inspected.
- Updated `README.md`, `TOOLING.md`, `docs/human-review-exercise.md`, `docs/human-review-answers.md`, `final-scan-evidence.md`, and the progress ledger to reflect current evidence and the deliberate scanner limits.

## TDD and mutation evidence

Focused RED was observed before production changes:

- Feign regression failed with a behavior mismatch: actual `[{ path: 'orders/src/main/java/example/Clients.java', line: 3, confidence: 'HIGH' }]`, expected `[{ path: 'orders/src/main/resources/application.yml', line: 3, confidence: 'MEDIUM' }]`.
- RabbitMQ regression failed at `assert.ok(exchangeRoute)` because the old scanner did not preserve a distinct exchange/routing destination.
- These were assertion failures, not syntax/runner errors. After implementation, `node --experimental-strip-types --test server/scanner/scanner.test.ts` passed **6/6**.

Mutation proof: temporarily changed the production Rabbit destination display/identity to use the routing key and queue identity, then ran only `keeps RabbitMQ exchange destinations`. The test failed as expected at the missing `exchangeRoute` assertion. The mutation was restored by replacing only those exact changed lines; focused scanner tests and the full suite then passed. The observed mutation failure is preserved in `mutation-proof.log` (ignored by project log rules; key assertion is recorded here).

## Verification

| Command | Outcome |
|---|---|
| `node --experimental-strip-types --test server/scanner/scanner.test.ts` | 6 passed, 0 failed |
| `npm test` | 36 passed, 0 failed; includes Vite build |
| `npm run typecheck` | Passed (`tsc --noEmit`) |
| `npm run build` | Passed; 177 modules. Existing `@xyflow/react` `"use client"` bundler warning remains informational. |
| `npm run test:e2e` | 2 passed, 0 failed (full editing/discovery/evidence flow and paused-graph flow) |
| `semgrep scan --config p/javascript --config p/typescript --metrics=off --disable-version-check ...` | 74 rules, 28 production JS/TS targets, 0 findings; full command and output in `final-scan-evidence.md` and `semgrep-final.json` |
| Separate `semgrep scan --config p/kubernetes ... server/fixtures` | 11 rules / 8 YAML targets / 3 non-deployed synthetic fixture findings; JSON also records one parser error on intentionally malformed `platform/common/.../application.yml:3`; details in `final-scan-evidence.md` and `semgrep-fixtures-final.json` |
| `gitleaks dir --redact --no-banner .` | No leaks; ~1.43 MB scanned |
| `gitleaks git --redact --no-banner .` | No leaks; 9 commits / ~264.77 KB scanned |
| `git diff --check` | Clean before staging |

The first e2e attempts exposed two incorrect assertions in the new browser check (first card need not be a service; React Flow's selected class is not on the custom `data-edge-id` wrapper). Assertions were corrected to check an actual discovered `orders`/`catalog` card and the dependency inspector after evidence selection; final browser run passed. A duplicate `npm start` attempt reported `EADDRINUSE` because 127.0.0.1:4317 was already occupied; Playwright reused the existing loopback server and passed against the just-built app.

## Remaining limits / handoff

- RabbitMQ bindings are intentionally not resolved; valid topologies may appear disconnected. The scanner also skips unsupported or dynamic argument shapes, multiline forms, unsafe names, and expressions that do not match its simple parser.
- Feign placeholder support is limited to `${clients.<alias>.url}` values found in the matching module's scanned application properties/YAML; arbitrary environment/profile/framework resolution is unsupported.
- Fresh scanner/build checks are local; no Alibaba review ran. No final review approval is claimed. The parent should dispatch the single scoped rereview using the generated `final-fix-42f284a..HEAD.diff` package.
