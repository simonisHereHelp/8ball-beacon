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
  await postWebhook(process.env.DISCORD_WEBHOOK_URL2, content, "DISCORD_WEBHOOK_URL2");
}
