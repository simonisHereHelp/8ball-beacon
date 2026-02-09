import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
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

type State = {
  lastSeenByCik: Record<string, string>; // cik -> accession
  events: FilingEvent[];                // newest first
};

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILINGS_DIR)) fs.mkdirSync(FILINGS_DIR, { recursive: true });
}

export function readState(): State {
  ensureDirs();
  if (!fs.existsSync(STATE_PATH)) {
    const init: State = { lastSeenByCik: {}, events: [] };
    fs.writeFileSync(STATE_PATH, JSON.stringify(init, null, 2), "utf-8");
    return init;
  }
  return JSON.parse(fs.readFileSync(STATE_PATH, "utf-8")) as State;
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
