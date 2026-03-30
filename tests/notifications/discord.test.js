import test from "node:test";
import assert from "node:assert/strict";

const ORIGINAL_FETCH = globalThis.fetch;

async function loadDiscordModule() {
  return import(`../../src/notifications/discord.js?test=${Date.now()}-${Math.random()}`);
}

test.after(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

test("shouldSendAlert applies cooldown by alert key", async () => {
  const { shouldSendAlert } = await loadDiscordModule();
  const originalNow = Date.now;
  let now = 1000;
  Date.now = () => now;

  assert.equal(shouldSendAlert("k1", 300), true);
  assert.equal(shouldSendAlert("k1", 300), false);
  now = 1401;
  assert.equal(shouldSendAlert("k1", 300), true);

  Date.now = originalNow;
});

test("sendDiscordEmbed sends POST body and propagates webhook errors", async () => {
  const { sendDiscordEmbed } = await loadDiscordModule();
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 204,
      text: async () => "",
    };
  };

  await sendDiscordEmbed("https://discord.example/webhook", {
    title: "Alert",
    color: 123,
    fields: [{ name: "A", value: "B" }],
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://discord.example/webhook");
  assert.equal(calls[0].options.method, "POST");

  globalThis.fetch = async () => ({
    ok: false,
    status: 400,
    text: async () => "bad payload",
  });

  await assert.rejects(
    () =>
      sendDiscordEmbed("https://discord.example/webhook", {
        title: "Broken",
        color: 1,
      }),
    /Discord webhook failed 400: bad payload/
  );
});

test("setWebhookIdentity injects username and avatar_url in payload", async () => {
  const { setWebhookIdentity, sendDiscordEmbed } = await loadDiscordModule();
  let payload = null;
  globalThis.fetch = async (_url, options) => {
    payload = JSON.parse(options.body);
    return { ok: true, status: 204, text: async () => "" };
  };

  setWebhookIdentity({ username: "BotName", avatarUrl: "https://img.example/a.png" });
  await sendDiscordEmbed("https://discord.example/webhook", { title: "T", color: 1 });

  assert.equal(payload.username, "BotName");
  assert.equal(payload.avatar_url, "https://img.example/a.png");
  assert.equal(Array.isArray(payload.embeds), true);
});

test("sendInactiveEthAlert sends once within cooldown", async () => {
  const { sendInactiveEthAlert } = await loadDiscordModule();
  const originalNow = Date.now;
  let now = 10_000;
  Date.now = () => now;

  let callCount = 0;
  let title = "";
  globalThis.fetch = async (_url, options) => {
    callCount += 1;
    const body = JSON.parse(options.body);
    title = body.embeds[0].title;
    return { ok: true, status: 204, text: async () => "" };
  };

  await sendInactiveEthAlert(
    "https://discord.example/webhook",
    1000,
    "Vault A",
    "0x1111111111111111111111111111111111111111",
    5n * 10n ** 18n
  );
  await sendInactiveEthAlert(
    "https://discord.example/webhook",
    1000,
    "Vault A",
    "0x1111111111111111111111111111111111111111",
    5n * 10n ** 18n
  );

  assert.equal(callCount, 1);
  assert.match(title, /Inefficient ETH/);

  Date.now = originalNow;
});

test("sendUnfinalizedRequestsAlert uses critical color when there is deficit", async () => {
  const { sendUnfinalizedRequestsAlert } = await loadDiscordModule();
  let color = 0;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    color = body.embeds[0].color;
    return { ok: true, status: 204, text: async () => "" };
  };

  await sendUnfinalizedRequestsAlert(
    "https://discord.example/webhook",
    1,
    "Vault A",
    "0x1111111111111111111111111111111111111111",
    2,
    5n * 10n ** 18n,
    1n * 10n ** 18n
  );

  assert.equal(color, 0xe74c3c);
});
