# feat: Flow Atlas architecture visualizer MVP

## Summary

- Add a local-first architecture map editor with editable graph, deterministic educational simulation, import/export, and bounded read-only discovery over explicitly allowlisted roots.
- Add evidence-backed discovery heuristics, synthetic fixtures, security boundaries, and regression/browser coverage.
- Close the approved scoped findings for RabbitMQ topology identity, Feign evidence/confidence, and readable discovered service names.

## Screenshots

- [Manual architecture map](screenshots/manual-graph.png)
- [Discovered synthetic graph](screenshots/discovered-graph.png)

## Verification

Final fresh check outcomes are recorded in [docs/verification-report.md](verification-report.md). Pre-publication commands: `npm test`, `npm run typecheck`, `npm run build`, `npm run test:e2e`, `git diff --check`, and redacted Gitleaks directory/history scans. Previously recorded scoped Semgrep evidence: 74 JavaScript/TypeScript rules / 28 production targets / 0 findings; separate synthetic Kubernetes fixture scan: 3 findings plus 1 parse error on an intentionally malformed YAML fixture. The fixtures are not deployed manifests. No Alibaba integration review was run because it was unavailable.

## Security and known limitations

- Loopback-only local server; discovery accepts opaque IDs from explicit root allowlists, with canonical containment, symlink/file identity checks, safe extensions, sensitive filename exclusions, traversal limits, and bounded actual-byte reads.
- No source execution, arbitrary path API, credential access, or source transmission. Use only authorized local repositories; this is not a security certification.
- Source discovery is heuristic and intentionally incomplete. RabbitMQ named-exchange bindings are not inferred; supported literal patterns only. Feign config resolution supports the documented `${clients.<alias>.url}` subset. YAML, framework/profile resolution, and dynamic syntax are limited. See [README](../README.md) and [verification report](verification-report.md).
- Simulation is educational and deterministic, not production telemetry.

## Human review checklist

- [ ] Review [the exercise](human-review-exercise.md) and [separate answer key](human-review-answers.md), including YAML nesting, Feign evidence, RabbitMQ binding omissions, and actual-byte read bounds.
- [ ] Confirm local-first/allowlisted discovery and fixture-only scan results are not interpreted as a production security certification.
- [ ] Confirm the RabbitMQ false-negative tradeoff and supported Feign/YAML subsets are acceptable.
- [ ] Verify no corporate sources or real exports are included.
