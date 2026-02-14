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
