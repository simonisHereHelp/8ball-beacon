import fs from "fs";
import path from "path";
import type { EnrichedRow } from "./sec";

const DEFAULT_ENRICHED_PATH = path.join(process.cwd(), "data", "edgar_by_tickets_enriched.json");
const ENRICHED_PATH = process.env.ENRICHED_PATH
  || (process.env.VERCEL
    ? path.join("/tmp", "8ball-beacon-data", "edgar_by_tickets_enriched.json")
    : DEFAULT_ENRICHED_PATH);

function ensureEnrichedPath() {
  const dir = path.dirname(ENRICHED_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(ENRICHED_PATH) && ENRICHED_PATH !== DEFAULT_ENRICHED_PATH) {
    fs.copyFileSync(DEFAULT_ENRICHED_PATH, ENRICHED_PATH);
  }
}

export function readEnriched(): EnrichedRow[] {
  ensureEnrichedPath();
  const raw = fs.readFileSync(ENRICHED_PATH, "utf-8");
  return JSON.parse(raw) as EnrichedRow[];
}

export function writeEnriched(rows: EnrichedRow[]) {
  ensureEnrichedPath();
  fs.writeFileSync(ENRICHED_PATH, JSON.stringify(rows, null, 2), "utf-8");
}

function toUtcDate(value: string): Date {
  const isoLike = /^\d{4}-\d{2}-\d{2}$/;
  if (isoLike.test(value)) {
    return new Date(`${value}T00:00:00Z`);
  }
  const usLike = /^(\d{2})-(\d{2})-(\d{4})$/;
  const match = value.match(usLike);
  if (match) {
    const [, mm, dd, yyyy] = match;
    return new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`);
  }
  return new Date(value);
}

export function isNewerDate(candidate: string, baseline?: string | null): boolean {
  if (!baseline) return true;
  const candidateDate = toUtcDate(candidate);
  const baselineDate = toUtcDate(baseline);
  return candidateDate > baselineDate;
}
