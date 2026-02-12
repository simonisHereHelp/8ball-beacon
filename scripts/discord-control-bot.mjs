#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import process from "node:process";

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(".env.local");

const config = {
  token: process.env.DISCORD_BOT_TOKEN,
  guildId: process.env.DISCORD_GUILD_ID,
  allowedChannelNames: ["filings", "filings2"],
  filingsChannelId: process.env.DISCORD_FILINGS_CHANNEL_ID,
  filings2ChannelId: process.env.DISCORD_FILINGS2_CHANNEL_ID,
  apiBaseUrl: process.env.BEACON_API_BASE_URL || "http://127.0.0.1:3000",
  pollMs: Number(process.env.DISCORD_BOT_POLL_MS || 4000)
};

if (!config.token) throw new Error("Missing DISCORD_BOT_TOKEN in .env.local");
if (!config.guildId) throw new Error("Missing DISCORD_GUILD_ID in .env.local");

const discordApi = "https://discord.com/api/v10";
const authHeaders = {
  "Authorization": `Bot ${config.token}`,
  "Content-Type": "application/json"
};

const trackedChannelIds = [config.filingsChannelId, config.filings2ChannelId].filter(Boolean);
const lastSeenMessageId = new Map();

function helpText() {
  return [
    "Commands:",
    "- `scan` → /api/scan-rss-feed",
    "- `cik <CIK>` → /api/cik-json?cik=<CIK>",
    "- `log` → /api/log",
    "- `help` → this message"
  ].join("\n");
}

async function discordRequest(path, init = {}) {
  const res = await fetch(`${discordApi}${path}`, {
    ...init,
    headers: { ...authHeaders, ...(init.headers || {}) }
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(`Discord API ${res.status}: ${text.slice(0, 500)}`);
  }
  return body;
}

async function sendChannelMessage(channelId, content) {
  await discordRequest(`/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content: content.slice(0, 1900) })
  });
}

async function hitApi(path) {
  const res = await fetch(`${config.apiBaseUrl}${path}`);
  const text = await res.text();
  let body = text;
  try { body = JSON.parse(text); } catch {}
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${(typeof body === "string" ? body : JSON.stringify(body)).slice(0, 700)}`);
  }
  return body;
}

function normalizeCik(value) {
  return value.replace(/\D/g, "").slice(0, 10);
}

async function loadChannelsIfNeeded() {
  if (trackedChannelIds.length > 0) return;
  const channels = await discordRequest(`/guilds/${config.guildId}/channels`);
  for (const channel of channels) {
    if (config.allowedChannelNames.includes(channel.name)) {
      trackedChannelIds.push(channel.id);
    }
  }
}

async function primeWatermarks() {
  for (const channelId of trackedChannelIds) {
    const messages = await discordRequest(`/channels/${channelId}/messages?limit=1`);
    if (messages[0]?.id) {
      lastSeenMessageId.set(channelId, messages[0].id);
    }
  }
}

function commandFromMessage(content) {
  const [command, ...rest] = content.trim().split(/\s+/);
  return { cmd: (command || "").toLowerCase(), args: rest };
}

async function processCommand(channelId, content, authorId) {
  const { cmd, args } = commandFromMessage(content);
  if (!["scan", "cik", "log", "help"].includes(cmd)) return;

  try {
    if (cmd === "help") {
      await sendChannelMessage(channelId, `<@${authorId}>\n${helpText()}`);
      return;
    }
    if (cmd === "scan") {
      await sendChannelMessage(channelId, `<@${authorId}> running scan-rss-feed...`);
      const data = await hitApi("/api/scan-rss-feed");
      const count = Array.isArray(data?.results) ? data.results.length : "?";
      await sendChannelMessage(channelId, `<@${authorId}> ✅ scan complete (${count} results)`);
      return;
    }
    if (cmd === "log") {
      await sendChannelMessage(channelId, `<@${authorId}> exporting logs...`);
      await hitApi("/api/log");
      await sendChannelMessage(channelId, `<@${authorId}> ✅ log export complete`);
      return;
    }
    if (cmd === "cik") {
      const cik = normalizeCik(args[0] || "");
      if (!cik) {
        await sendChannelMessage(channelId, `<@${authorId}> usage: \`cik <CIK>\``);
        return;
      }
      await sendChannelMessage(channelId, `<@${authorId}> fetching cik ${cik}...`);
      await hitApi(`/api/cik-json?cik=${cik}`);
      await sendChannelMessage(channelId, `<@${authorId}> ✅ cik-json complete for ${cik}`);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await sendChannelMessage(channelId, `<@${authorId}> ❌ command failed: ${msg.slice(0, 1500)}`);
  }
}

async function pollChannel(channelId) {
  const after = lastSeenMessageId.get(channelId);
  const query = after ? `?after=${after}&limit=50` : "?limit=25";
  const messages = await discordRequest(`/channels/${channelId}/messages${query}`);
  if (!Array.isArray(messages) || messages.length === 0) return;

  const ordered = messages.slice().sort((a, b) => BigInt(a.id) > BigInt(b.id) ? 1 : -1);
  for (const message of ordered) {
    lastSeenMessageId.set(channelId, message.id);
    if (message.author?.bot) continue;
    await processCommand(channelId, message.content || "", message.author.id);
  }
}

async function main() {
  await loadChannelsIfNeeded();
  if (trackedChannelIds.length === 0) {
    throw new Error("Could not locate #filings or #filings2. Set DISCORD_FILINGS_CHANNEL_ID / DISCORD_FILINGS2_CHANNEL_ID.");
  }

  await primeWatermarks();
  console.log(`discord-control-bot polling every ${config.pollMs}ms`);
  console.log(`Guild: ${config.guildId}; Channels: ${trackedChannelIds.join(", ")}`);

  setInterval(async () => {
    for (const channelId of trackedChannelIds) {
      try {
        await pollChannel(channelId);
      } catch (error) {
        console.error(`poll failed for ${channelId}:`, error);
      }
    }
  }, config.pollMs);
}

main().catch((error) => {
  console.error("discord-control-bot failed to start:", error);
  process.exit(1);
});
