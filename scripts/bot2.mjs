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
  filings1ChannelId: process.env.DISCORD_FILINGS1_CHANNEL_ID || process.env.DISCORD_FILINGS_CHANNEL_ID,
  filings2ChannelId: process.env.DISCORD_FILINGS2_CHANNEL_ID,
  pollMs: Number(process.env.DISCORD_BOT_POLL_MS || 4000)
};

if (!config.token) throw new Error("Missing DISCORD_BOT_TOKEN in .env.local");
if (!config.guildId) throw new Error("Missing DISCORD_GUILD_ID in .env.local");

const discordApi = "https://discord.com/api/v10";
const authHeaders = {
  "Authorization": `Bot ${config.token}`,
  "Content-Type": "application/json"
};

let filings1ChannelId = config.filings1ChannelId || "";
let filings2ChannelId = config.filings2ChannelId || "";
let lastSeenMessageId = "";

async function discordRequest(path, init = {}) {
  const res = await fetch(`${discordApi}${path}`, {
    ...init,
    headers: { ...authHeaders, ...(init.headers || {}) }
  });

  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text || null;
  }

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

async function resolveChannels() {
  if (filings1ChannelId && filings2ChannelId) return;

  const channels = await discordRequest(`/guilds/${config.guildId}/channels`);
  if (!Array.isArray(channels)) return;

  if (!filings1ChannelId) {
    const c = channels.find((channel) => channel?.type === 0 && ["filings1", "filings"].includes(channel?.name));
    if (c?.id) filings1ChannelId = c.id;
  }

  if (!filings2ChannelId) {
    const c = channels.find((channel) => channel?.type === 0 && channel?.name === "filings2");
    if (c?.id) filings2ChannelId = c.id;
  }

  if (!filings1ChannelId || !filings2ChannelId) {
    throw new Error("Could not resolve #filings1/#filings2. Set DISCORD_FILINGS1_CHANNEL_ID and DISCORD_FILINGS2_CHANNEL_ID.");
  }
}

async function primeWatermark() {
  const messages = await discordRequest(`/channels/${filings1ChannelId}/messages?limit=1`);
  if (Array.isArray(messages) && messages[0]?.id) {
    lastSeenMessageId = messages[0].id;
  }
}

async function processMessage(message) {
  if (!message || message.author?.bot) return;
  const content = String(message.content || "").trim().toLowerCase();
  if (content !== "simon say") return;

  await sendChannelMessage(filings2ChannelId, "simon say hi");
}

async function pollFilings1() {
  const query = lastSeenMessageId ? `?after=${lastSeenMessageId}&limit=50` : "?limit=25";
  const messages = await discordRequest(`/channels/${filings1ChannelId}/messages${query}`);
  if (!Array.isArray(messages) || messages.length === 0) return;

  const ordered = messages.slice().sort((a, b) => BigInt(a.id) > BigInt(b.id) ? 1 : -1);
  for (const message of ordered) {
    lastSeenMessageId = message.id;
    await processMessage(message);
  }
}

async function main() {
  await resolveChannels();

  // 1) upload start announcement to #filings2
  await sendChannelMessage(filings2ChannelId, "hello world");

  // 2) monitor #filings1 for "simon say"
  await primeWatermark();

  console.log(`bot2 ready: guild=${config.guildId} filings1=${filings1ChannelId} filings2=${filings2ChannelId} poll=${config.pollMs}ms`);

  setInterval(async () => {
    try {
      await pollFilings1();
    } catch (error) {
      console.error("bot2 poll failed:", error);
    }
  }, config.pollMs);
}

main().catch((error) => {
  console.error("bot2 failed to start:", error);
  process.exit(1);
});