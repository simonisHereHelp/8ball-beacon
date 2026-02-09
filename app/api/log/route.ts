import { NextResponse } from "next/server";
import { readState, writeState } from "@/lib/storage";
import { readEnriched } from "@/lib/enriched";
import { sendDiscordSecondary } from "@/lib/discord";

export const runtime = "nodejs";

const DISCORD_LIMIT = 1900;

function chunkContent(text: string, size = DISCORD_LIMIT): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

async function sendJsonPayload(label: string, jsonText: string) {
  const header = `${label}:\n\`\`\`json\n`;
  const footer = "\n```";
  const available = DISCORD_LIMIT - header.length - footer.length;
  const parts = chunkContent(jsonText, available);
  for (const part of parts) {
    await sendDiscordSecondary(`${header}${part}${footer}`);
  }
}

export async function GET() {
  const state = readState();
  state.logs.push({ at: new Date().toISOString(), message: "GET api/log...." });
  writeState(state);
  const enriched = readEnriched();

  const stateText = JSON.stringify(state, null, 2);
  const enrichedText = JSON.stringify(enriched, null, 2);

  await sendJsonPayload("state.json", stateText);
  await sendJsonPayload("edgar_by_tickets_enriched.json", enrichedText);

  return NextResponse.json({ ok: true });
}
