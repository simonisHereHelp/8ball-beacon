export type EnrichedRow = {
  ticket: string;
  name?: string;
  filer?: string;
  CIK: string; // may have leading zeros
  latest_closing?: string | null; // "YYYY-MM-DD"
  latest_form_found?: string | null;
  next_filing_type?: string | null; // "10-Q" or "10-K"
  next_SEC_filing_due?: string | null; // "YYYY-MM-DD"
  next_period_end?: string | null;
  note?: string;
};

type SecSubmissionsRecent = {
  form: string[];
  accessionNumber: string[];
  filingDate: string[];
  primaryDocument: string[];
  reportDate?: string[];
};

type SecSubmissions = {
  cik: string;
  filings?: { recent?: SecSubmissionsRecent };
};

function secHeaders() {
  const ua = process.env.SEC_USER_AGENT || "SECBeacon/0.1 (example@example.com)";
  return {
    "User-Agent": ua,
    "Accept-Encoding": "gzip, deflate, br",
    "Accept": "application/json"
  };
}

export function normalizeCik(cik: string): string {
  // SEC submissions endpoint uses zero-padded 10 digits
  const digits = cik.replace(/\D/g, "");
  return digits.padStart(10, "0");
}

export function accessionNoDashes(accession: string) {
  return accession.replace(/-/g, "");
}

export async function fetchSubmissionsByCik(cik10: string): Promise<SecSubmissions> {
  const url = `https://data.sec.gov/submissions/CIK${cik10}.json`;
  const res = await fetch(url, { headers: secHeaders() });
  if (!res.ok) throw new Error(`SEC submissions failed for ${cik10}: ${res.status}`);
  return (await res.json()) as SecSubmissions;
}

export type RecentFiling = {
  form: string;
  accession: string;
  filedAt: string;
  reportDate?: string;
  primaryDoc: string;
  secUrl: string;
};

export function pickNewest10Q10K(
  sub: SecSubmissions,
  includeAmendments: boolean
): RecentFiling | null {
  const r = sub.filings?.recent;
  if (!r) return null;

  const allowed = new Set(includeAmendments
    ? ["10-Q", "10-K", "10-Q/A", "10-K/A"]
    : ["10-Q", "10-K"]);

  for (let i = 0; i < r.form.length; i++) {
    const form = r.form[i];
    if (!allowed.has(form)) continue;

    const accession = r.accessionNumber[i];
    const filedAt = r.filingDate[i];
    const primaryDoc = r.primaryDocument[i];
    const reportDate = r.reportDate?.[i];

    // Build standard SEC Archives URL for the primary doc
    const cikNoLeadingZeros = String(Number(sub.cik)); // "0001652044" -> "1652044"
    const accNoDash = accessionNoDashes(accession);
    const secUrl = `https://www.sec.gov/Archives/edgar/data/${cikNoLeadingZeros}/${accNoDash}/${primaryDoc}`;

    return { form, accession, filedAt, reportDate, primaryDoc, secUrl };
  }
  return null;
}

export async function fetchFilingHtml(secUrl: string): Promise<string> {
  const res = await fetch(secUrl, {
    headers: {
      ...secHeaders(),
      "Accept": "text/html,application/xhtml+xml"
    }
  });
  if (!res.ok) throw new Error(`Fetch filing doc failed: ${res.status} ${secUrl}`);
  return await res.text();
}
