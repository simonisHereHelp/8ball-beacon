import { hitApi } from "./apiClient.mjs";

let cycleCount = 0;

export async function runPollingCycle() {
  let newsScanTriggered = false;
  if (cycleCount % 4 === 0) {
    await hitApi("/api/scan-news-feed");
    newsScanTriggered = true;
  }

  cycleCount += 1;

  return {
    newsScanTriggered
  };
}
