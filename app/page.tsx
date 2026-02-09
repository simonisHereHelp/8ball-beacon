import { listLogs } from "@/lib/storage";

function formatLogLine(at: string, message: string) {
  const date = new Date(at);
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  }).format(date);
  return `${formatted} PST: ${message}`;
}

export default function Home() {
  const logs = listLogs(10).map(entry => formatLogLine(entry.at, entry.message));
  return (
    <main style={{ padding: 16, fontFamily: "system-ui" }}>
      <h1>SEC Beacon</h1>
      <p>Beacon is on....</p>
      <h2>Server log</h2>
      <ul>
        {logs.length === 0 ? (
          <li>No logs yet.</li>
        ) : (
          logs.map(line => <li key={line}>{line}</li>)
        )}
      </ul>
    </main>
  );
}
