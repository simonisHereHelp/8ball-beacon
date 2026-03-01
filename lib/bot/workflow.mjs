import { hitApi } from "./apiClient.mjs";

const MIN_COUNTER = 0;
const MAX_COUNTER = 5;

let counter = 0;
let direction = 1;

function advanceCounter() {
  if (counter === MAX_COUNTER) {
    direction = -1;
  } else if (counter === MIN_COUNTER) {
    direction = 1;
  }

  counter += direction;
}

export async function runPollingCycle() {
  const counterNow = counter;
  let path = null;

  if (counterNow === 0) {
    path = "/api/scan-med-feed";
    await hitApi(path);
  } else if (counterNow === 5) {
    path = "/api/scan-finn-fed";
    await hitApi(path);
  }

  advanceCounter();

  return {
    counterNow,
    nextCounter: counter,
    direction,
    path
  };
}
