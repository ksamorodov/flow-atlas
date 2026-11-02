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
- The fresh Semgrep registry scan was blocked by a proxy tunnel error (`semgrep.dev`, HTTP 502); there is no fresh Semgrep result for the final changes.

## Network status

- On 2026-11-02, `https://raw.githubusercontent.com/alibaba/open-code-review/v1.13.3/README.md` and `https://registry.npmjs.org/@alibaba-group%2Fopen-code-review/latest` both returned HTTP 200. This does not establish that all network endpoints work or that npm dependency builds have been tested.

The initial setup did not install project dependencies. For Task 3, network access was restored and the project's pinned frontend/tooling dependencies were installed locally. Earlier network checks are historical and do not establish current endpoint availability.

## Task 4 verification status

The final Task 4 report is `.superpowers/sdd/2026-11-02-flow-atlas-mvp/task-4-report.md`. It records fresh `npm test`, typecheck, build, browser tests, Gitleaks, and diff-check results, as well as the Semgrep limitation. Do not treat older Semgrep artifacts as fresh results or infer findings that were not emitted by a scan.

## Task 3 frontend

The browser application uses React, TypeScript, Vite, `@xyflow/react`, and Zustand. `npm start` builds the frontend and serves it with the Node API on loopback; `npm run build` runs the Vite production build, `npm run typecheck` checks TypeScript, `npm test` runs native Node tests (after building), and `npm run test:e2e` runs the Playwright browser flow. Browser and native test fixtures use only the synthetic allowed repository.
