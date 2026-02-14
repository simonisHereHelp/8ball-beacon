function resolveApiUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  const port = process.env.PORT || "3000";
  return `http://127.0.0.1:${port}${path}`;
}

function isDebugEnabled() {
  return (process.env.BOT_DEBUG || "false").toLowerCase() === "true";
}

function debugLog(message, meta = undefined) {
  if (!isDebugEnabled()) return;
  if (meta) {
    console.log(`[bot-api] ${new Date().toISOString()} ${message}`, meta);
    return;
  }
  console.log(`[bot-api] ${new Date().toISOString()} ${message}`);
}

export async function hitApi(path) {
  const url = resolveApiUrl(path);
  const startedAt = Date.now();

  debugLog("request:start", { path, url });

  const res = await fetch(url);
  const text = await res.text();

  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // keep text body
  }

  const durationMs = Date.now() - startedAt;
  debugLog("request:done", {
    path,
    status: res.status,
    ok: res.ok,
    durationMs
  });

  if (!res.ok) {
    const preview = (typeof body === "string" ? body : JSON.stringify(body)).slice(0, 800);
    console.error(`[bot-api] ${new Date().toISOString()} request:error`, {
      path,
      url,
      status: res.status,
      durationMs,
      preview
    });
    throw new Error(`API ${res.status}: ${preview}`);
  }

  return body;
}
