#!/usr/bin/env node
import process from "node:process";
import { loadEnvFile, getBotConfig } from "../lib/bot/env.mjs";
import { runPollingCycle } from "../lib/bot/workflow.mjs";

loadEnvFile(".env.local");

import { sendDiscord } from "../lib/sendDiscord.mjs";
const config = getBotConfig();

let pollCount = 0;
let tickRunning = false;

async function sendStartMessage() {
  await sendDiscord(`Polling start: ${config.startupBotId} ${config.pollMs}ms`);
}

async function tick() {
  if (tickRunning) return;
  tickRunning = true;

  try {
    pollCount += 1;
    const state = await runPollingCycle({ apiBaseUrl: config.apiBaseUrl, sendDiscord });
    if (pollCount % 25 === 0) {
      await sendDiscord(`Bot state: polls=${pollCount}, last scan=${state.scanCount}, last cik-json=${state.cikJsonCount}`);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await sendDiscord(`Polling error: ${msg.slice(0, 1700)}`);
    console.error("bot poll failed:", error);
  } finally {
    tickRunning = false;
  }
}

async function main() {
  await sendStartMessage();
  console.log(`bot polling ${config.apiBaseUrl} every ${config.pollMs}ms`);
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
