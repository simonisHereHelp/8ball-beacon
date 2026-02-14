import fs from "node:fs";
import path from "node:path";

export default async function FilingPage({
  params
}: {
  params: Promise<{ ticker: string; accession: string }>;
}) {
  const { ticker, accession } = await params;
  const filePath = path.join(process.cwd(), "data", "filings", ticker, accession, "primary.html");

  if (!fs.existsSync(filePath)) {
    return <pre>{JSON.stringify({ ok: false, ticker, accession, error: "not_found" }, null, 2)}</pre>;
  }

  const html = fs.readFileSync(filePath, "utf-8");
  return <pre>{JSON.stringify({ ok: true, ticker, accession, size: html.length }, null, 2)}</pre>;
}
