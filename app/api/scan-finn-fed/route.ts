import { GET as scanFinnFeedGet } from "@/app/api/scan-finn-feed/route";

export const runtime = "nodejs";

export async function GET() {
  return await scanFinnFeedGet();
}
