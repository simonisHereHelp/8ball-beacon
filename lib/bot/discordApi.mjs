const DISCORD_API_BASE = "https://discord.com/api/v10";

function getAuthHeaders(token) {
  return {
    Authorization: `Bot ${token}`,
    "Content-Type": "application/json"
  };
}

export async function discordRequest(token, path) {
  const res = await fetch(`${DISCORD_API_BASE}${path}`, {
    headers: getAuthHeaders(token)
  });

  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text || null;
  }

  if (!res.ok) {
    throw new Error(`Discord API ${res.status}: ${String(text).slice(0, 400)}`);
  }

  return body;
}

export async function fetchBotIdentity(token) {
  const me = await discordRequest(token, "/users/@me");
  return {
    id: me?.id || null,
    username: me?.username || null
  };
}

export async function resolveTrackedChannels(config) {
  const known = [config.filingsChannelId, config.filings2ChannelId].filter(Boolean);
  if (known.length > 0) return known;

  const channels = await discordRequest(config.token, `/guilds/${config.guildId}/channels`);
  if (!Array.isArray(channels)) return [];

  return channels
    .filter((channel) => config.allowedChannelNames.includes(channel?.name))
    .map((channel) => channel.id)
    .filter(Boolean);
}
