/**
 * Compiles the dashboard definition to grafana/dashboard.json.
 *
 * Post-processes the SDK output because the Grafana Foundation SDK does not
 * support `__inputs` natively. The post-process:
 *   1. Replaces the stat "Contracts" panel with a proper table panel.
 *   2. Injects the hidden `explorer_base` query variable.
 *   3. Patches the Logs panel with syntaxHighlighting.
 *   4. Removes SDK-generated datasource variables and injects `__inputs` /
 *      `__requires` so Grafana prompts for Prometheus and Loki on import.
 *
 * Invoked via: npm run grafana:build
 */

import { writeFileSync } from "fs";
import { resolve } from "path";
import { buildDashboard } from "./dashboard.js";

function replaceContractsPanelWithTable(dashboard: any) {
  const panels = dashboard.panels ?? [];
  const idx = panels.findIndex((p: any) => p.title === "Contracts");
  if (idx === -1) return;
  const old = panels[idx];
  const gridPos = old.gridPos ?? { x: 0, y: 12, w: 24, h: 6 };

  const explorerLink = {
    title: "Open in Explorer",
    url: "${explorer_base}/address/${__value.raw}",
    targetBlank: true,
  };

  // One row per contract type using labelsToFields (rows mode).
  // This avoids transpose entirely, which has a Grafana bug where the first row
  // always gets the column header as its value instead of the actual data.
  panels[idx] = {
    type: "table",
    title: "Contracts",
    description: "Contract addresses. Click an address to open in the block explorer.",
    datasource: { type: "prometheus", uid: "${DS_PROMETHEUS}" },
    gridPos,
    targets: [
      {
        expr: 'lido_vault_contracts_info{chain=~"$chain",vault_name=~"$vault_name"}',
        legendFormat: "{{vault_name}}",
        refId: "A",
        instant: true,
        // No format:"table"; labelsToFields needs the time-series frame with labels attached
      },
    ],
    transformations: [
      {
        // Pivots each Prometheus label into its own row: Name=label_key, Value=label_value
        id: "labelsToFields",
        options: {
          mode: "rows",
          keepLabels: ["vault_addr", "pool_addr", "wq_addr", "dashboard_addr"],
        },
      },
      {
        // labelsToFields emits lowercase "label" and "value" columns
        id: "organize",
        options: {
          excludeByName: { Time: true },
          renameByName: { label: "Name", value: "Contract" },
        },
      },
      {
        // Keep only rows where the contract address is not null (hides pool/WQ/dashboard rows for vaults without those contracts)
        id: "filterByValue",
        options: {
          type: "include",
          match: "any",
          filters: [{ fieldName: "Contract", config: { id: "isNotNull" } }],
        },
      },
    ],
    fieldConfig: {
      defaults: { custom: { align: "auto", cellOptions: { type: "auto" } } },
      overrides: [
        {
          matcher: { id: "byName", options: "Contract" },
          properties: [{ id: "links", value: [explorerLink] }],
        },
        {
          matcher: { id: "byName", options: "Name" },
          properties: [
            {
              id: "mappings",
              value: [
                { type: "value", options: { vault_addr:     { text: "Vault",            color: "green",  index: 0 } } },
                { type: "value", options: { pool_addr:      { text: "Pool",             color: "blue",   index: 1 } } },
                { type: "value", options: { wq_addr:        { text: "Withdrawal Queue", color: "orange", index: 2 } } },
                { type: "value", options: { dashboard_addr: { text: "Dashboard",        color: "purple", index: 3 } } },
              ],
            },
          ],
        },
      ],
    },
    options: { showHeader: true, cellHeight: "sm", footer: { show: false, reducer: ["sum"], countRows: false, fields: "" } },
  };
}

function addExplorerBaseVariable(dashboard: any) {
  const list = dashboard.templating?.list ?? [];
  // Query variable: reads explorer_url label from stvaults_watcher_info filtered by $chain.
  // When the user switches chain, Grafana re-runs label_values() and automatically picks
  // the correct explorer URL (https://etherscan.io or https://hoodi.etherscan.io).
  list.push({
    type: "query",
    name: "explorer_base",
    label: "Explorer",
    hide: 2,
    skipUrlSync: false,
    datasource: { type: "prometheus", uid: "${DS_PROMETHEUS}" },
    definition: `label_values(stvaults_watcher_info{chain="$chain"}, explorer_url)`,
    query: {
      query: `label_values(stvaults_watcher_info{chain="$chain"}, explorer_url)`,
      refId: "StandardVariableQuery",
    },
    refresh: 2,
    sort: 0,
    includeAll: false,
    multi: false,
    allValue: null,
    current: {},
    options: [],
  });
}

function addRepositoryLink(dashboard: any) {
  const links = dashboard.links ?? [];
  links.push({
    title: "GitHub Repository",
    url: "https://github.com/Stakely/stvaults-watcher",
    targetBlank: true,
    icon: "external link",
  });
  dashboard.links = links;
}

function patchPollErrorsPanel(dashboard: any) {
  const panel = (dashboard.panels ?? []).find((p: any) => p.title === "Poll errors");
  if (!panel) return;
  panel.fieldConfig = panel.fieldConfig ?? {};
  panel.fieldConfig.defaults = panel.fieldConfig.defaults ?? {};
  panel.fieldConfig.defaults.noValue = "0";
}

function patchLogsPanel(dashboard: any) {
  const panels = dashboard.panels ?? [];
  const logsPanel = panels.find((p: any) => p.type === "logs");
  if (!logsPanel) return;
  logsPanel.options = logsPanel.options ?? {};
  // Enable predefined coloring scheme for log line highlighting (not exposed by SDK yet)
  logsPanel.options.syntaxHighlighting = true;
}

const built = buildDashboard();
replaceContractsPanelWithTable(built);
addExplorerBaseVariable(built);
addRepositoryLink(built);
patchPollErrorsPanel(built);
patchLogsPanel(built);

// Names used by DatasourceVariableBuilder in dashboard.ts / panels.ts.
// The SDK emits these as `type:"datasource"` entries in templating.list; we remove
// them because datasource selection is handled via __inputs at import time instead.
const DS_VAR_NAMES = new Set(["DS_PROMETHEUS", "DS_LOKI"]);

function removeSdkDatasourceVars(dashboard: any) {
  // The SDK always emits `type:"datasource"` entries in templating.list for each
  // DatasourceVariableBuilder. Grafana renders these as visible dropdown variables;
  // we want datasource selection to happen only at import time via __inputs.
  const list = dashboard?.templating?.list;
  if (Array.isArray(list)) {
    dashboard.templating.list = list.filter(
      (v: any) => !(v?.type === "datasource" && DS_VAR_NAMES.has(v?.name)),
    );
  }
}

function addGrafanaInputs(dashboard: any) {
  // Grafana's import wizard prompts for datasource selection only when the JSON
  // declares top-level `__inputs` entries. Each entry maps a placeholder name
  // (e.g. ${DS_PROMETHEUS}) to a real datasource chosen by the user at import time.
  dashboard.__inputs = [
    {
      name: "DS_PROMETHEUS",
      label: "Prometheus",
      type: "datasource",
      pluginId: "prometheus",
      pluginName: "Prometheus",
      current: { selected: false, value: "" },
    },
    {
      name: "DS_LOKI",
      label: "Loki",
      type: "datasource",
      pluginId: "loki",
      pluginName: "Loki",
      current: { selected: false, value: "" },
    },
  ];

  dashboard.__requires = [
    { type: "grafana",     id: "grafana",     name: "Grafana",    version: "10.x" },
    { type: "datasource",  id: "prometheus",  name: "Prometheus", version: "2.x"  },
    { type: "datasource",  id: "loki",        name: "Loki",       version: "2.x"  },
  ];
}

removeSdkDatasourceVars(built);
addGrafanaInputs(built);

const outPath = resolve("grafana", "dashboard.json");
writeFileSync(outPath, JSON.stringify(built, null, 2), "utf-8");
console.log(`Dashboard written to ${outPath}`);
