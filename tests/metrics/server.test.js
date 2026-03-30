import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createMetricsServer } from "../../src/metrics/server.js";
import { register } from "../../src/metrics/definitions.js";

test("createMetricsServer serves /metrics and returns 404 for unknown path", async () => {
  register.resetMetrics();
  const server = createMetricsServer(0);
  await once(server, "listening");

  const { port } = server.address();
  const metricsResponse = await fetch(`http://127.0.0.1:${port}/metrics`);
  assert.equal(metricsResponse.status, 200);
  assert.match(metricsResponse.headers.get("content-type"), /text\/plain/);

  const unknownResponse = await fetch(`http://127.0.0.1:${port}/unknown`);
  assert.equal(unknownResponse.status, 404);

  await new Promise((resolve) => server.close(resolve));
});
