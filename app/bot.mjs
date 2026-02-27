#!/usr/bin/env node
import process from "node:process";
import { loadEnvFile, getBotConfig } from "../lib/bot/env.mjs";
import { runPollingCycle } from "../lib/bot/workflow.mjs";
import { discordRequest, fetchBotIdentity, resolveTrackedChannels } from "../lib/bot/discordApi.mjs";
import { sendDiscord } from "../lib/sendDiscord.mjs";
import { hitApi } from "../lib/bot/apiClient.mjs";

loadEnvFile(".env.local");

const config = getBotConfig();
const WORKFLOW_INTERVAL_MS = 10000;

let tickRunning = false;
let lastErrorMessage = "";
let filingsChannelId = config.filingsChannelId || null;
let listingsChannelId = null;
let lastSeenMessageId = null;
let lastSeenListingsMessageId = null;

function helpText() {
  return [
    "Commands:",
    "- filing | filings -> runs /api/scan-rss-feed",
    "- earning | earning call | calendar | earning event -> runs /api/next-earning-call",
    "- status | state | log -> runs /api/log",
    "- help | how to -> this help",
    "",
    "Routes:",
    "- /api/scan-rss-feed",
    "- /api/scan-finn-feed",
    "- /api/scan-news-feed",
    "- /api/next-earning-call",
    "- /api/log",
    "",
    "2-terminal npm:",
    "npm run dev",
    "npm run bot",
    "",
    "Key files:",
    "- app/bot.mjs",
    "- lib/bot/env.mjs",
    "- lib/bot/discordApi.mjs",
    "- lib/bot/apiClient.mjs",
    "- lib/bot/workflow.mjs",
    "- app/api/*"
  ].join("\n");
}

function normalizeMessage(content) {
  return String(content || "").trim().toLowerCase();
}

function shouldRunScanRssRoute(content) {
  const c = normalizeMessage(content);
  return c.includes("filing") || c.includes("filings");
}

function shouldRunLogRoute(content) {
  const c = normalizeMessage(content);
  return c.includes("status") || c.includes("log") || c.includes("state");
}

function shouldRunNextEarningCall(content) {
  const c = normalizeMessage(content);
  return c.includes("earning call") || c.includes("earning event") || c.includes("earning calendar");
}

function shouldSendHelp(content) {
  const c = normalizeMessage(content);
  return c.includes("help") || c.includes("how to");
}

async function resolveFilingsChannelId() {
  if (filingsChannelId) return filingsChannelId;

  const channels = await discordRequest(config.token, `/guilds/${config.guildId}/channels`);
  if (!Array.isArray(channels)) return null;

  const filingsChannel = channels.find((channel) => channel?.name === "filings");
  filingsChannelId = filingsChannel?.id || null;
  return filingsChannelId;
}

async function resolveListingsChannelId() {
  if (listingsChannelId) return listingsChannelId;

  const channels = await discordRequest(config.token, `/guilds/${config.guildId}/channels`);
  if (!Array.isArray(channels)) return null;

  const listingsChannel = channels.find((channel) => channel?.name === "listings");
  listingsChannelId = listingsChannel?.id || null;
  return listingsChannelId;
}

async function primeMessageWatermark(channelId) {
  const messages = await discordRequest(config.token, `/channels/${channelId}/messages?limit=1`);
  if (Array.isArray(messages) && messages[0]?.id) {
    return messages[0].id;
  }
  return null;
}

async function pollFilingsChannel(botId) {
  const channelId = await resolveFilingsChannelId();
  if (!channelId) return;

  const afterQuery = lastSeenMessageId ? `?after=${lastSeenMessageId}&limit=50` : "?limit=20";
  const messages = await discordRequest(config.token, `/channels/${channelId}/messages${afterQuery}`);
  if (!Array.isArray(messages) || messages.length === 0) return;

  const ordered = messages.slice().sort((a, b) => (BigInt(a.id) > BigInt(b.id) ? 1 : -1));

  for (const message of ordered) {
    lastSeenMessageId = message.id;
    if (!message?.content) continue;
    if (message?.author?.id === botId || message?.author?.bot) continue;

    if (shouldRunScanRssRoute(message.content)) {
      await hitApi("/api/scan-rss-feed");
      continue;
    }

    if (shouldRunLogRoute(message.content)) {
      await hitApi("/api/log");
      continue;
    }

    if (shouldRunNextEarningCall(message.content)) {
      await hitApi("/api/next-earning-call");
      continue;
    }

    if (shouldSendHelp(message.content)) {
      await sendDiscord(helpText());
    }
  }
}

async function pollListingsChannel(botId) {
  const channelId = await resolveListingsChannelId();
  if (!channelId) return;

  const afterQuery = lastSeenListingsMessageId ? `?after=${lastSeenListingsMessageId}&limit=50` : "?limit=20";
  const messages = await discordRequest(config.token, `/channels/${channelId}/messages${afterQuery}`);
  if (!Array.isArray(messages) || messages.length === 0) return;

  const ordered = messages.slice().sort((a, b) => (BigInt(a.id) > BigInt(b.id) ? 1 : -1));

  for (const message of ordered) {
    lastSeenListingsMessageId = message.id;
    if (!message?.content) continue;
    if (message?.author?.id === botId || message?.author?.bot) continue;

    const addMatch = message.content.match(/^add\s+ticker\s*,\s*([a-z.\-]+)$/i);
    if (addMatch) {
      const ticker = addMatch[1].toUpperCase();
      const result = await hitApi(`/api/listings-helper?action=add&ticker=${encodeURIComponent(ticker)}`);
      await sendDiscord(String(result?.message || `Processed add ticker, ${ticker}`));
      continue;
    }

    const removeMatch = message.content.match(/^remove\s+ticker\s*,\s*([a-z.\-]+)$/i);
    if (removeMatch) {
      const ticker = removeMatch[1].toUpperCase();
      const result = await hitApi(`/api/listings-helper?action=remove&ticker=${encodeURIComponent(ticker)}`);
      await sendDiscord(String(result?.message || `Processed remove ticker, ${ticker}`));
    }
  }
}

async function sendStartMessage(botId) {
  await sendDiscord(`Polling start: ${botId} ${WORKFLOW_INTERVAL_MS}ms`);
}

async function tick(botId) {
  if (tickRunning) return;
  tickRunning = true;

  try {
    await runPollingCycle();
    await pollFilingsChannel(botId);
    await pollListingsChannel(botId);
    lastErrorMessage = "";
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg !== lastErrorMessage) {
      await sendDiscord(`Polling error: ${msg.slice(0, 1700)}`);
      lastErrorMessage = msg;
    }
    console.error(`[bot] poll failed: ${msg}`);
  } finally {
    tickRunning = false;
  }
}

async function main() {
  const identity = await fetchBotIdentity(config.token);
  const botId = identity.id || config.startupBotId;
  const trackedChannels = await resolveTrackedChannels(config);

  await resolveFilingsChannelId();
  await resolveListingsChannelId();
  if (filingsChannelId) {
    lastSeenMessageId = await primeMessageWatermark(filingsChannelId);
  }
  if (listingsChannelId) {
    lastSeenListingsMessageId = await primeMessageWatermark(listingsChannelId);
  }

  await sendStartMessage(botId);
  console.log(`bot polling local API routes every ${WORKFLOW_INTERVAL_MS}ms`);
  console.log(`bot id: ${botId}`);
  console.log(`tracked channels: ${trackedChannels.join(",") || "none"}`);
  console.log(`filings channel: ${filingsChannelId || "not-found"}`);
  console.log(`listings channel: ${listingsChannelId || "not-found"}`);

  await tick(botId);
  setInterval(() => tick(botId), WORKFLOW_INTERVAL_MS);
}

main().catch(async (error) => {
  const msg = error instanceof Error ? error.message : String(error);
  console.error("bot failed to start:", error);
  try {
    await sendDiscord(`Bot startup failed: ${msg.slice(0, 1700)}`);
  } finally {
    process.exit(1);
  }
});
