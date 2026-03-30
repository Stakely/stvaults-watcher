import http from 'node:http';
import { register } from './definitions.js';

/**
 * Create HTTP server that serves Prometheus metrics at GET /metrics.
 * @param {number} port
 * @returns {import('http').Server}
 */
export function createMetricsServer(port) {
  const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/metrics') {
      try {
        const metrics = await register.metrics();
        res.setHeader('Content-Type', register.contentType);
        res.end(metrics);
      } catch (err) {
        res.statusCode = 500;
        res.end(String(err));
      }
      return;
    }
    res.statusCode = 404;
    res.end('Not Found');
  });

  server.listen(port, () => {
    console.log('INFO Metrics server listening on port', port);
  });

  return server;
}
