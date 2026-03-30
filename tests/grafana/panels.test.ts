import test from "node:test";
import assert from "node:assert/strict";
import { DATASOURCE_VAR, gaugePanel, statPanel, timeseriesPanel } from "../../src/grafana/panels.ts";

test("DATASOURCE_VAR keeps expected variable name", () => {
  assert.equal(DATASOURCE_VAR, "DS_PROMETHEUS");
});

test("statPanel builds stat panel config with expression", () => {
  const panel: any = statPanel({
    title: "StatTest",
    expr: "up",
    unit: "short",
  }).build();

  assert.equal(panel.type, "stat");
  assert.equal(panel.title, "StatTest");
  assert.equal(panel.targets[0].expr, "up");
});

test("gaugePanel builds gauge panel config with expression", () => {
  const panel: any = gaugePanel({
    title: "GaugeTest",
    expr: "up",
    min: 0,
    max: 100,
  }).build();

  assert.equal(panel.type, "gauge");
  assert.equal(panel.title, "GaugeTest");
  assert.equal(panel.targets[0].expr, "up");
});

test("timeseriesPanel builds timeseries panel config with expression", () => {
  const panel: any = timeseriesPanel({
    title: "TimeseriesTest",
    expr: "up",
  }).build();

  assert.equal(panel.type, "timeseries");
  assert.equal(panel.title, "TimeseriesTest");
  assert.equal(panel.targets[0].expr, "up");
});
