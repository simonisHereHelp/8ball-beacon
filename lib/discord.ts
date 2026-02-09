export async function sendDiscord(content: string) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) throw new Error("Missing DISCORD_WEBHOOK_URL");

  // Same structure as your curl: {"content":"..."}
  const payload = { content };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Discord webhook failed: ${res.status} ${txt}`);
  }
}

export async function sendDiscordSecondary(content: string) {
  const url = process.env.DISCORD_WEBHOOK_URL2;
  if (!url) throw new Error("Missing DISCORD_WEBHOOK_URL2");

  const payload = { content };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Discord webhook failed: ${res.status} ${txt}`);
  }
}
