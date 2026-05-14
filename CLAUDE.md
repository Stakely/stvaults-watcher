# stvaults-watcher

Node.js 24 ESM watcher for Lido V3 stVaults with DeFi Wrapper pools.
Read-only on-chain reads via viem; Prometheus metrics; Discord alerts.

## Project rules

The authoritative docs live in `.cursor/rules/` and are imported here so both
Cursor and Claude Code stay in sync. Update the `.mdc` files, not this file,
when conventions change.

@.cursor/rules/project-overview.mdc
@.cursor/rules/coding-conventions.mdc
@.cursor/rules/testing-conventions.mdc

## Common commands

- `pnpm test` — run JS tests with `node:test`
- `pnpm run test:all` — JS tests + Grafana TS tests
- `pnpm run grafana:build` — regenerate `grafana/dashboard.json`
- `pnpm run lint` / `pnpm run lint:fix`
- `node src/index.js` — run the watcher locally (needs `.env`)

## Release checklist (SemVer)

1. Decide bump per `project-overview.mdc` § Versioning (patch / minor / major).
2. Update `version` in `package.json`.
3. Update `.cursor/rules/*.mdc` and `README.md` for any new metric / alert /
   env var / contract (living-doc rule).
4. `pnpm run test:all` and `pnpm run grafana:build` must pass.
5. Commit, tag, push — Docker image is published automatically on release
   (`.github/workflows/docker-publish.yml`).

## Pointers

- Full feature catalog and config table: `README.md`.
- Network constants and contract addresses: `src/networks.json`.
- CI workflows: `.github/workflows/{ci,lint,docker-publish}.yml`.
