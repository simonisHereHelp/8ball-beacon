import { NextResponse } from "next/server";
import { listEvents } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ events: listEvents(100) });
}
