import fs from "node:fs/promises";
import path from "node:path";

const storePath = path.join(process.cwd(), "data", "store.json");

const models = [
  {
    key: "luna",
    name: "Luna Vale",
    color: "#67e8f9",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Luna",
    baseNet: 42000,
    trend: 1.12
  },
  {
    key: "mika",
    name: "Mika Rose",
    color: "#f472b6",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Mika",
    baseNet: 31000,
    trend: 0.94
  },
  {
    key: "nova",
    name: "Nova Blake",
    color: "#a78bfa",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Nova",
    baseNet: 28500,
    trend: 1.08
  },
  {
    key: "sage",
    name: "Sage Monroe",
    color: "#fbbf24",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Sage",
    baseNet: 19800,
    trend: 1.18
  }
];

function dateKey(offsetDays = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function isoDaysAgo(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
}

function moneyCents(dollars) {
  return Math.round(dollars * 100);
}

function buildDailyEarnings(model, days = 30) {
  const points = [];
  for (let day = days; day >= 0; day -= 1) {
    const date = dateKey(-day);
    const wave = 1 + Math.sin(day / 4) * 0.18 + (day % 7 === 0 ? 0.25 : 0);
    const fanvueNet = Math.round((model.baseNet / 30) * wave * model.trend);
    const gross = Math.round(fanvueNet / 0.85);
    points.push({
      date,
      grossRevenueCents: gross,
      fanvueNetCents: fanvueNet
    });
  }
  return points;
}

function buildTrackingSummary(modelKey) {
  const links = [
    { name: "Profile / organic", channel: "internal", clicks: 820, subscribers: 42, followers: 118, net: 0 },
    { name: "Fanvue direct", channel: "internal", clicks: 540, subscribers: 18, followers: 64, net: 0 },
    { name: "Twitter bio", channel: "external", clicks: 1260, subscribers: 36, followers: 210, net: 18600 },
    { name: "Instagram story", channel: "external", clicks: 940, subscribers: 28, followers: 156, net: 14200 },
    { name: "Reddit thread", channel: "external", clicks: 410, subscribers: 11, followers: 72, net: 6800 },
    { name: "Linktree promo", channel: "external", clicks: 720, subscribers: 19, followers: 98, net: 9100 }
  ].map((link, index) => ({
    id: `link_${modelKey}_${index}`,
    name: link.name,
    slug: link.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    channel: link.channel,
    clicks: link.clicks + index * 17,
    subscribers: link.subscribers,
    followers: link.followers,
    grossRevenueCents: moneyCents(link.net * 1.15),
    netRevenueCents: moneyCents(link.net)
  }));

  const internal = links.filter((link) => link.channel === "internal");
  const external = links.filter((link) => link.channel === "external");
  const sum = (items, key) => items.reduce((total, item) => total + item[key], 0);

  const pack = (items) => ({
    linkCount: items.length,
    clicks: sum(items, "clicks"),
    subscribers: sum(items, "subscribers"),
    followers: sum(items, "followers"),
    grossRevenueCents: sum(items, "grossRevenueCents"),
    netRevenueCents: sum(items, "netRevenueCents")
  });

  return {
    creatorUuid: `demo-${modelKey}`,
    period: { preset: "last30", startDate: dateKey(-30), endDate: dateKey(0) },
    links,
    internal: pack(internal),
    external: pack(external),
    totals: pack(links)
  };
}

function buildAudienceSummary() {
  const daily = [];
  for (let day = 30; day >= 0; day -= 1) {
    daily.push({
      date: dateKey(-day),
      newSubscribers: 2 + (day % 5),
      newFollowers: 4 + (day % 4),
      cancelledSubscribers: day % 9 === 0 ? 1 : 0
    });
  }
  return {
    period: { preset: "last30", startDate: dateKey(-30), endDate: dateKey(0) },
    newSubscribers: daily.reduce((total, row) => total + row.newSubscribers, 0),
    newFollowers: daily.reduce((total, row) => total + row.newFollowers, 0),
    cancelledSubscribers: daily.reduce((total, row) => total + row.cancelledSubscribers, 0),
    daily
  };
}

function buildSnapshot(model) {
  const dailyEarnings = buildDailyEarnings(model);
  const latest = dailyEarnings.at(-1);
  const fanvueNet = latest.fanvueNetCents;
  const gross = latest.grossRevenueCents;

  return {
    id: `snap_${model.key}`,
    modelId: `model_${model.key}`,
    capturedAt: isoDaysAgo(0),
    revenueCents: fanvueNet,
    grossRevenueCents: gross,
    fanvueNetCents: fanvueNet,
    fanvueFeeCents: gross - fanvueNet,
    subscriptionRevenueCents: Math.round(fanvueNet * 0.42),
    renewalRevenueCents: Math.round(fanvueNet * 0.18),
    messageRevenueCents: Math.round(fanvueNet * 0.22),
    postRevenueCents: Math.round(fanvueNet * 0.08),
    referralRevenueCents: Math.round(fanvueNet * 0.04),
    otherRevenueCents: Math.round(fanvueNet * 0.06),
    tipsCents: Math.round(fanvueNet * 0.12),
    subscribers: 420 + models.indexOf(model) * 35,
    messages: 88 + models.indexOf(model) * 12,
    clicks: 1200 + models.indexOf(model) * 90,
    currency: "USD",
    dailyEarnings,
    trackingSummary: buildTrackingSummary(model.key),
    audienceSummary: buildAudienceSummary(),
    vaultSummary: { folderCount: 3 + models.indexOf(model), mediaCount: 24 + models.indexOf(model) * 6 },
    postsSummary: {
      total: 18 + models.indexOf(model) * 2,
      counts: { published: 12, scheduled: 4, draft: 2 }
    },
    contentErrors: {}
  };
}

const now = new Date().toISOString();
const db = {
  version: 1,
  models: models.map((model, index) => ({
    id: `model_${model.key}`,
    displayName: model.name,
    chartColor: model.color,
    avatarUrl: model.avatar,
    apiBaseUrl: "https://api.fanvue.com",
    endpointPath: "/insights/earnings/summary",
    syncIntervalMinutes: 60,
    enabled: true,
    createdAt: isoDaysAgo(40),
    updatedAt: now,
    lastSyncAt: isoDaysAgo(0),
    nextSyncAt: isoDaysAgo(-1),
    lastStatus: index === 2 ? "error" : "ok",
    lastError: index === 2 ? "Demo: simulated token refresh failure" : "",
    fanvueOAuth: {
      connected: true,
      connectedAt: isoDaysAgo(20),
      expiresAt: isoDaysAgo(-2),
      scope: "read:insights read:creator read:tracking_links",
      tokenType: "Bearer",
      profile: {
        uuid: `demo-${model.key}`,
        handle: model.name.toLowerCase().replace(/\s+/g, ""),
        displayName: model.name,
        email: `${model.key}@demo.local`,
        isCreator: true
      },
      accessTokenEncrypted: "v1:ZGVtby1pdi0xMjM:ZGVtby10YWctMTIz:ZGVtby1hY2Nlc3M",
      refreshTokenEncrypted: "v1:ZGVtby1pdi0xMjM:ZGVtby10YWctMTIz:ZGVtby1yZWZyZXNo"
    }
  })),
  snapshots: models.map(buildSnapshot),
  syncLogs: models.flatMap((model) => [
    {
      id: `log_${model.key}_ok`,
      modelId: `model_${model.key}`,
      startedAt: isoDaysAgo(0),
      finishedAt: isoDaysAgo(0),
      status: "ok",
      message: "Demo metrics synced"
    },
    {
      id: `log_${model.key}_prev`,
      modelId: `model_${model.key}`,
      startedAt: isoDaysAgo(1),
      finishedAt: isoDaysAgo(1),
      status: model.key === "nova" ? "error" : "ok",
      message: model.key === "nova" ? "Demo: Fanvue rate limit" : "Demo metrics synced"
    }
  ])
};

await fs.mkdir(path.dirname(storePath), { recursive: true });
await fs.writeFile(storePath, `${JSON.stringify(db, null, 2)}\n`, "utf8");
console.log(`Demo data written to ${storePath}`);
console.log(`${db.models.length} models · ${db.snapshots.length} snapshots · login: owner / preview`);
