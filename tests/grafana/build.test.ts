import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function readBuiltDashboard() {
  const filePath = resolve("grafana", "dashboard.json");
  return JSON.parse(readFileSync(filePath, "utf8"));
}

test("build script produces patched Contracts panel, explorer_base variable and logs syntax highlighting", async () => {
  const buildPath = resolve("src", "grafana", "build.ts");
  await import(`${pathToFileURL(buildPath).href}?test=${Date.now()}-${Math.random()}`);

  const dashboard = readBuiltDashboard();
  const contracts = dashboard.panels.find((p: any) => p.title === "Contracts");
  assert.equal(contracts?.type, "table");

  const vars = dashboard.templating?.list ?? [];
  const explorerVar = vars.find((v: any) => v.name === "explorer_base");
  assert.equal(explorerVar?.type, "query");

  const logs = dashboard.panels.find((p: any) => p.title === "Watcher logs");
  assert.equal(logs?.options?.syntaxHighlighting, true);

  // Verify that SDK-generated datasource variables are removed from templating.list
  // (datasource selection is handled via __inputs at import time instead).
  assert.equal(vars.find((v: any) => v.name === "DS_PROMETHEUS"), undefined, 'DS_PROMETHEUS must not appear in templating.list');
  assert.equal(vars.find((v: any) => v.name === "DS_LOKI"), undefined, 'DS_LOKI must not appear in templating.list');

  // Verify that __inputs declares both datasource placeholders so Grafana prompts on import.
  const inputs: any[] = dashboard.__inputs ?? [];
  assert.equal(inputs.some((i: any) => i.name === "DS_PROMETHEUS" && i.pluginId === "prometheus"), true, 'missing DS_PROMETHEUS in __inputs');
  assert.equal(inputs.some((i: any) => i.name === "DS_LOKI" && i.pluginId === "loki"), true, 'missing DS_LOKI in __inputs');
});
