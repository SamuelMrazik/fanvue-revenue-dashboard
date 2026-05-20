const DEFAULT_TIMEOUT_MS = 15000;

const METRIC_ALIASES = {
  revenueCents: {
    cents: ["revenue_cents", "revenuecents", "earnings_cents", "earningscents", "total_revenue_cents", "net_revenue_cents"],
    money: ["revenue", "earnings", "total_revenue", "net_revenue", "gross_revenue", "sales"]
  },
  subscribers: ["subscribers", "subscriber_count", "subscribercount", "active_subscribers", "activesubscribers", "fans", "fan_count"],
  messages: ["messages", "message_count", "messagecount", "paid_messages", "paidmessages", "unlocked_messages", "unlockedmessages"],
  tipsCents: {
    cents: ["tips_cents", "tipscents", "tip_amount_cents", "tipamountcents"],
    money: ["tips", "tip_amount", "tipamount", "total_tips"]
  },
  clicks: ["clicks", "click_count", "clickcount", "profile_clicks", "profileclicks", "link_clicks", "linkclicks"]
};

export async function fetchFanvueMetrics(model, options = {}) {
  const url = buildMetricsUrl(model.apiBaseUrl, model.endpointPath);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: buildHeaders(model.apiToken, url),
      signal: controller.signal
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API returned ${response.status} ${response.statusText}: ${text.slice(0, 240)}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw new Error(`API returned ${contentType || "unknown content type"} instead of JSON.`);
    }

    const payload = await response.json();
    const metrics = normalizeMetrics(payload);
    return { metrics, raw: payload };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`API request timed out after ${options.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function buildMetricsUrl(apiBaseUrl, endpointPath = "/insights/earnings/summary") {
  if (!apiBaseUrl || typeof apiBaseUrl !== "string") {
    throw new Error("API base URL is required.");
  }

  const base = apiBaseUrl.endsWith("/") ? apiBaseUrl : `${apiBaseUrl}/`;
  const path = endpointPath.startsWith("/") ? endpointPath.slice(1) : endpointPath;
  return new URL(path || "", base).toString();
}

export function normalizeMetrics(payload) {
  const source = payload?.metrics ?? payload?.data?.metrics ?? payload?.data ?? payload;
  const fanvueSummary = normalizeFanvueEarningsSummary(payload);
  if (fanvueSummary) return fanvueSummary;

  const fanvueEarnings = normalizeFanvueEarningsList(payload);
  if (fanvueEarnings) return fanvueEarnings;

  const revenueCents = findMoneyValue(source, METRIC_ALIASES.revenueCents);
  const tipsCents = findMoneyValue(source, METRIC_ALIASES.tipsCents);
  const subscribers = findNumberValue(source, METRIC_ALIASES.subscribers);
  const messages = findNumberValue(source, METRIC_ALIASES.messages);
  const clicks = findNumberValue(source, METRIC_ALIASES.clicks);
  const currency = findStringValue(source, ["currency", "currency_code", "currencycode"]) || "USD";
  const sourceTimestamp = findStringValue(source, ["timestamp", "captured_at", "capturedat", "date", "created_at", "createdat"]);

  if ([revenueCents, tipsCents, subscribers, messages, clicks].every((value) => value === null)) {
    throw new Error("API response did not contain recognizable tracking metrics.");
  }

  return {
    revenueCents: revenueCents ?? 0,
    subscribers: subscribers ?? 0,
    messages: messages ?? 0,
    tipsCents: tipsCents ?? 0,
    clicks: clicks ?? 0,
    currency,
    sourceTimestamp
  };
}

function normalizeFanvueEarningsSummary(payload) {
  const allTime = payload?.totals?.allTime;
  if (!allTime || typeof allTime !== "object") return null;

  const grossRevenueCents = moneyObjectGrossValue(allTime);
  const fanvueNetCents = moneyObjectNetValue(allTime) ?? grossRevenueCents;
  const revenueCents = fanvueNetCents ?? grossRevenueCents;
  if (revenueCents === null) return null;

  const breakdown = payload.breakdownBySource || {};
  const earningsByType = payload.earningsByType || {};
  const overTime = Array.isArray(payload.overTime) ? payload.overTime : [];
  const latestPeriod = overTime.at(-1);

  return {
    revenueCents,
    grossRevenueCents: grossRevenueCents ?? revenueCents,
    fanvueNetCents: revenueCents,
    fanvueFeeCents: Math.max((grossRevenueCents ?? revenueCents) - revenueCents, 0),
    subscribers: 0,
    messages: 0,
    subscriptionRevenueCents: moneyObjectValue(breakdown.subs || earningsByType.subs) ?? 0,
    renewalRevenueCents: moneyObjectValue(breakdown.renewals || earningsByType.renewals) ?? 0,
    messageRevenueCents: moneyObjectValue(breakdown.messages || earningsByType.messages) ?? 0,
    postRevenueCents: moneyObjectValue(breakdown.posts || earningsByType.posts) ?? 0,
    tipsCents: moneyObjectValue(breakdown.tips || earningsByType.tips) ?? 0,
    referralRevenueCents: moneyObjectValue(breakdown.referrals || earningsByType.referrals) ?? 0,
    otherRevenueCents: moneyObjectValue(breakdown.other || earningsByType.other) ?? 0,
    dailyEarnings: overTime.map((period) => ({
      date: period.periodStart || period.date || null,
      grossRevenueCents: moneyObjectGrossValue(period) ?? moneyObjectValue(period) ?? 0,
      fanvueNetCents: moneyObjectNetValue(period) ?? moneyObjectValue(period) ?? 0
    })).filter((period) => period.date),
    clicks: 0,
    currency: findStringValue(payload, ["currency", "currency_code", "currencycode"]) || "USD",
    sourceTimestamp: latestPeriod?.periodStart || payload.period?.endDate || null
  };
}

function normalizeFanvueEarningsList(payload) {
  if (!Array.isArray(payload?.data)) return null;

  let revenueCents = 0;
  let grossRevenueCents = 0;
  let tipsCents = 0;
  const sourceTotals = {
    subscriptionRevenueCents: 0,
    renewalRevenueCents: 0,
    messageRevenueCents: 0,
    postRevenueCents: 0,
    referralRevenueCents: 0,
    otherRevenueCents: 0
  };
  let currency = "USD";
  let sourceTimestamp = null;
  for (const item of payload.data) {
    const amount = moneyObjectValue(item);
    if (amount === null) continue;
    const grossAmount = moneyObjectGrossValue(item) ?? amount;
    revenueCents += amount;
    grossRevenueCents += grossAmount;
    if (item.source === "tip") tipsCents += amount;
    if (["sub", "subs", "subscription", "subscriptions"].includes(item.source)) sourceTotals.subscriptionRevenueCents += amount;
    else if (["renewal", "renewals"].includes(item.source)) sourceTotals.renewalRevenueCents += amount;
    else if (["message", "messages"].includes(item.source)) sourceTotals.messageRevenueCents += amount;
    else if (["post", "posts"].includes(item.source)) sourceTotals.postRevenueCents += amount;
    else if (["referral", "referrals"].includes(item.source)) sourceTotals.referralRevenueCents += amount;
    else if (item.source !== "tip") sourceTotals.otherRevenueCents += amount;
    if (item.currency) currency = item.currency;
    if (item.date) sourceTimestamp = item.date;
  }

  if (revenueCents === 0 && !payload.data.length) return null;

  return {
    revenueCents,
    grossRevenueCents: grossRevenueCents || revenueCents,
    fanvueNetCents: revenueCents,
    fanvueFeeCents: Math.max((grossRevenueCents || revenueCents) - revenueCents, 0),
    subscribers: 0,
    messages: 0,
    tipsCents,
    ...sourceTotals,
    dailyEarnings: [],
    clicks: 0,
    currency,
    sourceTimestamp
  };
}

function moneyObjectValue(source) {
  if (!source || typeof source !== "object") return null;
  const net = moneyObjectNetValue(source);
  if (net !== null) return net;
  const gross = moneyObjectGrossValue(source);
  if (gross !== null) return gross;
  return null;
}

function moneyObjectNetValue(source) {
  if (!source || typeof source !== "object") return null;
  const net = coerceNumber(source.net);
  if (Number.isFinite(net)) return Math.round(net);
  return null;
}

function moneyObjectGrossValue(source) {
  if (!source || typeof source !== "object") return null;
  const gross = coerceNumber(source.gross);
  if (Number.isFinite(gross)) return Math.round(gross);
  return null;
}

function buildHeaders(apiToken, url) {
  const headers = {
    accept: "application/json",
    "user-agent": "fanvue-api-tracker/0.1"
  };

  if (isFanvueUrl(url)) {
    headers["x-fanvue-api-version"] = process.env.FANVUE_API_VERSION || "2025-06-26";
  }

  if (apiToken) {
    headers.authorization = `Bearer ${apiToken}`;
  }

  return headers;
}

function isFanvueUrl(value) {
  try {
    const hostname = new URL(value).hostname;
    return hostname === "fanvue.com" || hostname.endsWith(".fanvue.com");
  } catch {
    return false;
  }
}

function findMoneyValue(source, aliases) {
  const centsValue = findNumberValue(source, aliases.cents);
  if (centsValue !== null) return Math.round(centsValue);

  const moneyValue = findNumberValue(source, aliases.money);
  if (moneyValue === null) return null;
  return Math.round(moneyValue * 100);
}

function findNumberValue(source, aliases) {
  const value = findValue(source, aliases);
  if (value === null || value === undefined || value === "") return null;
  const number = coerceNumber(value);
  return Number.isFinite(number) ? number : null;
}

function findStringValue(source, aliases) {
  const value = findValue(source, aliases);
  if (value === null || value === undefined || typeof value === "object") return null;
  return String(value);
}

function findValue(source, aliases, depth = 0) {
  if (!source || typeof source !== "object" || depth > 5) return null;

  const normalizedAliases = new Set(aliases.map(normalizeKey));
  for (const [key, value] of Object.entries(source)) {
    if (normalizedAliases.has(normalizeKey(key))) return value;
  }

  for (const value of Object.values(source)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = findValue(value, aliases, depth + 1);
      if (nested !== null && nested !== undefined) return nested;
    }
  }

  return null;
}

function normalizeKey(key) {
  return String(key).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function coerceNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[$€£,\s]/g, "");
    return Number(cleaned);
  }
  return Number.NaN;
}
