# Local Tooling Snapshot

Environment check performed 2026-11-02 for the Flow Atlas local MVP setup.

## Detected tools

- Git 2.45.2
- Node.js 24.3.0
- npm 11.4.2
- Bun 1.3.12
- Semgrep 1.183.0
- Gitleaks 8.30.1
- Alibaba Open Code Review (OCR) 1.13.3 (`ocr`; package `@alibaba-group/open-code-review`) was detected in the initial environment snapshot. Its integration was unavailable during Task 4; no review was performed.
- Playwright browser cache: Chromium and headless-shell revisions 1248 and 1252, plus ffmpeg 1013 (cache present; browser tests run through the npm Playwright package).

## Not found / blocked

- `gh`, `pnpm`, and standalone `playwright` commands are not installed/on PATH.
- Alibaba/custom git-skill command candidates (`alibaba-git-skill`, `git-skill`) were not found.
- An earlier Task 4 Semgrep registry request was blocked by a proxy tunnel error; that historical result was superseded by successful targeted production and fixture scans documented below.

## Network status

- On 2026-11-02, `https://raw.githubusercontent.com/alibaba/open-code-review/v1.13.3/README.md` and `https://registry.npmjs.org/@alibaba-group%2Fopen-code-review/latest` both returned HTTP 200. This does not establish that all network endpoints work or that npm dependency builds have been tested.

The initial setup did not install project dependencies. For Task 3, network access was restored and the project's pinned frontend/tooling dependencies were installed locally. Earlier network checks are historical and do not establish current endpoint availability.

## Task 4 historical verification

The Task 4 report is `.superpowers/sdd/2026-11-02-flow-atlas-mvp/task-4-report.md`; its semgrep limitation was resolved in the bounded final-fix wave below. Historical artifacts are not evidence for that wave.

## Bounded final-fix wave (2026-11-02)

The latest evidence is `.superpowers/sdd/2026-11-02-flow-atlas-mvp/final-fix-report.md` and `final-scan-evidence.md`. RabbitMQ exchange/routing destinations and listener queues have separate identities; binding inference is unsupported, and only literal simple overload arguments are recognized. Resolved Feign placeholders cite the config file/line with MEDIUM confidence; literal URLs cite annotation evidence with HIGH confidence. Cards and connect-dialog options prefer `data.label`, then `data.name`, then ID.

Fresh targeted Semgrep checks passed: 74 production JavaScript/TypeScript rules across 28 targets, zero findings; the separate fixture-only Kubernetes scan produced three hardening findings in non-deployed synthetic fixtures and its JSON reports one parser error on the intentionally malformed YAML fixture. Fresh native tests, typecheck, build, browser tests, Gitleaks, and diff checks are recorded in the final-fix report. These are local checks only; Alibaba review did not occur.

## Task 3 frontend

The browser application uses React, TypeScript, Vite, `@xyflow/react`, and Zustand. `npm start` builds the frontend and serves it with the Node API on loopback; `npm run build` runs the Vite production build, `npm run typecheck` checks TypeScript, `npm test` runs native Node tests (after building), and `npm run test:e2e` runs the Playwright browser flow. Browser and native test fixtures use only the synthetic allowed repository.
