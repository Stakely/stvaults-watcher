# stvaults-watcher

[![CI](https://github.com/stakely/stvaults-watcher/actions/workflows/ci.yml/badge.svg)](https://github.com/stakely/stvaults-watcher/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-%3E%3D24-brightgreen)](https://nodejs.org)
[![Version](https://img.shields.io/github/package-json/v/stakely/stvaults-watcher)](package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Monitoring watcher for [Lido V3](https://docs.lido.fi) stVaults with DeFi Wrapper pools. Reads on-chain data via [viem](https://viem.sh), exposes Prometheus metrics, and sends Discord alerts for health and withdrawal events.

<p align="center">
  <img src="grafana/preview.png" alt="Grafana Dashboard" width="900" />
</p>

## Features

- **Multi-vault**: monitor multiple stVaults from a single instance, each with a human-readable `vault_name`
- **Prometheus metrics**: health factor, utilization ratio, inactive ETH, withdrawal queue, and more
- **Discord alerts**: health warnings/criticals and pending withdrawal requests, with per-vault cooldowns
- **Ethereum mainnet and Hoodi testnet** support

## Requirements

- Node.js ≥ 24 **or** Docker
- An Ethereum/Hoodi JSON-RPC endpoint (`RPC_URL`)
- Discord webhook URL *(optional; only needed for alerts)*

## Quick start

**Docker Compose (recommended)**

```bash
cp .env.example .env
# Edit .env with your RPC URL and vault addresses
docker compose -f example.docker-compose.yaml up -d
```

**Node.js**

```bash
npm ci
cp .env.example .env
# Edit .env with your RPC URL and vault addresses
node src/index.js
```

Metrics will be available at `http://localhost:9600/metrics`.

## Configuration

Copy `.env.example` to `.env` and adjust the values.

| Variable | Required | Default | Description |
|---|---|---|---|
| `RPC_URL` | ✓ | | Ethereum/Hoodi JSON-RPC endpoint |
| `CHAIN` | ✓ | | `mainnet` · `hoodi` |
| `VAULT_CONFIGS` | ✓ | | JSON array of vault objects; see below |
| `POLL_INTERVAL_MIN` | | `1` | Polling interval in minutes |
| `METRICS_PORT` | | `9600` | Prometheus metrics port |
| `DISCORD_WEBHOOK_URL` | | | Enables Discord alerts when set |
| `DISCORD_USERNAME` | | `stvaults-watcher` | Webhook display name for Discord alerts |
| `DISCORD_AVATAR_URL` | | `https://img.lightshot.app/LsNhkD8gRZaPcHK8lJqnWQ.png` | Webhook avatar URL for Discord alerts |
| `ALERT_COOLDOWN_MIN` | | `30` | Alert cooldown per vault per type (minutes) |
| `HEALTH_WARNING_THRESHOLD` | | `107` | Health factor warning level (%) |
| `HEALTH_CRITICAL_THRESHOLD` | | `102` | Health factor critical level (%) |
| `UTILIZATION_WARNING_THRESHOLD` | | `95` | Utilization ratio warning level (%) |
| `INACTIVE_ETH_THRESHOLD` | | `2` | Inactive ETH alert threshold (ETH amount; integer or decimal, e.g. `2` or `2.5`) |

`CHAIN` is used to resolve `chainId` and core Lido addresses (VaultHub, stETH, PDG) automatically from `src/networks.json`.

**`VAULT_CONFIGS` format**

```json
[
  { "vault": "0x...", "pool": "0x...", "vault_name": "my-vault" },
  { "vault": "0x...", "vault_name": "vault-no-pool" },
  { "vault": "0x...", "withdrawalQueue": "0x...", "dashboard": "0x...", "vault_name": "manual-wrapper-addrs" }
]
```

`pool` is optional. Vaults without a DeFi Wrapper pool skip WithdrawalQueue/dashboard auto-discovery; all VaultHub and StakingVault metrics still work. You can set `withdrawalQueue` and `dashboard` manually when there is no `pool`.

## Alerts (Discord)

When `DISCORD_WEBHOOK_URL` is set, the watcher sends embeds with a **per-vault, per-alert-type** cooldown (`ALERT_COOLDOWN_MIN`). There are no “recovery” notifications when a condition clears.

| Alert (type) | When it fires |
|---|---|
| Inactive ETH | Buffer inefficiency above `INACTIVE_ETH_THRESHOLD` |
| Withdrawal requests pending | `unfinalizedRequests > 0` |
| Health — warning | Health factor below `HEALTH_WARNING_THRESHOLD` (and not already critical) |
| Health — critical | Health factor below `HEALTH_CRITICAL_THRESHOLD` |
| Forced rebalance | `healthShortfallShares > 0` and not the sentinel max value |
| Utilization high | Utilization at or above `UTILIZATION_WARNING_THRESHOLD` |
| Vault unhealthy | VaultHub reports not healthy (`!isHealthy`) |

## Metrics

All ETH values are in ETH (not wei), except metrics explicitly named as shares/ids/counters.

### Vault - General

| Metric | Description |
|---|---|
| `lido_vault_total_value_eth` | Total vault value in ETH |
| `lido_vault_available_balance_eth` | ETH available in vault buffer |
| `lido_vault_staged_balance_eth` | ETH staged for validators |
| `lido_vault_inactive_eth` | Inactive ETH (available − staged) |
| `lido_vault_withdrawable_value_eth` | ETH withdrawable from VaultHub |
| `lido_vault_node_operator_fee_eth` | Undisbursed node operator fee in ETH |

### Vault - Health & Ratios

| Metric | Description |
|---|---|
| `lido_vault_health_factor` | Health factor (%) |
| `lido_vault_is_healthy` | `1` if vault is healthy, `0` otherwise |
| `lido_vault_health_shortfall_shares` | Shares needed to restore health |
| `lido_vault_utilization_ratio` | Utilization ratio (%) |
| `lido_vault_report_fresh` | `1` if oracle report is fresh, `0` if stale |
| `lido_vault_forced_rebalance_threshold` | Forced rebalance threshold (%) |
| `lido_vault_reserve_ratio` | Reserve ratio (%) |

### Vault - stETH

| Metric | Description |
|---|---|
| `lido_vault_steth_liability_shares` | stETH liability in shares |
| `lido_vault_steth_liability_eth` | stETH liability converted to ETH |
| `lido_vault_minting_capacity_shares` | Total minting capacity in shares |
| `lido_vault_minting_capacity_eth` | Total minting capacity converted to ETH |

### Vault - PDG

| Metric | Description |
|---|---|
| `lido_vault_pdg_total_eth` | Total PDG guarantee balance in ETH |
| `lido_vault_pdg_locked_eth` | Locked PDG guarantee balance in ETH |
| `lido_vault_pdg_unlocked_eth` | Unlocked PDG guarantee balance in ETH |
| `lido_vault_pdg_pending_activations` | PDG validators pending activation |
| `lido_vault_pdg_policy` | PDG policy enum (`0=STRICT`, `1=ALLOW_PROVE`, `2=ALLOW_DEPOSIT_AND_PROVE`) |

### Withdrawal Queue

| Metric | Description |
|---|---|
| `lido_wq_unfinalized_requests` | Pending withdrawal requests |
| `lido_wq_unfinalized_assets_eth` | ETH pending in the withdrawal queue |
| `lido_wq_last_request_id` | Last withdrawal request ID |
| `lido_wq_last_finalized_id` | Last finalized withdrawal request ID |

### Watcher & Metadata

| Metric | Description |
|---|---|
| `lido_vault_contracts_info` | Contract addresses info (set once at startup) |
| `stvaults_watcher_info` | Watcher metadata (`version`, `chain`, `explorer_url`) |
| `stvaults_watcher_last_poll_timestamp` | Unix timestamp of last successful poll |
| `stvaults_watcher_poll_errors_total` | Total polling errors counter |

Most vault metrics include labels `vault`, `vault_name`, and `chain`.
`lido_vault_contracts_info` and `stvaults_watcher_*` use dedicated label sets.

## Grafana dashboard

The dashboard is defined as TypeScript and compiled to `grafana/dashboard.json`.

```bash
npm run grafana:build   # regenerate grafana/dashboard.json
```

Import `grafana/dashboard.json` in Grafana: the import wizard asks for **Prometheus** (`DS_PROMETHEUS`) and **Loki** (`DS_LOKI`) — see `src/grafana/build.ts` (`__inputs`). After import, use the **Chain** and **Vault** template variables at the top to filter metrics; log panels use the Loki datasource you picked.

## Logging (Loki)

If you're running Grafana Loki, you can ship container logs directly via the Docker Loki logging driver. Add a `logging` block to your service in `docker-compose.yaml`:

```yaml
services:
  stvaults-watcher:
    # ... rest of your service definition ...
    logging:
      driver: loki
      options:
        loki-url: "https://user:password@lokiserver.com/loki/api/v1/push"
        loki-external-labels: "container_name={{.Name}},app=stvaults-watcher,chain=mainnet,instance=stvaults-watcher-mainnet"
```

> The driver must be installed first: `docker plugin install grafana/loki-docker-driver:latest --alias loki --grant-all-permissions`

All log lines are emitted to **stdout** (the watcher never uses `console.error`/`console.warn`), so Docker labels every line as `stream=stdout`. Log level (`INFO`, `WARN`, `ERROR`) is embedded in the message and can be parsed by Loki pipelines.

## Development

```bash
npm ci
npm test
```

CI runs on every PR to `main`: unit tests, Grafana dashboard build, and JSON structure validation.

## License

[MIT](LICENSE)
