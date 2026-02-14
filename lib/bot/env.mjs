import { existsSync, readFileSync } from "node:fs";
import process from "node:process";

const DEFAULT_CHANNEL_NAMES = ["filings", "filings2"];

function parseAllowedChannelNames(raw) {
  if (!raw) return DEFAULT_CHANNEL_NAMES;
  return raw
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

export function loadEnvFile(path = ".env.local") {
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
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

export function getBotConfig() {
  const config = {
    token: process.env.DISCORD_BOT_TOKEN,
    guildId: process.env.DISCORD_GUILD_ID,
    allowedChannelNames: parseAllowedChannelNames(process.env.DISCORD_ALLOWED_CHANNEL_NAMES),
    filingsChannelId: process.env.DISCORD_FILINGS_CHANNEL_ID,
    filings2ChannelId: process.env.DISCORD_FILINGS2_CHANNEL_ID,
    pollMs: Number(process.env.DISCORD_BOT_POLL_MS || 4000),
    startupBotId: process.env.DISCORD_BOT_ID || "local-bot"
  };

  if (!config.token) {
    throw new Error("Missing DISCORD_BOT_TOKEN in .env.local");
  }
  if (!config.guildId) {
    throw new Error("Missing DISCORD_GUILD_ID in .env.local");
  }
  if (!Number.isFinite(config.pollMs) || config.pollMs < 1000) {
    throw new Error("DISCORD_BOT_POLL_MS must be >= 1000");
  }

  return config;
}
