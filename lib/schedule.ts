import fs from "fs";
import path from "path";
import type { EnrichedRow } from "./sec";

const ENRICHED_PATH = path.join(process.cwd(), "data", "edgar_by_tickets_enriched.json");

export function loadEnriched(): EnrichedRow[] {
  const raw = fs.readFileSync(ENRICHED_PATH, "utf-8");
  const data = JSON.parse(raw) as EnrichedRow[];
  // Exclude non-standard issuers (null types/due)
  return data.filter(d => d.CIK && d.next_filing_type && d.next_SEC_filing_due);
}

export function isInWakeWindow(dueDateISO: string, daysBefore: number): boolean {
  // Wake window: from (due - daysBefore) through (due + 3 days)
  const due = new Date(`${dueDateISO}T00:00:00Z`);
  const start = new Date(due);
  start.setUTCDate(start.getUTCDate() - daysBefore);
  const end = new Date(due);
  end.setUTCDate(end.getUTCDate() + 3);

  const now = new Date();
  return now >= start && now <= end;
}

export function computePollIntervalMs(rows: EnrichedRow[]): number {
  const baseMin = Number(process.env.POLL_BASELINE_MINUTES || 60);
  const wakeMin = Number(process.env.POLL_WAKE_MINUTES || 10);
  const daysBefore = Number(process.env.WAKE_DAYS_BEFORE_DUE || 1);

  const anyWake = rows.some(r => r.next_SEC_filing_due && isInWakeWindow(r.next_SEC_filing_due, daysBefore));
  const minutes = anyWake ? wakeMin : baseMin;
  return minutes * 60_000;
}

export type PollMode = "base" | "wake";

export function isWakeWindow(dueISO: string, daysBefore = 1): boolean {
  const due = new Date(`${dueISO}T00:00:00Z`);
  const start = new Date(due);
  start.setUTCDate(start.getUTCDate() - daysBefore);

  const end = new Date(due);
  end.setUTCDate(end.getUTCDate() + 3);

  const now = new Date();
  return now >= start && now <= end;
}

export function computePollMode(rows: Array<{ next_SEC_filing_due?: string | null }>): PollMode {
  const daysBefore = Number(process.env.WAKE_DAYS_BEFORE_DUE || 1);
  const anyWake = rows.some(r => r.next_SEC_filing_due && isWakeWindow(r.next_SEC_filing_due, daysBefore));
  return anyWake ? "wake" : "base";
}
