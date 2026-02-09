export default async function Home() {
  const res = await fetch("http://localhost:3000/api/filings", { cache: "no-store" });
  const data = await res.json();

  return (
    <main style={{ padding: 16, fontFamily: "system-ui" }}>
      <h1>SEC Beacon</h1>

      <form action="/api/poll" method="post" style={{ margin: "12px 0" }}>
        <button type="submit">Poll now</button>
      </form>

      <h2>Recent filings</h2>
      <ul>
        {data.events.map((e: any) => (
          <li key={`${e.cik}-${e.accession}`} style={{ marginBottom: 10 }}>
            <b>{e.ticket}</b> {e.form} — {e.filedAt} —{" "}
            <a href={`/filings/${e.ticket}/${encodeURIComponent(e.accession)}`}>view</a>{" "}
            | <a href={e.secUrl} target="_blank" rel="noreferrer">SEC</a>
          </li>
        ))}
      </ul>
    </main>
  );
}
