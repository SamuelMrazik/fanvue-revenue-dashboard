import { fanvueApiPaginate, fanvueApiRequest, creatorUuidFromModel } from "./fanvue-api.js";

export async function fetchModelVault(accessToken, model) {
  const creatorUuid = creatorUuidFromModel(model);
  if (!creatorUuid) throw new Error("Connect Fanvue to load vault data.");

  const folderCandidates = [
    `/creators/${creatorUuid}/vault/folders`,
    `/vault/folders`
  ];

  let folders = [];
  let lastError = null;
  for (const path of folderCandidates) {
    try {
      folders = await fanvueApiPaginate(accessToken, path, { listKeys: ["folders"] });
      if (folders.length) break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!folders.length && lastError) throw lastError;

  const enrichedFolders = [];
  for (const folder of folders) {
    const folderName = folder.name || folder.folderName || folder.slug || folder.id;
    let media = Array.isArray(folder.media) ? folder.media : [];
    if (!media.length && folderName) {
      try {
        media = await fanvueApiPaginate(accessToken, `/creators/${creatorUuid}/vault/folders/${encodeURIComponent(folderName)}/media`, {
          listKeys: ["media"]
        });
      } catch {
        media = [];
      }
    }
    enrichedFolders.push({
      id: String(folder.id || folderName),
      name: String(folderName),
      mediaCount: media.length,
      media: media.map(normalizeVaultMedia).slice(0, 120)
    });
  }

  return {
    creatorUuid,
    folderCount: enrichedFolders.length,
    mediaCount: sum(enrichedFolders.map((folder) => folder.mediaCount)),
    folders: enrichedFolders
  };
}

export async function fetchModelPosts(accessToken, model) {
  const creatorUuid = creatorUuidFromModel(model);
  if (!creatorUuid) throw new Error("Connect Fanvue to load posts.");

  const postCandidates = [
    `/creators/${creatorUuid}/posts`,
    `/posts`
  ];

  let posts = [];
  let lastError = null;
  for (const path of postCandidates) {
    try {
      posts = await fanvueApiPaginate(accessToken, path, {
        query: path === "/posts" ? { creatorUserUuid: creatorUuid } : undefined,
        listKeys: ["posts"]
      });
      if (posts.length) break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!posts.length && lastError) throw lastError;

  const normalized = posts.map(normalizePost).sort((a, b) => {
    const left = new Date(b.publishedAt || b.createdAt || 0).getTime();
    const right = new Date(a.publishedAt || a.createdAt || 0).getTime();
    return left - right;
  });

  const counts = normalized.reduce((acc, post) => {
    acc[post.status] = (acc[post.status] || 0) + 1;
    return acc;
  }, {});

  return {
    creatorUuid,
    total: normalized.length,
    counts,
    posts: normalized.slice(0, 200)
  };
}

export async function fetchModelTrackingSummary(accessToken, model, period) {
  const creatorUuid = creatorUuidFromModel(model);
  if (!creatorUuid) throw new Error("Connect Fanvue to load tracking links.");

  const linkCandidates = [
    `/creators/${creatorUuid}/tracking-links`,
    `/tracking-links`
  ];

  let links = [];
  let lastError = null;
  for (const path of linkCandidates) {
    try {
      links = await fanvueApiPaginate(accessToken, path, {
        query: {
          createdAfter: period.startIso,
          createdBefore: period.endIso
        },
        listKeys: ["links", "trackingLinks"]
      });
      if (links.length) break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!links.length && lastError) throw lastError;

  const normalized = links.map(normalizeTrackingLink);
  const internal = normalized.filter((link) => link.channel === "internal");
  const external = normalized.filter((link) => link.channel === "external");

  return {
    creatorUuid,
    period,
    links: normalized,
    internal: aggregateTrackingChannel(internal),
    external: aggregateTrackingChannel(external),
    totals: aggregateTrackingChannel(normalized)
  };
}

export async function fetchModelAudienceSummary(accessToken, model, period) {
  const creatorUuid = creatorUuidFromModel(model);
  if (!creatorUuid) throw new Error("Connect Fanvue to load subscriber insights.");

  const subscriberCandidates = [
    `/creators/${creatorUuid}/insights/subscribers`,
    `/insights/subscribers`
  ];

  let payload = null;
  let lastError = null;
  for (const path of subscriberCandidates) {
    try {
      payload = await fanvueApiRequest(accessToken, path, {
        query: {
          startDate: period.startDate,
          endDate: period.endDate,
          creatorUserUuid: path === "/insights/subscribers" ? creatorUuid : undefined
        }
      });
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!payload && lastError) throw lastError;

  return normalizeAudienceSummary(payload, period);
}

function normalizeVaultMedia(item) {
  return {
    id: String(item.mediaUuid || item.uuid || item.id || ""),
    name: item.name || item.filename || "Media",
    mediaType: item.mediaType || item.type || "image",
    thumbnailUrl: item.thumbnailUrl || item.previewUrl || item.url || "",
    createdAt: item.createdAt || item.created_at || null
  };
}

function normalizePost(item) {
  const statusRaw = String(item.status || item.state || "published").toLowerCase();
  let status = "published";
  if (statusRaw.includes("sched")) status = "scheduled";
  else if (statusRaw.includes("draft")) status = "draft";

  return {
    id: String(item.uuid || item.id || ""),
    title: item.title || item.caption || item.text || "(untitled)",
    status,
    publishedAt: item.publishedAt || item.published_at || null,
    createdAt: item.createdAt || item.created_at || null,
    mediaCount: Array.isArray(item.mediaUuids) ? item.mediaUuids.length : (item.mediaCount || 0),
    priceCents: moneyToCents(item.price || item.priceCents)
  };
}

function normalizeTrackingLink(item) {
  const channel = classifyTrackingChannel(item);
  return {
    id: String(item.uuid || item.id || item.slug || ""),
    name: item.name || item.label || item.slug || "Link",
    slug: item.slug || "",
    channel,
    clicks: numberValue(item.clicks ?? item.clickCount ?? item.visits),
    subscribers: numberValue(item.subscribersAcquired ?? item.newSubscribers ?? item.subscribers),
    followers: numberValue(item.followersAcquired ?? item.newFollowers ?? item.followers),
    grossRevenueCents: moneyToCents(item.grossEarnings ?? item.grossRevenue ?? item.grossEarningsCents),
    netRevenueCents: moneyToCents(item.netEarnings ?? item.netRevenue ?? item.netEarningsCents)
  };
}

function classifyTrackingChannel(item) {
  const hay = `${item.name || ""} ${item.slug || ""} ${item.label || ""} ${item.type || ""}`.toLowerCase();
  if (item.isDefault || item.internal === true || item.channel === "internal") return "internal";
  if (hay.includes("internal") || hay.includes("profile") || hay.includes("organic") || hay.includes("fanvue") || hay.includes("direct")) {
    return "internal";
  }
  return "external";
}

function aggregateTrackingChannel(links) {
  return {
    linkCount: links.length,
    clicks: sum(links.map((link) => link.clicks)),
    subscribers: sum(links.map((link) => link.subscribers)),
    followers: sum(links.map((link) => link.followers)),
    grossRevenueCents: sum(links.map((link) => link.grossRevenueCents)),
    netRevenueCents: sum(links.map((link) => link.netRevenueCents))
  };
}

function normalizeAudienceSummary(payload, period) {
  const rows = extractAudienceRows(payload);
  const filtered = rows.filter((row) => dateInRange(row.date, period.startDate, period.endDate));

  return {
    period,
    newSubscribers: sum(filtered.map((row) => row.newSubscribers)),
    newFollowers: sum(filtered.map((row) => row.newFollowers)),
    cancelledSubscribers: sum(filtered.map((row) => row.cancelledSubscribers)),
    daily: filtered
  };
}

function extractAudienceRows(payload) {
  const list = Array.isArray(payload) ? payload
    : Array.isArray(payload?.data) ? payload.data
    : Array.isArray(payload?.events) ? payload.events
    : Array.isArray(payload?.items) ? payload.items
    : [];

  return list.map((row) => ({
    date: dateKey(row.date || row.day || row.periodStart || row.timestamp),
    newSubscribers: numberValue(row.newSubscribers ?? row.subscribersAdded ?? row.subscriberEvents?.new),
    newFollowers: numberValue(row.newFollowers ?? row.followersAdded ?? row.followerEvents?.new),
    cancelledSubscribers: numberValue(row.cancelledSubscribers ?? row.subscribersCancelled)
  })).filter((row) => row.date);
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function moneyToCents(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "object") {
    const cents = value.amountCents ?? value.cents;
    if (cents !== undefined) return Math.round(Number(cents) || 0);
    const amount = Number(value.amount ?? value.value ?? 0);
    return Math.round(amount * 100);
  }
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  if (Number.isInteger(number) && Math.abs(number) >= 1000) return Math.round(number);
  return Math.round(number * 100);
}

function dateKey(value) {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function dateInRange(date, from, to) {
  return (!from || date >= from) && (!to || date <= to);
}

function sum(values) {
  return values.reduce((total, value) => total + (Number(value) || 0), 0);
}
