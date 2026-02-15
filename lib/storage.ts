import fs from "fs";
import path from "path";

const DEFAULT_DATA_DIR = path.join(process.cwd(), "data");
const DATA_DIR = process.env.DATA_DIR
  || (process.env.VERCEL ? path.join("/tmp", "8ball-beacon-data") : DEFAULT_DATA_DIR);
const STATE_PATH = path.join(DATA_DIR, "state.json");
export const FILINGS_DIR = path.join(DATA_DIR, "filings");

export type FilingEvent = {
  ticket: string;
  cik: string;
  form: string;
  accession: string;
  filedAt: string; // YYYY-MM-DD
  primaryDoc: string;
  secUrl: string;
  localHtmlPath?: string;
};

export type BotStatus = {
  latestScanRssFeed?: { date: string; timePst: string; summary: string };
  latestCikJson?: { date: string; timePst: string; summary: string };
};

export type StateLog = {
  latest: string;
  "SEC Edgar (atom):": string;
};

type State = {
  lastSeenByCik: Record<string, string>; // cik -> accession
  events: FilingEvent[];                // newest first
  logs: StateLog[];
  botStatus: BotStatus;
};

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILINGS_DIR)) fs.mkdirSync(FILINGS_DIR, { recursive: true });
}

export function readState(): State {
  ensureDirs();
  if (!fs.existsSync(STATE_PATH)) {
    const init: State = { lastSeenByCik: {}, events: [], logs: [], botStatus: {} };
    fs.writeFileSync(STATE_PATH, JSON.stringify(init, null, 2), "utf-8");
    return init;
  }
  const state = JSON.parse(fs.readFileSync(STATE_PATH, "utf-8")) as State;
  state.logs = (state.logs ?? []).map((log: unknown) => {
    const record = (log && typeof log === "object") ? (log as Record<string, unknown>) : {};
    const latest = typeof record.latest === "string"
      ? record.latest
      : (typeof record.at === "string" ? record.at : new Date().toISOString());
    const atomSize = typeof record["SEC Edgar (atom):"] === "string"
      ? record["SEC Edgar (atom):"]
      : (typeof record.message === "string" ? record.message : "0k bytes");

    return {
      latest,
      "SEC Edgar (atom):": atomSize
    };
  });
  state.events = state.events ?? [];
  state.lastSeenByCik = state.lastSeenByCik ?? {};
  state.botStatus = state.botStatus ?? {};
  return state;
}

export function writeState(state: State) {
  ensureDirs();
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf-8");
}

export function saveFilingHtml(ticket: string, accession: string, html: string): string {
  ensureDirs();
  const dir = path.join(FILINGS_DIR, ticket, accession);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, "primary.html");
  fs.writeFileSync(filePath, html, "utf-8");
  return filePath;
}

export function listEvents(limit = 100): FilingEvent[] {
  const s = readState();
  return s.events.slice(0, limit);
}

export function listLogs(limit = 50): StateLog[] {
  const s = readState();
  return s.logs.slice(-limit);
}
