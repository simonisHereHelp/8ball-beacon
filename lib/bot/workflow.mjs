import { hitApi } from "./apiClient.mjs";

function getMatchedCiksFromScan(scanResponse) {
  const results = Array.isArray(scanResponse?.results) ? scanResponse.results : [];
  return results
    .filter((row) => row && typeof row.cik === "string" && (row.status === "NEW" || row.status === "no_change"))
    .map((row) => row.cik);
}

export async function runPollingCycle({ sendDiscord }) {
  const scanResponse = await hitApi("/api/scan-rss-feed");
  const ciks = [...new Set(getMatchedCiksFromScan(scanResponse))];

  let cikJsonCount = 0;
  for (const cik of ciks) {
    await hitApi(`/api/cik-json?cik=${encodeURIComponent(cik)}`);
    cikJsonCount += 1;
  }

  await sendDiscord(`Polling state: scan results=${Array.isArray(scanResponse?.results) ? scanResponse.results.length : 0}, cik-json=${cikJsonCount}`);

  return {
    scanCount: Array.isArray(scanResponse?.results) ? scanResponse.results.length : 0,
    cikJsonCount
  };
}
