# 8ball Beacon (local Discord bot runner)

This project is a local Next.js API service plus a Discord polling bot.
The main runtime command is:

```bash
npm run bot:discord
```

## Local workflow

1. Start the Next.js API server locally.
2. Run the bot process locally with `npm run bot:discord`.
3. Bot workflow (`app/bot.mjs`):
   - Sends startup state message: `Polling start: <botId> <frequency>`
   - Calls `/api/scan-rss-feed` every interval
   - Runs `/api/cik-json?cik=...` for matched CIKs
   - Sends polling state updates to Discord

## Discord bot configuration

The bot config is defined in `lib/bot/env.mjs` via `getBotConfig()` and includes:

- `token: process.env.DISCORD_BOT_TOKEN`
- `guildId: process.env.DISCORD_GUILD_ID`
- `allowedChannelNames: ["filings", "filings2"]` (or `DISCORD_ALLOWED_CHANNEL_NAMES`)
- `filingsChannelId: process.env.DISCORD_FILINGS_CHANNEL_ID`
- `filings2ChannelId: process.env.DISCORD_FILINGS2_CHANNEL_ID`

## Environment

Create `.env.local`:

```bash
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
DISCORD_WEBHOOK_URL2=https://discord.com/api/webhooks/...

DISCORD_BOT_TOKEN=YOUR_BOT_TOKEN
DISCORD_GUILD_ID=YOUR_GUILD_ID
DISCORD_FILINGS_CHANNEL_ID=YOUR_FILINGS_CHANNEL_ID
DISCORD_FILINGS2_CHANNEL_ID=YOUR_FILINGS2_CHANNEL_ID
# Optional CSV override (defaults to filings,filings2)
DISCORD_ALLOWED_CHANNEL_NAMES=filings,filings2

BEACON_API_BASE_URL=http://127.0.0.1:3000
DISCORD_BOT_POLL_MS=4000
DISCORD_BOT_ID=local-bot
```

## Key files

- `app/bot.mjs` – bot entrypoint
- `lib/bot/env.mjs` – env loading + bot config
- `lib/bot/discordApi.mjs` – Discord API helpers (identity + channel scope)
- `lib/bot/apiClient.mjs` – API route caller
- `lib/bot/workflow.mjs` – polling workflow orchestration
- `app/api/*` – SEC scan / cik-json / log / filings routes
