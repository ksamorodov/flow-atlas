# Local Tooling Snapshot

Environment check performed 2026-11-02 for the Flow Atlas local MVP setup.

## Available

- Git 2.45.2
- Node.js 24.3.0
- npm 11.4.2
- Bun 1.3.12
- Semgrep 1.183.0
- Gitleaks 8.30.1
- Playwright browser cache: Chromium and headless-shell revisions 1248 and 1252, plus ffmpeg 1013 (cache present; no standalone `playwright` command).

## Not found / blocked

- `gh`, `pnpm`, and standalone `playwright` commands are not installed/on PATH.
- Alibaba/custom git-skill command candidates (`alibaba-git-skill`, `git-skill`) were not found.
- GitHub access is blocked by the current CONNECT proxy (502). A non-installing `npm view react version` probe also failed with registry HTTP 502; dependency installation was not attempted.

No dependencies were installed and no product code was added in this setup step.
