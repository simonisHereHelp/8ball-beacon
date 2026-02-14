# 8ball Beacon Bot (local)

## Run sequence (recommended)

Use two terminals:

1. **Terminal A**: start API server

```bash
npm run dev
```

2. **Terminal B**: start bot

```bash
npm run bot
```

> `npm run dev` is the recommended local mode.

## Quick setup

1. Add `.env.local`:

```bash
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
DISCORD_WEBHOOK_URL2=https://discord.com/api/webhooks/...
DISCORD_BOT_TOKEN=YOUR_BOT_TOKEN
DISCORD_GUILD_ID=YOUR_GUILD_ID
DISCORD_FILINGS_CHANNEL_ID=YOUR_FILINGS_CHANNEL_ID
DISCORD_FILINGS2_CHANNEL_ID=YOUR_FILINGS2_CHANNEL_ID
DISCORD_BOT_POLL_MS=4000
```

2. Keep API running in terminal A, then run bot in terminal B.

## State tracking

`state.json` now tracks latest bot API summaries in `botStatus`:

- `latestScanRssFeed`: date, `HH:MM:SS` PST time, summary
- `latestCikJson`: date, `HH:MM:SS` PST time, summary

`/api/log` sends both `state.json` and `enriched.json` to `DISCORD_WEBHOOK_URL2`.

## Key files

- `app/bot.mjs` – bot entrypoint
- `lib/bot/env.mjs` – env loading + bot config
- `lib/bot/discordApi.mjs` – Discord API helpers (identity + channel scope)
- `lib/bot/apiClient.mjs` – API route caller
- `lib/bot/workflow.mjs` – polling workflow orchestration
- `app/api/*` – SEC scan / cik-json / log / filings routes
