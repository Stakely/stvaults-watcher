/**
 * stvaults-watcher - Grafana dashboard defined as code.
 *
 * Uses the Grafana Foundation SDK builder pattern.
 * Each row combines stat/gauge panels with inline timeseries.
 * Variables: Prometheus datasource selector + chain filter (hoodi/mainnet).
 *
 * Build output: grafana/dashboard.json  (via `npm run grafana:build`)
 */

import {
  DashboardBuilder,
  DatasourceVariableBuilder,
  QueryVariableBuilder,
  RowBuilder,
  VariableHide,
} from "@grafana/grafana-foundation-sdk/dashboard";
import { PanelBuilder as LogsPanelBuilder } from "@grafana/grafana-foundation-sdk/logs";
import { DataqueryBuilder as LokiQueryBuilder } from "@grafana/grafana-foundation-sdk/loki";
import { PanelBuilder as RawStatBuilder } from "@grafana/grafana-foundation-sdk/stat";
import { DataqueryBuilder } from "@grafana/grafana-foundation-sdk/prometheus";
import { ReduceDataOptionsBuilder } from "@grafana/grafana-foundation-sdk/common";
import { statPanel, gaugePanel, timeseriesPanel, DATASOURCE_VAR } from "./panels.js";

const LOKI_DS_VAR = "DS_LOKI";
const LOKI_DS = { type: "loki" as const, uid: `\${${LOKI_DS_VAR}}` };

// ---------------------------------------------------------------------------
// Threshold palettes
// ---------------------------------------------------------------------------

const GREEN  = "#73BF69";
const YELLOW = "#FF9830";
const ORANGE = "#FF780A";
const RED    = "#F2495C";
const BLUE   = "#5794F2";
const PURPLE = "#B877D9";

const healthThresholds  = [{ value: null as any, color: RED }, { value: 105, color: YELLOW }, { value: 120, color: GREEN }];
const utilizationThresh = [{ value: null as any, color: GREEN }, { value: 80, color: YELLOW }, { value: 95, color: RED }];
const booleanGreen      = [{ value: null as any, color: RED }, { value: 1, color: GREEN }];
const booleanFresh      = [{ value: null as any, color: BLUE }, { value: 1, color: GREEN }];
const ethThresholds     = [{ value: null as any, color: BLUE }];
const boolMappings = [
  { type: "value" as const, options: { "0": { text: "NO",  color: RED,   index: 0 }, "1": { text: "YES", color: GREEN, index: 1 } } },
];
const freshMappings = [
  { type: "value" as const, options: { "0": { text: "STALE", color: BLUE, index: 0 }, "1": { text: "FRESH", color: GREEN, index: 1 } } },
];
const pdgPolicyMappings = [
  {
    type: "value" as const,
    options: {
      "0": { text: "STRICT", color: BLUE, index: 0 },
      "1": { text: "ALLOW_PROVE", color: YELLOW, index: 1 },
      "2": { text: "ALLOW_DEPOSIT_AND_PROVE", color: GREEN, index: 2 },
    },
  },
];

// ---------------------------------------------------------------------------
// Layout  (Grafana grid = 24 cols)
// ---------------------------------------------------------------------------

function pos(x: number, y: number, w: number, h: number) {
  return { x, y, w, h };
}

function q(metric: string) {
  return `${metric}{chain=~"$chain",vault_name=~"$vault_name"}`;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export function buildDashboard(): object {
  const builder = new DashboardBuilder("stvaults-watcher")
    .uid("stvaults-watcher")
    .tags(["ETHEREUM", "LIDO"])
    .refresh("1m")
    .time({ from: "now-6h", to: "now" })
    .timezone("browser")
    .withVariable(
      new DatasourceVariableBuilder(DATASOURCE_VAR)
        .label("Prometheus")
        .type("prometheus")
        .hide(VariableHide.HideVariable),
    )
    .withVariable(
      new QueryVariableBuilder("chain")
        .label("Chain")
        .datasource({ type: "prometheus", uid: `\${${DATASOURCE_VAR}}` })
        .query("label_values(lido_vault_total_value_eth, chain)")
        .refresh(1)
        .sort(1)
        .includeAll(false),
    )
    .withVariable(
      new QueryVariableBuilder("vault_name")
        .label("Vault")
        .datasource({ type: "prometheus", uid: `\${${DATASOURCE_VAR}}` })
        .query('label_values(lido_vault_total_value_eth{chain=~"$chain"}, vault_name)')
        .refresh(2)
        .sort(1)
        .includeAll(true)
        .allValue(".*")
        .allowCustomValue(false),
    )
    .withVariable(
      new DatasourceVariableBuilder(LOKI_DS_VAR)
        .label("Loki")
        .type("loki")
        .hide(VariableHide.HideVariable),
    );

  let y = 0;
  const S = 5;
  const G = 7;
  const T = 8;

  // ==================== 📊 Status ====================
  builder.withRow(new RowBuilder("📊 Status"));
  y += 1;

  builder
    .withPanel(statPanel({
      title: "Watcher version",
      expr: `stvaults_watcher_info{chain="$chain"}`,
      legendLabel: "v{{version}}",
      colorMode: "background_solid", graphMode: "none", textMode: "name",
      thresholdSteps: [{ value: null as any, color: PURPLE }],
      gridPos: pos(0, y, 4, S),
    }))
    .withPanel(statPanel({
      title: "Watcher alive",
      expr: `(time() - stvaults_watcher_last_poll_timestamp{chain=~"$chain"}) < bool 300`,
      legendLabel: "{{chain}}",
      description: "YES if the watcher has polled in the last 5 minutes. Calculated as: (current time − last poll timestamp) < 300 seconds.",
      colorMode: "background_solid", graphMode: "none",
      thresholdSteps: booleanGreen,
      valueMappings: boolMappings as any,
      gridPos: pos(4, y, 4, S),
    }))
    .withPanel(statPanel({
      title: "Vault healthy",
      expr: q("lido_vault_is_healthy"),
      description: "Whether the vault is considered healthy by VaultHub (isVaultHealthy on-chain).",
      colorMode: "background_solid", graphMode: "none",
      thresholdSteps: booleanGreen,
      valueMappings: boolMappings as any,
      gridPos: pos(8, y, 4, S),
    }))
    .withPanel(statPanel({
      title: "Unfinalized requests",
      expr: q("lido_wq_unfinalized_requests"),
      description: "Number of withdrawal requests in the queue not yet finalized on L1.",
      decimals: 0,
      colorMode: "background_solid", graphMode: "none",
      thresholdSteps: [{ value: null as any, color: GREEN }, { value: 1, color: YELLOW }, { value: 10, color: RED }],
      gridPos: pos(12, y, 4, S),
    }))
    .withPanel(statPanel({
      title: "Inactive ETH",
      expr: q("lido_vault_inactive_eth"),
      description: "ETH in the vault that is not yet staked (available minus staged). Used for withdrawals and rebalancing.",
      unit: "eth", decimals: 4,
      colorMode: "background_solid", graphMode: "none",
      thresholdSteps: [{ value: null as any, color: GREEN }, { value: 1, color: YELLOW }, { value: 32, color: RED }],
      gridPos: pos(16, y, 4, S),
    }))
    .withPanel(statPanel({
      title: "Withdrawal deficit",
      expr: `clamp_min(lido_wq_unfinalized_assets_eth{chain=~"$chain",vault_name=~"$vault_name"} - lido_vault_available_balance_eth{chain=~"$chain",vault_name=~"$vault_name"}, 0)`,
      unit: "eth", decimals: 4,
      description: "ETH needed from validators to cover pending withdrawals (0 = enough liquidity)",
      colorMode: "background_solid", graphMode: "none",
      thresholdSteps: [{ value: null as any, color: GREEN }, { value: 0.01, color: YELLOW }, { value: 1, color: RED }],
      gridPos: pos(20, y, 4, S),
    }));
  y += S;

  // ==================== 💰 Vault state ====================
  builder.withRow(new RowBuilder("💰 Vault state"));
  y += 1;

  const DS_REF = { type: "prometheus" as const, uid: `\${${DATASOURCE_VAR}}` };
  const ci = `lido_vault_contracts_info{chain=~"$chain",vault_name=~"$vault_name"}`;
  builder
    .withPanel(statPanel({
      title: "Total value",
      expr: q("lido_vault_total_value_eth"),
      description: "Total value of the vault (VaultHub totalValue) in ETH.",
      unit: "eth", decimals: 4,
      colorMode: "value", graphMode: "area",
      thresholdSteps: ethThresholds,
      gridPos: pos(0, y, 4, S),
    }))
    .withPanel(statPanel({
      title: "Available balance",
      expr: q("lido_vault_available_balance_eth"),
      description: "ETH available in the StakingVault (liquid, not yet staged for staking).",
      unit: "eth", decimals: 4,
      colorMode: "value", graphMode: "area",
      thresholdSteps: ethThresholds,
      gridPos: pos(4, y, 4, S),
    }))
    .withPanel(statPanel({
      title: "Staged balance",
      expr: q("lido_vault_staged_balance_eth"),
      description: "ETH staged in the StakingVault (pending to be staked).",
      unit: "eth", decimals: 4,
      colorMode: "value", graphMode: "area",
      thresholdSteps: ethThresholds,
      gridPos: pos(8, y, 4, S),
    }))
    .withPanel(statPanel({
      title: "Withdrawable value",
      expr: q("lido_vault_withdrawable_value_eth"),
      description: "ETH that can be withdrawn (VaultHub withdrawableValue).",
      unit: "eth", decimals: 4,
      colorMode: "value", graphMode: "area",
      thresholdSteps: ethThresholds,
      gridPos: pos(12, y, 4, S),
    }))
    .withPanel(statPanel({
      title: "Node Operator fee",
      expr: q("lido_vault_node_operator_fee_eth"),
      description: "Undisbursed node operator fee accrued in Dashboard (accruedFee).",
      unit: "eth", decimals: 4,
      colorMode: "value", graphMode: "area",
      thresholdSteps: ethThresholds,
      gridPos: pos(16, y, 4, S),
    }))
    .withPanel(statPanel({
      title: "Staking efficiency",
      expr: `(${q("lido_vault_total_value_eth")} - ${q("lido_vault_inactive_eth")}) / ${q("lido_vault_total_value_eth")} * 100`,
      description: "% of vault ETH actively staked and generating yield. Computed as (total_value − inactive_eth) / total_value × 100.",
      unit: "percent", decimals: 2,
      colorMode: "background_solid", graphMode: "none",
      thresholdSteps: [{ value: null as any, color: RED }, { value: 80, color: YELLOW }, { value: 96, color: GREEN }],
      gridPos: pos(20, y, 4, S),
    }));
  y += S;

  builder
    .withPanel(timeseriesPanel({
      title: "Total value (ETH)",
      expr: q("lido_vault_total_value_eth"),
      unit: "eth", decimals: 4,
      gridPos: pos(0, y, 12, T),
    }))
    .withPanel(timeseriesPanel({
      title: "Available vs Staged (ETH)",
      expr: q("lido_vault_available_balance_eth"),
      unit: "eth", decimals: 4,
      gridPos: pos(12, y, 12, T),
    }));
  y += T;

  // ==================== 📋 Contracts ====================
  builder.withRow(new RowBuilder("📋 Contracts"));
  y += 1;
  builder.withPanel(
    new RawStatBuilder()
      .title("Contracts")
      .description("Replaced by build with table.")
      .datasource(DS_REF)
      .reduceOptions(new ReduceDataOptionsBuilder().calcs(["lastNotNull"]))
      .withTarget(new DataqueryBuilder().expr(ci).legendFormat("{{vault_addr}}"))
      .gridPos(pos(0, y, 24, 6)),
  );
  y += 6;

  // ==================== 🏥 Health ====================
  builder.withRow(new RowBuilder("🏥 Health"));
  y += 1;

  builder
    .withPanel(gaugePanel({
      title: "Health factor",
      expr: q("lido_vault_health_factor"),
      unit: "percent", decimals: 2,
      min: 0, max: 200,
      thresholdSteps: healthThresholds,
      valueMappings: [
        { type: "range" as const, options: { from: 9999, to: null as any, result: { text: "∞", color: GREEN } } },
      ] as any,
      gridPos: pos(0, y, 6, G),
    }))
    .withPanel(gaugePanel({
      title: "stETH Minted",
      expr: q("lido_vault_utilization_ratio"),
      description: "% of stETH minting capacity used (liabilityShares / mintingCapacityShares)",
      unit: "percent", decimals: 2,
      min: 0, max: 100,
      thresholdSteps: utilizationThresh,
      gridPos: pos(6, y, 6, G),
    }))
    .withPanel(statPanel({
      title: "Forced rebalance threshold",
      expr: q("lido_vault_forced_rebalance_threshold"),
      unit: "percent", decimals: 2,
      description: "If Health Factor falls below 100% (based on this threshold), the vault is subject to forced rebalancing",
      colorMode: "none", graphMode: "none",
      gridPos: pos(12, y, 3, G),
    }))
    .withPanel(statPanel({
      title: "Reserve ratio",
      expr: q("lido_vault_reserve_ratio"),
      unit: "percent", decimals: 2,
      description: "% of Total Value reserved as collateral; stETH cannot be minted against this amount",
      colorMode: "none", graphMode: "none",
      gridPos: pos(15, y, 3, G),
    }))
    .withPanel(statPanel({
      title: "Oracle report",
      expr: q("lido_vault_report_fresh"),
      colorMode: "background_solid", graphMode: "none",
      thresholdSteps: booleanFresh,
      valueMappings: freshMappings as any,
      gridPos: pos(18, y, 3, G),
    }))
    .withPanel(statPanel({
      title: "Health shortfall",
      expr: q("lido_vault_health_shortfall_shares"),
      decimals: 0,
      description: "Shares needed to restore health (0 = healthy)",
      colorMode: "value", graphMode: "none",
      thresholdSteps: [{ value: null as any, color: GREEN }, { value: 1, color: RED }],
      gridPos: pos(21, y, 3, G),
    }));
  y += G;

  builder
    .withPanel(timeseriesPanel({
      title: "Health factor %",
      // clamp_max: vaults with no minted stETH have +Inf health factor; cap at 9999 so the
      // timeseries line stays visible. The raw +Inf value is preserved in Prometheus.
      expr: `clamp_max(${q("lido_vault_health_factor")}, 9999)`,
      unit: "percent", decimals: 2,
      thresholdSteps: healthThresholds,
      valueMappings: [
        { type: "range" as const, options: { from: 9999, to: null as any, result: { text: "∞", color: GREEN } } },
      ] as any,
      gridPos: pos(0, y, 12, T),
    }))
    .withPanel(timeseriesPanel({
      title: "stETH Minted %",
      expr: q("lido_vault_utilization_ratio"),
      unit: "percent", decimals: 2,
      thresholdSteps: utilizationThresh,
      gridPos: pos(12, y, 12, T),
    }));
  y += T;

  // ==================== 🪙 stETH liability ====================
  builder.withRow(new RowBuilder("🪙 stETH liability"));
  y += 1;

  builder
    .withPanel(statPanel({
      title: "stETH liability",
      expr: q("lido_vault_steth_liability_eth"),
      unit: "eth", decimals: 4,
      colorMode: "value", graphMode: "area",
      thresholdSteps: ethThresholds,
      gridPos: pos(0, y, 8, S),
    }))
    .withPanel(statPanel({
      title: "Minting capacity",
      expr: q("lido_vault_minting_capacity_eth"),
      unit: "eth", decimals: 4,
      colorMode: "value", graphMode: "area",
      thresholdSteps: ethThresholds,
      gridPos: pos(8, y, 8, S),
    }))
    .withPanel(statPanel({
      title: "Withdrawable value",
      expr: q("lido_vault_withdrawable_value_eth"),
      unit: "eth", decimals: 4,
      colorMode: "value", graphMode: "area",
      thresholdSteps: ethThresholds,
      gridPos: pos(16, y, 8, S),
    }));
  y += S;

  // ==================== 📤 Withdrawal queue ====================
  builder.withRow(new RowBuilder("📤 Withdrawal queue"));
  y += 1;

  builder
    .withPanel(statPanel({
      title: "Unfinalized requests",
      expr: q("lido_wq_unfinalized_requests"),
      decimals: 0,
      colorMode: "background_solid", graphMode: "none",
      thresholdSteps: [{ value: null as any, color: GREEN }, { value: 1, color: YELLOW }, { value: 10, color: RED }],
      gridPos: pos(0, y, 6, S),
    }))
    .withPanel(statPanel({
      title: "Unfinalized assets",
      expr: q("lido_wq_unfinalized_assets_eth"),
      unit: "eth", decimals: 4,
      colorMode: "value", graphMode: "area",
      thresholdSteps: ethThresholds,
      gridPos: pos(6, y, 6, S),
    }))
    .withPanel(statPanel({
      title: "Last request ID",
      expr: q("lido_wq_last_request_id"),
      decimals: 0,
      colorMode: "none", graphMode: "none",
      gridPos: pos(12, y, 6, S),
    }))
    .withPanel(statPanel({
      title: "Last finalized ID",
      expr: q("lido_wq_last_finalized_id"),
      decimals: 0,
      colorMode: "none", graphMode: "none",
      gridPos: pos(18, y, 6, S),
    }));
  y += S;

  builder
    .withPanel(timeseriesPanel({
      title: "Unfinalized assets (ETH)",
      expr: q("lido_wq_unfinalized_assets_eth"),
      unit: "eth", decimals: 4,
      gridPos: pos(0, y, 24, T),
    }));
  y += T;

  // ==================== 🛡️ PDG ====================
  builder.withRow(new RowBuilder("🛡️ PDG (Predeposit Guarantee)"));
  y += 1;

  builder
    .withPanel(statPanel({
      title: "PDG Policy",
      expr: q("lido_vault_pdg_policy"),
      decimals: 0,
      description: "Dashboard policy for PDG flow: 0=STRICT, 1=ALLOW_PROVE, 2=ALLOW_DEPOSIT_AND_PROVE.",
      colorMode: "background_solid", graphMode: "none",
      thresholdSteps: [{ value: null as any, color: BLUE }, { value: 1, color: YELLOW }, { value: 2, color: GREEN }],
      valueMappings: pdgPolicyMappings as any,
      gridPos: pos(0, y, 5, S),
    }))
    .withPanel(statPanel({
      title: "PDG Total",
      expr: q("lido_vault_pdg_total_eth"),
      description: "Total guarantee balance in PDG for this vault node operator.",
      unit: "eth", decimals: 4,
      colorMode: "value", graphMode: "none",
      thresholdSteps: [{ value: null as any, color: GREEN }],
      gridPos: pos(5, y, 5, S),
    }))
    .withPanel(statPanel({
      title: "PDG Locked",
      expr: q("lido_vault_pdg_locked_eth"),
      description: "Guarantee currently locked by active predeposits.",
      unit: "eth", decimals: 4,
      colorMode: "value", graphMode: "none",
      thresholdSteps: [{ value: null as any, color: GREEN }],
      gridPos: pos(10, y, 5, S),
    }))
    .withPanel(statPanel({
      title: "PDG Unlocked",
      expr: q("lido_vault_pdg_unlocked_eth"),
      description: "Guarantee available for new predeposits (total - locked).",
      unit: "eth", decimals: 4,
      colorMode: "value", graphMode: "none",
      thresholdSteps: [{ value: null as any, color: GREEN }, { value: 0.000001, color: ORANGE }],
      gridPos: pos(15, y, 5, S),
    }))
    .withPanel(statPanel({
      title: "PDG Pending activations",
      expr: q("lido_vault_pdg_pending_activations"),
      decimals: 0,
      description: "Validators in PREDEPOSITED/PROVEN stages awaiting activation.",
      colorMode: "background_solid", graphMode: "none",
      thresholdSteps: [{ value: null as any, color: GREEN }, { value: 1, color: YELLOW }, { value: 10, color: RED }],
      gridPos: pos(20, y, 4, S),
    }));
  y += S;

  builder
    .withPanel(timeseriesPanel({
      title: "PDG Locked vs Unlocked (ETH)",
      expr: q("lido_vault_pdg_locked_eth"),
      unit: "eth", decimals: 4,
      legendLabel: "{{vault_name}} locked",
      additionalTargets: [
        { expr: q("lido_vault_pdg_unlocked_eth"), legendLabel: "{{vault_name}} unlocked" },
      ],
      seriesColors: [
        { pattern: "locked$",   color: YELLOW },
        { pattern: "unlocked$", color: GREEN  },
      ],
      gridPos: pos(0, y, 24, T),
    }));
  y += T;

  // ==================== 🤖 Watcher ====================
  builder.withRow(new RowBuilder("🤖 Watcher"));
  y += 1;

  builder
    .withPanel(statPanel({
      title: "Poll errors",
      expr: `increase(stvaults_watcher_poll_errors_total{chain=~"$chain"}[$__range])`,
      legendLabel: "{{chain}}",
      decimals: 0,
      colorMode: "value", graphMode: "none",
      thresholdSteps: [{ value: null as any, color: GREEN }, { value: 1, color: ORANGE }, { value: 10, color: RED }],
      gridPos: pos(0, y, 6, S),
    }))
    .withPanel(statPanel({
      title: "Last successful poll",
      expr: `stvaults_watcher_last_poll_timestamp{chain=~"$chain"} * 1000`,
      legendLabel: "{{chain}}",
      unit: "dateTimeFromNow",
      colorMode: "none", graphMode: "none",
      gridPos: pos(6, y, 6, S),
    }))
    .withPanel(statPanel({
      title: "Time since last poll",
      expr: `time() - stvaults_watcher_last_poll_timestamp{chain=~"$chain"}`,
      legendLabel: "{{chain}}",
      unit: "s", decimals: 0,
      colorMode: "value", graphMode: "none",
      thresholdSteps: [{ value: null as any, color: GREEN }, { value: 120, color: YELLOW }, { value: 300, color: RED }],
      gridPos: pos(12, y, 6, S),
    }));

  y += S;

  // ==================== 📜 Logs ====================
  builder.withRow(new RowBuilder("📜 Logs"));
  y += 1;

  builder.withPanel(
    new LogsPanelBuilder()
      .title("Watcher logs")
      .datasource(LOKI_DS)
      .showTime(true)
      .wrapLogMessage(true)
      .enableLogDetails(true)
      .sortOrder("Ascending" as any)
      .dedupStrategy("none" as any)
      .fontSize("sm" as any)
      .withTarget(
        new LokiQueryBuilder()
          .expr('{app="stvaults-watcher", chain=~"$chain"}')
          .maxLines(200)
      )
      .gridPos(pos(0, y, 24, 12)),
  );

  return builder.build();
}
