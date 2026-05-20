import assert from "node:assert/strict";
import test from "node:test";
import { buildMetricsUrl, normalizeMetrics } from "../src/connector.js";

test("buildMetricsUrl joins base URLs and metric paths safely", () => {
  assert.equal(buildMetricsUrl("https://api.example.com", "/creator/analytics"), "https://api.example.com/creator/analytics");
  assert.equal(buildMetricsUrl("https://api.example.com/v1/", "metrics"), "https://api.example.com/v1/metrics");
});

test("normalizeMetrics accepts common nested API response shapes", () => {
  const metrics = normalizeMetrics({
    data: {
      insights: {
        earnings: "$1,234.56",
        activeSubscribers: "812",
        paidMessages: 155,
        totalTips: 88.4,
        profileClicks: "9,410",
        currency: "USD"
      }
    }
  });

  assert.deepEqual(metrics, {
    revenueCents: 123456,
    subscribers: 812,
    messages: 155,
    tipsCents: 8840,
    clicks: 9410,
    currency: "USD",
    sourceTimestamp: null
  });
});

test("normalizeMetrics accepts Fanvue earnings summary responses", () => {
  const metrics = normalizeMetrics({
    totals: {
      allTime: {
        gross: 1250000,
        net: 1037500
      }
    },
    breakdownBySource: {
      tips: {
        gross: 12000,
        net: 9900
      }
    },
    overTime: [
      {
        periodStart: "2026-03-01T00:00:00.000Z",
        gross: 24000,
        net: 19800
      }
    ]
  });

  assert.equal(metrics.revenueCents, 1037500);
  assert.equal(metrics.grossRevenueCents, 1250000);
  assert.equal(metrics.fanvueNetCents, 1037500);
  assert.equal(metrics.fanvueFeeCents, 212500);
  assert.equal(metrics.tipsCents, 9900);
  assert.equal(metrics.sourceTimestamp, "2026-03-01T00:00:00.000Z");
  assert.deepEqual(metrics.dailyEarnings, [{
    date: "2026-03-01T00:00:00.000Z",
    grossRevenueCents: 24000,
    fanvueNetCents: 19800
  }]);
});

test("normalizeMetrics fails loudly when no tracking fields are present", () => {
  assert.throws(() => normalizeMetrics({ data: { profile: { name: "creator" } } }), /recognizable tracking metrics/);
});
