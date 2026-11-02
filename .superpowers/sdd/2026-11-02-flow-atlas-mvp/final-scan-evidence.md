# Final-fix-wave security scan evidence

Date: 2026-11-02. Scans were run after the RabbitMQ, Feign and UI production changes. Only this project and checked-in synthetic fixtures were scanned; no corporate directories were accessed.

1. Production JavaScript/TypeScript:

   ```sh
   semgrep scan --config p/javascript --config p/typescript --metrics=off --disable-version-check \
     --exclude server/fixtures --exclude .superpowers --exclude node_modules --exclude dist \
     --exclude .playwright-mcp --json-output .superpowers/sdd/2026-11-02-flow-atlas-mvp/semgrep-final.json .
   ```

   Exit 0. Semgrep ran 74 rules on 28 JavaScript/TypeScript targets (26 TypeScript and 2 JavaScript; approximately 100% parsed) and found **0 findings**. The JSON result is `semgrep-final.json`.

2. Synthetic Kubernetes parser fixtures:

   ```sh
   semgrep scan --config p/kubernetes --metrics=off --disable-version-check \
     --json-output .superpowers/sdd/2026-11-02-flow-atlas-mvp/semgrep-fixtures-final.json server/fixtures
   ```

   Exit 0. Semgrep ran 11 rules on 8 YAML targets and reported **3 findings**, all in `server/fixtures/scanner-regressions/kubernetes.yaml`: missing `runAsNonRoot` at line 7 and missing `readOnlyRootFilesystem` at lines 9 and 14. The JSON also records one parser error for the intentionally malformed `server/fixtures/scanner-regressions/platform/common/src/main/resources/application.yml:3` fixture. These are synthetic parser fixtures, not deployed product manifests; they were not modified to hide findings.

The Semgrep CLI summary reported approximately 100% parsed; the fixture JSON's explicit parser error is recorded here rather than suppressed. No production finding or parser error occurred in the production JS/TS scan. The historical Task 4 proxy note is superseded by these fresh results. No deployment/security claim is inferred from the fixture-only findings.
