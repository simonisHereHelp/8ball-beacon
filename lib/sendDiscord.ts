async function postWebhook(url: string | undefined, content: string, name: string) {
  if (!url) throw new Error(`Missing ${name}`);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content })
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Discord webhook failed: ${res.status} ${txt}`);
  }
}

export async function sendDiscord(content: string) {
  await postWebhook(process.env.DISCORD_WEBHOOK_URL, content, "DISCORD_WEBHOOK_URL");
}

export async function sendDiscordSecondary(content: string) {
  const url = process.env.DISCORD_WEBHOOK_URL2 || process.env.DISCORD_WEBHOOK_URL;
  await postWebhook(url, content, "DISCORD_WEBHOOK_URL (or DISCORD_WEBHOOK_URL2)");
}

export async function sendDiscordNews(content: string) {
  const url = process.env.DISCORD_WEBHOOK_URL_NEWS || process.env.DISCORD_WEBHOOK_URL2 || process.env.DISCORD_WEBHOOK_URL;
  await postWebhook(url, content, "DISCORD_WEBHOOK_URL_NEWS (or DISCORD_WEBHOOK_URL2 / DISCORD_WEBHOOK_URL)");
}


export async function sendDiscordToChannelId(channelId: string, content: string) {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error("Missing DISCORD_BOT_TOKEN");
  if (!channelId) throw new Error("Missing channelId");

  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ content })
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Discord channel post failed: ${res.status} ${txt}`);
  }
}
