function resolveApiUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  const port = process.env.PORT || "3000";
  return `http://127.0.0.1:${port}${path}`;
}

function logEvent(event, meta = undefined) {
  if (meta) {
    console.log(`[bot-api] ${new Date().toISOString()} ${event}`, meta);
    return;
  }
  console.log(`[bot-api] ${new Date().toISOString()} ${event}`);
}

export async function hitApi(path) {
  const url = resolveApiUrl(path);
  const startedAt = Date.now();
  logEvent("request:start", { path, url });

  const res = await fetch(url);
  const text = await res.text();

  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
    logEvent("response:parsed", { path, isJson: true });
  } catch {
    logEvent("response:parsed", { path, isJson: false });
  }

  const durationMs = Date.now() - startedAt;
  logEvent("request:done", {
    path,
    status: res.status,
    ok: res.ok,
    durationMs
  });

  if (!res.ok) {
    const preview = (typeof body === "string" ? body : JSON.stringify(body)).slice(0, 800);
    logEvent("request:error", {
      path,
      url,
      status: res.status,
      durationMs,
      preview
    });
    throw new Error(`API ${res.status}: ${preview}`);
  }

  logEvent("request:success", {
    path,
    durationMs,
    bodyType: typeof body
  });

  return body;
}
