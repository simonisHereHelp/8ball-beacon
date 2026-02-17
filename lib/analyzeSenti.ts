export type Sentiment = "BULL" | "BEAR" | "na";

export async function analyzeSenti(ticker: string, title: string, summary: string): Promise<Sentiment> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return "na";

  const payload = {
    model: process.env.OPENAI_NEWS_MODEL || "gpt-5",
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: "Classify market sentiment for one news item. Return only one token: BULL, BEAR, or na." }]
      },
      {
        role: "user",
        content: [{ type: "input_text", text: JSON.stringify({ ticker, title, summary }) }]
      }
    ]
  };

  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) return "na";
    const json = await res.json() as { output_text?: string };
    const out = String(json.output_text || "na").trim().toUpperCase();
    if (out.includes("BULL")) return "BULL";
    if (out.includes("BEAR")) return "BEAR";
    return "na";
  } catch {
    return "na";
  }
}
