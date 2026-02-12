# 8ball Beacon pilot guide (Discord-triggered local API control)

This repo runs a local SEC-filings beacon service and lets you trigger its API routes from Discord messages sent on your iPhone.

The control flow in this pilot:

1. You run `npm run dev` locally on your Windows notebook.
2. You run `npm run bot:discord` locally as a second process.
3. You send `scan`, `cik <CIK>`, or `log` in Discord `#filings` or `#filings2`.
4. The local bot sees the message and calls your local Beacon API (`http://127.0.0.1:3000/api/...`).

---

## 1) Discord server + bot setup

1. Open the [Discord Developer Portal](https://discord.com/developers/applications).
2. Create an application (for example, `sec-filings-control-bot`).
3. In **Bot**:
   - Add a bot user.
   - Copy the bot token (store as `DISCORD_BOT_TOKEN`).
   - Enable **Message Content Intent**.
4. In **OAuth2 → URL Generator**:
   - Scopes: `bot`
   - Bot permissions: `View Channels`, `Read Message History`, `Send Messages`.
5. Use generated URL to invite the bot to your SEC Filings Discord server.
6. In Discord settings (Developer Mode on), copy IDs for:
   - Server (guild) ID
   - `#filings` channel ID
   - `#filings2` channel ID

These are used to scope commands so only your SEC server/channels can control local APIs.

---

## 2) webhook2 setup for `#filings2`

Your `/api/log` route sends large JSON chunks to a secondary webhook (`DISCORD_WEBHOOK_URL2`).

1. In Discord, open channel settings for `#filings2`.
2. Go to **Integrations → Webhooks → New Webhook**.
3. Copy webhook URL and store it in `.env.local` as `DISCORD_WEBHOOK_URL2`.

If you also want filing scan alerts to post in `#filings`, configure `DISCORD_WEBHOOK_URL` similarly in that channel.

---

## 3) `.env.local` variables

Create `.env.local` in the project root:

```bash
# Existing Beacon webhook outputs
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
DISCORD_WEBHOOK_URL2=https://discord.com/api/webhooks/...

# New local control bot vars
DISCORD_BOT_TOKEN=YOUR_BOT_TOKEN
DISCORD_GUILD_ID=YOUR_SEC_FILINGS_SERVER_ID
DISCORD_FILINGS_CHANNEL_ID=CHANNEL_ID_FOR_FILINGS
DISCORD_FILINGS2_CHANNEL_ID=CHANNEL_ID_FOR_FILINGS2

# Optional (defaults to http://127.0.0.1:3000)
BEACON_API_BASE_URL=http://127.0.0.1:3000

# Optional polling interval in ms (defaults to 4000)
DISCORD_BOT_POLL_MS=4000
```

---

## 3A) How to obtain each bot config value (exactly)

Use this checklist to populate:

```js
token: process.env.DISCORD_BOT_TOKEN,
guildId: process.env.DISCORD_GUILD_ID,
allowedChannelNames: ["filings", "filings2"],
filingsChannelId: process.env.DISCORD_FILINGS_CHANNEL_ID,
filings2ChannelId: process.env.DISCORD_FILINGS2_CHANNEL_ID,
apiBaseUrl: process.env.BEACON_API_BASE_URL || "http://127.0.0.1:3000",
pollMs: Number(process.env.DISCORD_BOT_POLL_MS || 4000)
```

1. `DISCORD_BOT_TOKEN`
   - Discord Developer Portal → your application → **Bot**.
   - Click **Reset Token** (or **Copy** if available) and paste into `.env.local`.
   - Example:
     - `DISCORD_BOT_TOKEN=MTIz...`

2. `DISCORD_GUILD_ID`
   - In Discord app: **User Settings → Advanced → Developer Mode = ON**.
   - Right-click your SEC Filings server name → **Copy Server ID**.
   - Example:
     - `DISCORD_GUILD_ID=123456789012345678`

3. `DISCORD_FILINGS_CHANNEL_ID`
   - Right-click `#filings` channel → **Copy Channel ID**.
   - Example:
     - `DISCORD_FILINGS_CHANNEL_ID=234567890123456789`

4. `DISCORD_FILINGS2_CHANNEL_ID`
   - Right-click `#filings2` channel → **Copy Channel ID**.
   - Example:
     - `DISCORD_FILINGS2_CHANNEL_ID=345678901234567890`

5. `allowedChannelNames`
   - No env var required in this script; it is hardcoded to:
     - `["filings", "filings2"]`
   - If you rename channels, either update the IDs in `.env.local` (recommended) or edit the script names.

6. `BEACON_API_BASE_URL`
   - Local default: `http://127.0.0.1:3000`.
   - Keep default for local dev with `npm run dev`.
   - Set only if your Beacon API runs elsewhere.

7. `DISCORD_BOT_POLL_MS`
   - Optional interval in milliseconds.
   - Start with `4000` (4s), then tune to `2000-8000` as desired.

Quick sanity check:

```bash
cat .env.local
npm run dev
npm run bot:discord
```

Then send `help` in `#filings` or `#filings2` from iPhone. If the bot replies, config is correct.

---

## 4) Local run commands

Install and run locally:

```bash
npm install
npm run dev
```

In a second terminal:

```bash
npm run bot:discord
```

You should see startup logs indicating guild/channel scope and polling status.

---

## 5) iPhone manual trigger flow

From Discord on your iPhone, open the same SEC Filings server and send commands in `#filings` or `#filings2`.

### `scan`

Message:

```text
scan
```

Bot action:
- Calls `GET /api/scan-rss-feed`
- Replies with completion status

### `cik <CIK>`

Message:

```text
cik 0001018724
```

Bot action:
- Calls `GET /api/cik-json?cik=0001018724`
- Replies with completion status

### `log`

Message:

```text
log
```

Bot action:
- Calls `GET /api/log`
- `/api/log` posts chunked JSON payloads to `DISCORD_WEBHOOK_URL2` (`#filings2`)

### `help`

Message:

```text
help
```

Bot action:
- Replies with supported command list

---

## Command script

The local Discord controller lives at:

- `scripts/discord-control-bot.mjs`

`npm run bot:discord` runs this script as a dedicated local process next to `npm run dev`.
