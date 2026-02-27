import { hitApi } from "./apiClient.mjs";

let cycleCount = 0;

export async function runPollingCycle() {
  let finnhubScanTriggered = false;
  let newsScanTriggered = false;

  if (cycleCount === 0) {
    await hitApi("/api/scan-finn-feed");
    finnhubScanTriggered = true;
  } else if (cycleCount === 6) {
    await hitApi("/api/scan-news-feed");
    newsScanTriggered = true;
  }

  cycleCount = (cycleCount + 1) % 7;

  return {
    finnhubScanTriggered,
    newsScanTriggered
  };
}
