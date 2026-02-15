import { secHeaders } from "@/lib/sec";

export function formatPstTimestamp(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(date);
}

function isEasternDst(date: Date) {
  const year = date.getUTCFullYear();
  const march = new Date(Date.UTC(year, 2, 1));
  const secondSunday = 14 - march.getUTCDay();
  const dstStart = new Date(Date.UTC(year, 2, secondSunday, 7));

  const november = new Date(Date.UTC(year, 10, 1));
  const firstSunday = 7 - november.getUTCDay();
  const dstEnd = new Date(Date.UTC(year, 10, firstSunday, 6));

  return date >= dstStart && date < dstEnd;
}

export function formatAcceptedPst(acceptedAt?: string) {
  if (!acceptedAt) return null;
  const match = acceptedAt.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const baseUtc = new Date(Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  ));
  const offsetHours = isEasternDst(baseUtc) ? 4 : 5;
  return formatPstTimestamp(new Date(baseUtc.getTime() + offsetHours * 60 * 60 * 1000));
}

function extractTag(content: string, tag: string): string | null {
  const match = content.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match?.[1]?.trim() ?? null;
}

function extractCategoryTerm(content: string): string | null {
  const match = content.match(/<category[^>]*term="([^"]+)"[^>]*>/i);
  return match?.[1]?.trim() ?? null;
}

function extractCik(title: string): string | null {
  const match = title.match(/\((\d{10})\)/);
  return match?.[1] ?? null;
}

function extractAccession(entry: string, summary?: string | null): string | null {
  const linkMatch = entry.match(/<link[^>]*href="([^"]+)"[^>]*>/i);
  const href = linkMatch?.[1] || "";
  const hrefAccession = href.match(/\/(\d{10}-\d{2}-\d{6})-index\.htm/i)?.[1];
  if (hrefAccession) return hrefAccession;

  const summaryAccession = (summary || "").match(/AccNo:<\/b>\s*(\d{10}-\d{2}-\d{6})/i)?.[1];
  if (summaryAccession) return summaryAccession;

  return null;
}

export async function fetchRssEntries(formType: "10-Q" | "10-K") {
  const url = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&CIK=&type=${formType}&company=&dateb=&owner=include&start=0&count=100&output=atom`;
  const res = await fetch(url, {
    headers: {
      ...secHeaders(),
      Accept: "application/atom+xml, application/xml, text/xml"
    }
  });
  if (!res.ok) {
    throw new Error(`SEC RSS failed for ${formType}: ${res.status}`);
  }
  const xml = await res.text();
  const entries: Array<{ cik: string; form: string; updated?: string; accession?: string }> = [];

  const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
  let match: RegExpExecArray | null;
  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];
    const title = extractTag(entry, "title");
    if (!title) continue;
    const cik = extractCik(title);
    if (!cik) continue;
    const form = extractCategoryTerm(entry) || formType;
    const summary = extractTag(entry, "summary");
    entries.push({
      cik,
      form,
      updated: extractTag(entry, "updated") ?? undefined,
      accession: extractAccession(entry, summary) ?? undefined
    });
  }

  const atomBytes = Buffer.byteLength(xml, "utf8");
  return { entries, atomBytes };
}
