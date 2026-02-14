#!/usr/bin/env node
import process from "node:process";
import { loadEnvFile, getBotConfig } from "../lib/bot/env.mjs";
import { runPollingCycle } from "../lib/bot/workflow.mjs";
import { fetchBotIdentity, resolveTrackedChannels } from "../lib/bot/discordApi.mjs";
import { sendDiscord } from "../lib/sendDiscord.mjs";

loadEnvFile(".env.local");

const config = getBotConfig();

let pollCount = 0;
let tickRunning = false;
let lastErrorMessage = "";

async function sendStartMessage(botId) {
  await sendDiscord(`Polling start: ${botId} ${config.pollMs}ms`);
}

async function tick() {
  if (tickRunning) return;
  tickRunning = true;

  try {
    pollCount += 1;
    const state = await runPollingCycle({ sendDiscord });
    lastErrorMessage = "";
    if (pollCount % 25 === 0) {
      await sendDiscord(`Bot state: polls=${pollCount}, last scan=${state.scanCount}, last cik-json=${state.cikJsonCount}`);
    }
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

  await sendStartMessage(botId);
  await sendDiscord(`Bot scope: guild=${config.guildId}, channels=${trackedChannels.join(",") || "none"}`);

  console.log(`bot polling local API routes every ${config.pollMs}ms`);
  console.log(`bot id: ${botId}`);
  console.log(`tracked channels: ${trackedChannels.join(",") || "none"}`);

  await tick();
  setInterval(tick, config.pollMs);
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
