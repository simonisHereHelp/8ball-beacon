export async function hitApi(path) {
  const res = await fetch(path);
  const text = await res.text();

  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // keep text body
  }

  if (!res.ok) {
    throw new Error(
      `API ${res.status}: ${(typeof body === "string" ? body : JSON.stringify(body)).slice(0, 800)}`
    );
  }

  return body;
}
