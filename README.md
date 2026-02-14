# 8ball Beacon (local Discord bot runner)

This project is a local Next.js API service plus a Discord polling bot.
The main runtime command is:

```bash
npm run bot:discord
```

## Local workflow

1. Start the Next.js API server locally (build/start or dev, your choice).
2. Run the bot process locally with `npm run bot:discord`.
3. Bot workflow (`app/bot.mjs`):
   - Sends startup state message: `Polling start: <botId> <frequency>`
   - Calls `/api/scan-rss-feed` every interval
   - Runs `/api/cik-json?cik=...` for matched CIKs
   - Sends polling state updates to Discord

## Environment

Create `.env.local`:

```bash
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
DISCORD_WEBHOOK_URL2=https://discord.com/api/webhooks/...
BEACON_API_BASE_URL=http://127.0.0.1:3000
DISCORD_BOT_POLL_MS=4000
DISCORD_BOT_ID=local-bot
```

## Key files

- `app/bot.mjs` – bot entrypoint
- `lib/bot/env.mjs` – env loading + config
- `lib/bot/apiClient.mjs` – API route caller
- `lib/bot/workflow.mjs` – polling workflow orchestration
- `app/api/*` – SEC scan / cik-json / log / filings routes
