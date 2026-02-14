# 8ball Beacon Bot (local)

Run the bot with:

```bash
npm run bot
```

## Quick setup

1. Start Next.js API locally (`npm run dev` or `npm run start`).
2. Add `.env.local`:

```bash
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
DISCORD_BOT_TOKEN=YOUR_BOT_TOKEN
DISCORD_GUILD_ID=YOUR_GUILD_ID
DISCORD_FILINGS_CHANNEL_ID=YOUR_FILINGS_CHANNEL_ID
DISCORD_FILINGS2_CHANNEL_ID=YOUR_FILINGS2_CHANNEL_ID
DISCORD_BOT_POLL_MS=4000
```

3. Run bot process:

```bash
npm run bot
```

Bot file: `app/bot.mjs`.


The bot calls local API routes at `http://127.0.0.1:3000` by default (or `PORT` if set).

## Key files

- `app/bot.mjs` – bot entrypoint
- `lib/bot/env.mjs` – env loading + bot config
- `lib/bot/discordApi.mjs` – Discord API helpers (identity + channel scope)
- `lib/bot/apiClient.mjs` – API route caller
- `lib/bot/workflow.mjs` – polling workflow orchestration
- `app/api/*` – SEC scan / cik-json / log / filings routes
