import { existsSync, readFileSync } from "node:fs";
import process from "node:process";

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
    apiBaseUrl: process.env.BEACON_API_BASE_URL || "http://127.0.0.1:3000",
    pollMs: Number(process.env.DISCORD_BOT_POLL_MS || 4000),
    startupBotId: process.env.DISCORD_BOT_ID || "local-bot"
  };

  if (!Number.isFinite(config.pollMs) || config.pollMs < 1000) {
    throw new Error("DISCORD_BOT_POLL_MS must be >= 1000");
  }

  return config;
}
