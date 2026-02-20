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
DISCORD_WEBHOOK_URL_NEWS=https://discord.com/api/webhooks/...
DISCORD_BOT_TOKEN=YOUR_BOT_TOKEN
DISCORD_GUILD_ID=YOUR_GUILD_ID
DISCORD_FILINGS_CHANNEL_ID=YOUR_FILINGS_CHANNEL_ID
DISCORD_FILINGS2_CHANNEL_ID=YOUR_FILINGS2_CHANNEL_ID
DISCORD_NEWS_CHANNEL_ID=YOUR_NEWS_CHANNEL_ID
DISCORD_BOT_POLL_MS=4000
FINNHUB_API_KEY=YOUR_FINNHUB_API_KEY
```

2. Keep API running in terminal A, then run bot in terminal B.

Bot notifications are intentionally quiet: no per-poll scan/cik status messages are sent to Discord.

News Poll = 4 x BOT_POLL_MS

## Channel command listener (`#filings`)

The bot listens to incoming messages in `#filings` (case-insensitive):

- `status` / `state` / `log` => runs `/api/log`
- `earning call` / `earning event` / `earning calendar` => runs `/api/next-earning-call`
- `help` / `how to` => sends help text to Discord

## New earnings calendar route

### `GET /api/next-earning-call`

- Reads every ticker from enriched data (`ticket`, with fallback support for `ticker` key variants).
- Calls Finnhub earnings calendar once per ticker (`from` today -5 days to `to` +120 days).
- De-duplicates events and sorts by date.
- Fetches latest current EPS per ticker (Finnhub `stock/metric` `epsTTM`) and includes it in event output.
- Includes `Estimated EPS` and `Actual` status/value from Finnhub calendar data in the Discord summary (e.g., `Actual: Available YYYY-MM-DD, Pre-Market` or `Actual: $0.74 per share`).
- Posts a summary to the **news** channel webhook (`DISCORD_WEBHOOK_URL_NEWS`, with existing webhook fallbacks).
- Returns JSON with coverage fields:
  - `tickersRequested`
  - `tickersProcessed`
  - `processedTickers`
  - `currentEpsByTicker`
  - `events`
  - `errors`

If `FINNHUB_API_KEY` is missing, the route returns HTTP `500` with a JSON error.

## State tracking

`state.json` tracks latest bot API summaries in `botStatus`:

- `latestScanRssFeed`: date, `HH:MM:SS` PST time, summary
- `latestCikJson`: date, `HH:MM:SS` PST time, summary
- `logs[0]`: `{ latest, "SEC Edgar (atom):" }` based on scan-rss-feed response size

`/api/log` sends both `state.json` and `enriched.json` to `DISCORD_WEBHOOK_URL2`.

## Key files

- `app/bot.mjs` – bot entrypoint
- `lib/bot/env.mjs` – env loading + bot config
- `lib/bot/discordApi.mjs` – Discord API helpers (identity + channel scope)
- `lib/bot/apiClient.mjs` – API route caller
- `lib/bot/workflow.mjs` – polling workflow orchestration
- `app/api/next-earning-call/route.ts` – earnings calendar aggregation route
- `app/api/*` – SEC scan / cik-json / log / filings routes

## Example SEC RSS Atom

https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&CIK=&type=10-Q&company=&dateb=&owner=include&start=0&count=100&output=atom

### Notes (short)

- Simple `state.json`, complete `enriched.json`.
- New listing rule: if `RSS.accession` <> `enrichedJson.accession`, treat as a new listing.
