/**
 * Reusable panel builder helpers for the Grafana dashboard.
 * Supports stat, gauge and timeseries panels with thresholds,
 * value mappings and proper sizing.
 */

import { ReduceDataOptionsBuilder } from "@grafana/grafana-foundation-sdk/common";
import {
  FieldColorBuilder,
  ThresholdsConfigBuilder,
  type DataSourceRef,
  type GridPos,
  type Threshold,
  type ValueMapping,
} from "@grafana/grafana-foundation-sdk/dashboard";
import { DataqueryBuilder } from "@grafana/grafana-foundation-sdk/prometheus";
import { PanelBuilder as StatPanelBuilder } from "@grafana/grafana-foundation-sdk/stat";
import { PanelBuilder as GaugePanelBuilder } from "@grafana/grafana-foundation-sdk/gauge";
import { PanelBuilder as TimeseriesPanelBuilder } from "@grafana/grafana-foundation-sdk/timeseries";

export const DATASOURCE_VAR = "DS_PROMETHEUS";

const DS: DataSourceRef = {
  type: "prometheus",
  uid: `\${${DATASOURCE_VAR}}`,
};

function reduce() {
  return new ReduceDataOptionsBuilder().calcs(["lastNotNull"]);
}

function thresholds(steps: Threshold[]) {
  return new ThresholdsConfigBuilder()
    .mode("absolute" as any)
    .steps(steps);
}

// ---------------------------------------------------------------------------
// Panel option types
// ---------------------------------------------------------------------------

export interface StatOpts {
  title: string;
  expr: string;
  unit?: string;
  description?: string;
  legendLabel?: string;
  decimals?: number;
  colorMode?: "background" | "background_solid" | "value" | "none";
  graphMode?: "area" | "line" | "none";
  textMode?: "auto" | "value" | "value_and_name" | "name" | "none";
  thresholdSteps?: Threshold[];
  valueMappings?: ValueMapping[];
  gridPos?: GridPos;
}

export interface GaugeOpts {
  title: string;
  expr: string;
  unit?: string;
  description?: string;
  legendLabel?: string;
  decimals?: number;
  min?: number;
  max?: number;
  thresholdSteps?: Threshold[];
  valueMappings?: ValueMapping[];
  gridPos?: GridPos;
}

export interface TsOpts {
  title: string;
  expr: string;
  unit?: string;
  legendLabel?: string;
  decimals?: number;
  thresholdSteps?: Threshold[];
  valueMappings?: ValueMapping[];
  gridPos?: GridPos;
  additionalTargets?: { expr: string; legendLabel?: string }[];
  seriesColors?: { pattern: string; color: string }[];
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

export function statPanel(o: StatOpts): StatPanelBuilder {
  const p = new StatPanelBuilder()
    .title(o.title)
    .datasource(DS)
    .reduceOptions(reduce())
    .withTarget(new DataqueryBuilder().expr(o.expr).legendFormat(o.legendLabel ?? "{{vault_name}}"));

  if (o.unit) p.unit(o.unit);
  if (o.description) p.description(o.description);
  if (o.decimals !== undefined) p.decimals(o.decimals);
  if (o.gridPos) p.gridPos(o.gridPos);
  if (o.graphMode) p.graphMode(o.graphMode as any);
  if (o.colorMode) p.colorMode(o.colorMode as any);
  if (o.textMode) p.textMode(o.textMode as any);
  if (o.valueMappings) p.mappings(o.valueMappings);

  if (o.thresholdSteps) {
    p.thresholds(thresholds(o.thresholdSteps));
    p.colorScheme(new FieldColorBuilder().mode("thresholds" as any));
  }

  return p;
}

export function gaugePanel(o: GaugeOpts): GaugePanelBuilder {
  const p = new GaugePanelBuilder()
    .title(o.title)
    .datasource(DS)
    .reduceOptions(reduce())
    .showThresholdMarkers(true)
    .showThresholdLabels(false)
    .withTarget(new DataqueryBuilder().expr(o.expr).legendFormat(o.legendLabel ?? "{{vault_name}}"));

  if (o.unit) p.unit(o.unit);
  if (o.description) p.description(o.description);
  if (o.decimals !== undefined) p.decimals(o.decimals);
  if (o.gridPos) p.gridPos(o.gridPos);
  if (o.min !== undefined) p.min(o.min);
  if (o.max !== undefined) p.max(o.max);
  if (o.valueMappings) p.mappings(o.valueMappings);

  if (o.thresholdSteps) {
    p.thresholds(thresholds(o.thresholdSteps));
    p.colorScheme(new FieldColorBuilder().mode("thresholds" as any));
  }

  return p;
}

export function timeseriesPanel(o: TsOpts): TimeseriesPanelBuilder {
  const p = new TimeseriesPanelBuilder()
    .title(o.title)
    .datasource(DS)
    .lineWidth(2)
    .fillOpacity(15)
    .withTarget(new DataqueryBuilder().expr(o.expr).legendFormat(o.legendLabel ?? "{{vault_name}}"));

  if (o.unit) p.unit(o.unit);
  if (o.decimals !== undefined) p.decimals(o.decimals);
  if (o.gridPos) p.gridPos(o.gridPos);
  if (o.valueMappings) p.mappings(o.valueMappings);
  if (o.additionalTargets) {
    for (const t of o.additionalTargets) {
      p.withTarget(new DataqueryBuilder().expr(t.expr).legendFormat(t.legendLabel ?? "{{vault_name}}"));
    }
  }
  if (o.seriesColors) {
    for (const s of o.seriesColors) {
      p.overrideByRegexp(s.pattern, [{ id: "color", value: { mode: "fixed", fixedColor: s.color } }]);
    }
  }

  if (o.thresholdSteps) {
    p.thresholds(thresholds(o.thresholdSteps));
    p.colorScheme(new FieldColorBuilder().mode("thresholds" as any));
  }

  return p;
}
