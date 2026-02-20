import { hitApi } from "./apiClient.mjs";

let cycleCount = 0;

export async function runPollingCycle() {
  cycleCount += 1;

  let newsScanTriggered = false;
  if (cycleCount % 4 === 0) {
    await hitApi("/api/scan-news-feed");
    newsScanTriggered = true;
  }

  return {
    newsScanTriggered
  };
}
