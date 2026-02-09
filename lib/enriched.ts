import fs from "fs";
import path from "path";
import type { EnrichedRow } from "./sec";

const ENRICHED_PATH = path.join(process.cwd(), "data", "edgar_by_tickets_enriched.json");

export function readEnriched(): EnrichedRow[] {
  const raw = fs.readFileSync(ENRICHED_PATH, "utf-8");
  return JSON.parse(raw) as EnrichedRow[];
}

export function writeEnriched(rows: EnrichedRow[]) {
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
