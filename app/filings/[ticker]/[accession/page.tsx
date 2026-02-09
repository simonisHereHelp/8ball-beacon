import fs from "fs";
import path from "path";

export default async function FilingPage({
  params
}: {
  params: Promise<{ ticker: string; accession: string }>;
}) {
  const { ticker, accession } = await params;
  const p = path.join(process.cwd(), "data", "filings", ticker, accession, "primary.html");

  if (!fs.existsSync(p)) {
    return <main style={{ padding: 16 }}>Not found: {ticker} {accession}</main>;
  }

  const html = fs.readFileSync(p, "utf-8");

  return (
    <main style={{ padding: 0, margin: 0 }}>
      <div style={{ padding: 12, fontFamily: "system-ui" }}>
        <a href="/">← Back</a>
        <h2 style={{ margin: "10px 0" }}>{ticker} — {accession}</h2>
      </div>

      <iframe
        srcDoc={html}
        style={{ width: "100%", height: "85vh", border: "0" }}
        sandbox="allow-same-origin allow-forms allow-popups allow-scripts"
      />
    </main>
  );
}
