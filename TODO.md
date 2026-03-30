# TODO / Known workarounds

## Grafana Foundation SDK does not support `__inputs`

**File:** `src/grafana/build.ts`

**Why post-processing is needed:** The Grafana Foundation SDK has no API to declare
`__inputs` or `__requires`. These top-level fields are what Grafana uses to prompt
the user for Prometheus and Loki datasource selection during import. Without them,
Grafana skips the prompt and renders datasource variables as visible dropdowns.

**Current approach:** `build.ts` post-processes the SDK output to:
1. Remove `type:"datasource"` entries from `templating.list` (those are the visible dropdowns).
2. Inject `__inputs` (with `${DS_PROMETHEUS}` / `${DS_LOKI}` placeholders) and `__requires`.

All datasource `uid` refs use `${DS_PROMETHEUS}` / `${DS_LOKI}` because `DATASOURCE_VAR`
in `panels.ts` and `LOKI_DS_VAR` in `dashboard.ts` are set to those names directly.
No string-replacement post-processing is needed.

**What to do if the SDK adds `__inputs` support:**
1. Move `__inputs` / `__requires` declaration into `dashboard.ts` using the SDK API.
2. Remove `removeSdkDatasourceVars` and `addGrafanaInputs` from `build.ts`.
3. Run `npm run grafana:build` and verify the import prompt works without post-processing.

**Tracking:** https://github.com/grafana/grafana-foundation-sdk/issues
