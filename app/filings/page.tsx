import { listEvents } from "@/lib/storage";

export default function FilingsPage() {
  const events = listEvents(50);
  return <pre>{JSON.stringify({ count: events.length, events }, null, 2)}</pre>;
}
