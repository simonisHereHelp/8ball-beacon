import { NextResponse } from "next/server";
import { addTickerToEnriched, removeTickerFromEnriched } from "@/lib/listingsHelper";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const ticker = searchParams.get("ticker")?.toUpperCase();

  if (!action || !ticker) {
    return NextResponse.json({ ok: false, message: "Missing action or ticker query param." }, { status: 400 });
  }

  if (action === "add") {
    const result = await addTickerToEnriched(ticker);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  if (action === "remove") {
    const result = removeTickerFromEnriched(ticker);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  return NextResponse.json({ ok: false, message: `Unsupported action: ${action}` }, { status: 400 });
}
