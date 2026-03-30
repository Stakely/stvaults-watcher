import test from "node:test";
import assert from "node:assert/strict";
import { buildDashboard } from "../../src/grafana/dashboard.ts";

function getPanels(dashboard: any) {
  return dashboard.panels ?? [];
}

test("buildDashboard returns base dashboard shape", () => {
  const dashboard: any = buildDashboard();
  assert.equal(typeof dashboard.schemaVersion, "number");
  assert.equal(Array.isArray(dashboard.templating?.list), true);
  assert.equal(Array.isArray(getPanels(dashboard)), true);
  assert.equal(getPanels(dashboard).length > 0, true);
});

test("buildDashboard includes key template variables", () => {
  const dashboard: any = buildDashboard();
  const vars = dashboard.templating.list.map((v: any) => v.name);
  // datasource vars are named DS_PROMETHEUS / DS_LOKI (used as __inputs placeholders);
  // build.ts removes them from templating.list, but dashboard.ts still emits them.
  assert.equal(vars.includes("DS_PROMETHEUS"), true);
  assert.equal(vars.includes("chain"), true);
  assert.equal(vars.includes("vault_name"), true);
  assert.equal(vars.includes("DS_LOKI"), true);
});

test("buildDashboard includes key panels by title", () => {
  const dashboard: any = buildDashboard();
  const titles = getPanels(dashboard).map((p: any) => p.title);
  for (const title of [
    "Watcher version",
    "Health factor",
    "Withdrawal deficit",
    "Contracts",
    "Watcher logs",
  ]) {
    assert.equal(titles.includes(title), true, `missing panel: ${title}`);
  }
});
