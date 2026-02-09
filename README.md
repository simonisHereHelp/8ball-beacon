SEC Beacon API service hosted at https://8ball-beacon.vercel.app.

## Architecture (short)
- Next.js 14 API route (`/api/poll`) runs the filing check logic.
- Enriched issuer metadata lives in `data/edgar_by_tickets_enriched.json` and is updated when new filings are detected.
- In-memory state plus persisted `data/state.json` tracks last-seen filings and recent events.

## API Endpoint
`GET https://8ball-beacon.vercel.app/api/poll`

The endpoint:
- Loads `data/edgar_by_tickets_enriched.json`.
- Fetches SEC submissions for each CIK.
- Compares latest filing dates vs `latest_closing`.
- Updates enriched data and emits Discord notifications for new filings.

## Export Endpoint (Discord)
`GET https://8ball-beacon.vercel.app/api/log`

Sends the text content of `state.json` and `edgar_by_tickets_enriched.json` to a secondary Discord webhook. Configure via `DISCORD_WEBHOOK_URL2`.

## Example Calls

### curl
```bash
curl -X GET "https://8ball-beacon.vercel.app/api/poll"
```

### Discord Bot (Node.js fetch)
```js
const res = await fetch("https://8ball-beacon.vercel.app/api/poll");
const data = await res.json();
console.log(data);
```



Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.
