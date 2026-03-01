import fs from "fs";
import path from "path";

const DEFAULT_DATA_DIR = path.join(process.cwd(), "data");
const DATA_DIR = process.env.DATA_DIR
  || (process.env.VERCEL ? path.join("/tmp", "8ball-beacon-data") : DEFAULT_DATA_DIR);
const STATE_PATH = path.join(DATA_DIR, "state.json");
export const FILINGS_DIR = path.join(DATA_DIR, "filings");

export type FilingEvent = {
  ticket: string;
  cik: string;
  form: string;
  accession: string;
  filedAt: string;
  period?: string;
  primaryDoc: string;
  secUrl: string;
  localHtmlPath?: string;
};

export type BotStatus = {
  latestScanRssFeed?: { date: string; timePst: string; summary: string };
  latestScanNewsFeed?: { date: string; timePst: string; summary: string };
  latestScanFinnFeed?: { date: string; timePst: string; summary: string };
  latestScanFinnFeeds?: { date: string; timePst: string; summary: string };
  latestScanMedFeed?: { date: string; timePst: string; summary: string };
  latestCikJson?: { date: string; timePst: string; summary: string };
};

export type NewsFeedsLog = {
  date: string;
  timePst: string;
  summary: string;
  feedUpdateTime: string;
};

export type NewsState = {
  seenNewsKeys: string[];
  feedUpdateTime?: string;
  latestNewsFeedsLog?: NewsFeedsLog;
  latestScanNewsFeed?: { date: string; timePst: string; summary: string };
};

export type FinnhubState = {
  seenNewsKeys: string[];
  feedUpdateTime?: string;
  latestScanFinnFeed?: { date: string; timePst: string; summary: string };
};

export type MedFeedsLog = {
  date: string;
  timePst: string;
  summary: string;
  feedUpdateTime: string;
};

export type MedState = {
  seenNewsKeys: string[];
  feedUpdateTime?: string;
  latestMedFeedsLog?: MedFeedsLog;
  latestScanMedFeed?: { date: string; timePst: string; summary: string };
};

export type StateLog = {
  latest: string;
  "SEC Edgar (atom):": string;
};

type State = {
  logs: StateLog[];
  botStatus: BotStatus;
  news?: NewsState;
  finnhub?: FinnhubState;
  med?: MedState;
};

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILINGS_DIR)) fs.mkdirSync(FILINGS_DIR, { recursive: true });
}

export function readState(): State {
  ensureDirs();
  if (!fs.existsSync(STATE_PATH)) {
    const init: State = { logs: [], botStatus: {} };
    fs.writeFileSync(STATE_PATH, JSON.stringify(init, null, 2), "utf-8");
    return init;
  }

  const raw = JSON.parse(fs.readFileSync(STATE_PATH, "utf-8")) as Record<string, unknown>;
  const logsRaw = Array.isArray(raw.logs) ? raw.logs : [];
  const logs = logsRaw.map((log) => {
    const record = (log && typeof log === "object") ? (log as Record<string, unknown>) : {};
    const latest = typeof record.latest === "string"
      ? record.latest
      : (typeof record.at === "string" ? record.at : new Date().toISOString());
    const atomSize = typeof record["SEC Edgar (atom):"] === "string"
      ? record["SEC Edgar (atom):"]
      : (typeof record.message === "string" ? record.message : "0k bytes");

    return {
      latest,
      "SEC Edgar (atom):": atomSize
    };
  });

  const botStatus = (raw.botStatus && typeof raw.botStatus === "object")
    ? raw.botStatus as BotStatus
    : {};

  const newsRaw = (raw.news && typeof raw.news === "object") ? raw.news as Record<string, unknown> : null;
  const seenNewsKeys = Array.isArray(newsRaw?.seenNewsKeys)
    ? newsRaw!.seenNewsKeys.filter((key): key is string => typeof key === "string")
    : [];
  const feedUpdateTime = typeof newsRaw?.feedUpdateTime === "string" ? newsRaw.feedUpdateTime : undefined;

  const latestNewsFeedsLogRaw = (newsRaw?.latestNewsFeedsLog && typeof newsRaw.latestNewsFeedsLog === "object")
    ? newsRaw.latestNewsFeedsLog as Record<string, unknown>
    : null;
  const latestNewsFeedsLog = latestNewsFeedsLogRaw
    ? {
      date: typeof latestNewsFeedsLogRaw.date === "string" ? latestNewsFeedsLogRaw.date : "",
      timePst: typeof latestNewsFeedsLogRaw.timePst === "string" ? latestNewsFeedsLogRaw.timePst : "",
      summary: typeof latestNewsFeedsLogRaw.summary === "string" ? latestNewsFeedsLogRaw.summary : "",
      feedUpdateTime: typeof latestNewsFeedsLogRaw.feedUpdateTime === "string"
        ? latestNewsFeedsLogRaw.feedUpdateTime
        : (feedUpdateTime || "")
    }
    : undefined;

  const latestScanNewsFeed = (newsRaw?.latestScanNewsFeed && typeof newsRaw.latestScanNewsFeed === "object")
    ? newsRaw.latestScanNewsFeed as NewsState["latestScanNewsFeed"]
    : undefined;

  const news = (seenNewsKeys.length > 0 || latestScanNewsFeed || latestNewsFeedsLog || feedUpdateTime)
    ? { seenNewsKeys, feedUpdateTime, latestNewsFeedsLog, latestScanNewsFeed }
    : undefined;

  const finnhubRaw = (raw.finnhub && typeof raw.finnhub === "object") ? raw.finnhub as Record<string, unknown> : null;
  const finnhubSeenNewsKeys = Array.isArray(finnhubRaw?.seenNewsKeys)
    ? finnhubRaw!.seenNewsKeys.filter((key): key is string => typeof key === "string")
    : [];
  const finnhubFeedUpdateTime = typeof finnhubRaw?.feedUpdateTime === "string" ? finnhubRaw.feedUpdateTime : undefined;
  const latestScanFinnFeed = (finnhubRaw?.latestScanFinnFeed && typeof finnhubRaw.latestScanFinnFeed === "object")
    ? finnhubRaw.latestScanFinnFeed as FinnhubState["latestScanFinnFeed"]
    : undefined;

  const finnhub = (finnhubSeenNewsKeys.length > 0 || latestScanFinnFeed || finnhubFeedUpdateTime)
    ? { seenNewsKeys: finnhubSeenNewsKeys, feedUpdateTime: finnhubFeedUpdateTime, latestScanFinnFeed }
    : undefined;

  const medRaw = (raw.med && typeof raw.med === "object") ? raw.med as Record<string, unknown> : null;
  const medSeenNewsKeys = Array.isArray(medRaw?.seenNewsKeys)
    ? medRaw!.seenNewsKeys.filter((key): key is string => typeof key === "string")
    : [];
  const medFeedUpdateTime = typeof medRaw?.feedUpdateTime === "string" ? medRaw.feedUpdateTime : undefined;

  const latestMedFeedsLogRaw = (medRaw?.latestMedFeedsLog && typeof medRaw.latestMedFeedsLog === "object")
    ? medRaw.latestMedFeedsLog as Record<string, unknown>
    : null;
  const latestMedFeedsLog = latestMedFeedsLogRaw
    ? {
      date: typeof latestMedFeedsLogRaw.date === "string" ? latestMedFeedsLogRaw.date : "",
      timePst: typeof latestMedFeedsLogRaw.timePst === "string" ? latestMedFeedsLogRaw.timePst : "",
      summary: typeof latestMedFeedsLogRaw.summary === "string" ? latestMedFeedsLogRaw.summary : "",
      feedUpdateTime: typeof latestMedFeedsLogRaw.feedUpdateTime === "string"
        ? latestMedFeedsLogRaw.feedUpdateTime
        : (medFeedUpdateTime || "")
    }
    : undefined;

  const latestScanMedFeed = (medRaw?.latestScanMedFeed && typeof medRaw.latestScanMedFeed === "object")
    ? medRaw.latestScanMedFeed as MedState["latestScanMedFeed"]
    : undefined;

  const med = (medSeenNewsKeys.length > 0 || latestScanMedFeed || latestMedFeedsLog || medFeedUpdateTime)
    ? { seenNewsKeys: medSeenNewsKeys, feedUpdateTime: medFeedUpdateTime, latestMedFeedsLog, latestScanMedFeed }
    : undefined;

  return { logs, botStatus, news, finnhub, med };
}

export function writeState(state: State) {
  ensureDirs();
  fs.writeFileSync(
    STATE_PATH,
    JSON.stringify({ logs: state.logs, botStatus: state.botStatus, news: state.news, finnhub: state.finnhub, med: state.med }, null, 2),
    "utf-8"
  );
}

export function saveFilingHtml(ticket: string, accession: string, html: string): string {
  ensureDirs();
  const dir = path.join(FILINGS_DIR, ticket, accession);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, "primary.html");
  fs.writeFileSync(filePath, html, "utf-8");
  return filePath;
}

export function listEvents(limit = 100): FilingEvent[] {
  void limit;
  return [];
}

export function listLogs(limit = 50): StateLog[] {
  const s = readState();
  return s.logs.slice(-limit);
}
