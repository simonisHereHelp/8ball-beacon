async function postWebhook(url, content, name) {
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

export async function sendDiscord(content) {
  await postWebhook(process.env.DISCORD_WEBHOOK_URL, content, "DISCORD_WEBHOOK_URL");
}
