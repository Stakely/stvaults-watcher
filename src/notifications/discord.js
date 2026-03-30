/**
 * Discord webhook alerts with cooldown. No recovery messages.
 */

const COLORS = { warning: 0xf1c532, critical: 0xe74c3c };

const cooldowns = new Map();

/**
 * @param {string} alertKey - Unique key per alert type + vault (e.g. "inactive-eth:0x...")
 * @param {number} cooldownMs
 * @returns {boolean} true if we should send (not in cooldown)
 */
export function shouldSendAlert(alertKey, cooldownMs) {
  const now = Date.now();
  const last = cooldowns.get(alertKey) ?? 0;
  if (now - last < cooldownMs) return false;
  cooldowns.set(alertKey, now);
  return true;
}

let webhookIdentity = {};

/**
 * Set the Discord webhook username and avatar for all messages.
 * @param {{ username?: string, avatarUrl?: string }} identity
 */
export function setWebhookIdentity(identity) {
  if (identity.username) webhookIdentity.username = identity.username;
  if (identity.avatarUrl) webhookIdentity.avatar_url = identity.avatarUrl;
}

/**
 * @param {string} url - Discord webhook URL
 * @param {{ title: string, description?: string, color: number, fields?: Array<{ name: string, value: string, inline?: boolean }> }} embed
 */
export async function sendDiscordEmbed(url, embed) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...webhookIdentity, embeds: [embed] }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord webhook failed ${res.status}: ${text}`);
  }
}

/**
 * Send alert for inactive ETH above threshold.
 */
export async function sendInactiveEthAlert(webhookUrl, cooldownMs, vaultName, vaultAddress, inactiveEthWei) {
  const key = `inactive-eth:${vaultAddress}`;
  if (!shouldSendAlert(key, cooldownMs)) return;
  const eth = Number(inactiveEthWei) / 1e18;
  await sendDiscordEmbed(webhookUrl, {
    title: `⚠️ Inefficient ETH (${vaultName})`,
    description: `Vault **${vaultName}** has ETH in the buffer that is not in validators.`,
    color: COLORS.warning,
    fields: [
      { name: 'Vault', value: vaultAddress, inline: false },
      { name: 'Inactive ETH', value: `${eth.toFixed(4)} ETH`, inline: true },
    ],
  });
}

/**
 * Send alert for new unfinalized withdrawal requests.
 */
export async function sendUnfinalizedRequestsAlert(webhookUrl, cooldownMs, vaultName, vaultAddress, count, unfinalizedAssetsWei, availableBalanceWei) {
  const key = `unfinalized-requests:${vaultAddress}`;
  if (!shouldSendAlert(key, cooldownMs)) return;
  const need = Number(unfinalizedAssetsWei) / 1e18;
  const have = Number(availableBalanceWei) / 1e18;
  const deficit = need - have;
  const covered = deficit <= 0;
  const fields = [
    { name: 'Vault', value: vaultAddress, inline: false },
    { name: 'Requests', value: String(count), inline: true },
    { name: 'ETH pending', value: `${need.toFixed(4)} ETH`, inline: true },
    { name: 'Unstaked in vault', value: `${have.toFixed(4)} ETH`, inline: true },
  ];
  if (!covered) {
    fields.push({ name: '⚠️ Exit from validators', value: `${deficit.toFixed(4)} ETH`, inline: true });
  }
  await sendDiscordEmbed(webhookUrl, {
    title: `⚠️ Withdrawal Requests Pending (${vaultName})`,
    description: covered
      ? `Vault **${vaultName}** has unfinalized withdrawal requests. The vault has enough balance to cover them.`
      : `Vault **${vaultName}** has unfinalized withdrawal requests. The vault does **NOT** have enough balance. You need to exit **${deficit.toFixed(4)} ETH** from validators.`,
    color: covered ? COLORS.warning : COLORS.critical,
    fields,
  });
}

/**
 * Send alert for low health factor (warning threshold).
 */
export async function sendHealthWarningAlert(webhookUrl, cooldownMs, vaultName, vaultAddress, healthFactorPct, threshold) {
  const key = `health-warning:${vaultAddress}`;
  if (!shouldSendAlert(key, cooldownMs)) return;
  await sendDiscordEmbed(webhookUrl, {
    title: `⚠️ Health Factor Low (${vaultName})`,
    description: `Vault **${vaultName}** health factor is below ${threshold}%.`,
    color: COLORS.warning,
    fields: [
      { name: 'Vault', value: vaultAddress, inline: false },
      { name: 'Health factor', value: `${healthFactorPct.toFixed(2)}%`, inline: true },
      { name: 'Threshold', value: `${threshold}%`, inline: true },
    ],
  });
}

/**
 * Send alert for critical health factor.
 */
export async function sendHealthCriticalAlert(webhookUrl, cooldownMs, vaultName, vaultAddress, healthFactorPct, threshold) {
  const key = `health-critical:${vaultAddress}`;
  if (!shouldSendAlert(key, cooldownMs)) return;
  await sendDiscordEmbed(webhookUrl, {
    title: `🔴 Health Factor Critical (${vaultName})`,
    description: `Vault **${vaultName}** health factor is below ${threshold}%. Forced rebalance may apply.`,
    color: COLORS.critical,
    fields: [
      { name: 'Vault', value: vaultAddress, inline: false },
      { name: 'Health factor', value: `${healthFactorPct.toFixed(2)}%`, inline: true },
    ],
  });
}

/**
 * Send alert for forced rebalance (health shortfall > 0).
 */
export async function sendForcedRebalanceAlert(webhookUrl, cooldownMs, vaultName, vaultAddress, healthShortfallShares) {
  const key = `forced-rebalance:${vaultAddress}`;
  if (!shouldSendAlert(key, cooldownMs)) return;
  await sendDiscordEmbed(webhookUrl, {
    title: `🔴 Forced Rebalance Required (${vaultName})`,
    description: `Vault **${vaultName}** has health shortfall. Rebalancing is required.`,
    color: COLORS.critical,
    fields: [
      { name: 'Vault', value: vaultAddress, inline: false },
      { name: 'Health shortfall (shares)', value: String(healthShortfallShares), inline: true },
    ],
  });
}

/**
 * Send alert for high utilization ratio.
 */
export async function sendUtilizationHighAlert(webhookUrl, cooldownMs, vaultName, vaultAddress, utilizationPct, threshold) {
  const key = `utilization-high:${vaultAddress}`;
  if (!shouldSendAlert(key, cooldownMs)) return;
  await sendDiscordEmbed(webhookUrl, {
    title: `⚠️ Utilization Ratio High (${vaultName})`,
    description: `Vault **${vaultName}** utilization is above ${threshold}%.`,
    color: COLORS.warning,
    fields: [
      { name: 'Vault', value: vaultAddress, inline: false },
      { name: 'Utilization', value: `${utilizationPct.toFixed(2)}%`, inline: true },
    ],
  });
}

/**
 * Send alert for stale oracle report.
 */
export async function sendReportStaleAlert(webhookUrl, cooldownMs, vaultName, vaultAddress) {
  const key = `report-stale:${vaultAddress}`;
  if (!shouldSendAlert(key, cooldownMs)) return;
  await sendDiscordEmbed(webhookUrl, {
    title: `⚠️ Oracle Report Stale (${vaultName})`,
    description: `Vault **${vaultName}** oracle report is no longer fresh. Submit a report if needed.`,
    color: COLORS.warning,
    fields: [{ name: 'Vault', value: vaultAddress, inline: false }],
  });
}

/**
 * Send alert for vault not healthy (isVaultHealthy false).
 */
export async function sendVaultUnhealthyAlert(webhookUrl, cooldownMs, vaultName, vaultAddress) {
  const key = `vault-unhealthy:${vaultAddress}`;
  if (!shouldSendAlert(key, cooldownMs)) return;
  await sendDiscordEmbed(webhookUrl, {
    title: `🔴 Vault Unhealthy (${vaultName})`,
    description: `Vault **${vaultName}** is not healthy. Check health factor and consider rebalancing.`,
    color: COLORS.critical,
    fields: [{ name: 'Vault', value: vaultAddress, inline: false }],
  });
}
