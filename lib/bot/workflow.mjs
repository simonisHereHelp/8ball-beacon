import { hitApi } from "./apiClient.mjs";

const MIN_CYCLE = 0;
const MAX_CYCLE = 8;

let cycle = 0;
let direction = 1;

function advanceCycle() {
  if (cycle === MAX_CYCLE) {
    direction = -1;
  } else if (cycle === MIN_CYCLE) {
    direction = 1;
  }

  cycle += direction;
}

export async function runPollingCycle() {
  let medScanTriggered = false;
  let finnhubScanTriggered = false;

  if (cycle === 0) {
    await hitApi("/api/scan-med-feed");
    medScanTriggered = true;
  }

  if (cycle === 5) {
    await hitApi("/api/scan-finn-feed");
    finnhubScanTriggered = true;
  }

  const cycleNow = cycle;
  advanceCycle();

  return {
    cycleNow,
    nextCycle: cycle,
    direction,
    medScanTriggered,
    finnhubScanTriggered
  };
}
