import { renderInteractiveChart } from "./chart.js";

const DEFAULT_FANVUE_API_BASE_URL = "https://api.fanvue.com";
const DEFAULT_FANVUE_ENDPOINT = "/insights/earnings/summary";
const FANVUE_FEE_RATE = 15;
const AGENCY_FEE_RATE = 30;
const MODEL_COLORS = ["#49f263", "#4ca4f5", "#f5a623", "#ff6f91", "#b982ff", "#2dd4bf", "#f97316", "#eab308"];

const state = {
  models: [],
  snapshots: [],
  syncLogs: [],
  totals: {},
  fanvueStatus: { configured: false },
  selectedModelId: null,
  editingModelId: null,
  periodPreset: "last14",
  dateFrom: "",
  dateTo: "",
  metricMode: "ownerNet",
  comparisonMetric: "ownerNet",
  comparisonPeriodPreset: "last14",
  pendingAvatarUrl: null,
  clearAvatar: false,
  modelTab: "overview",
  contentCache: {
    vault: new Map(),
    posts: new Map()
  }
};

const elements = {
  overviewButton: document.querySelector("#overviewButton"),
  overviewView: document.querySelector("#overviewView"),
  modelView: document.querySelector("#modelView"),
  trackingEmpty: document.querySelector("#trackingEmpty"),
  pageTitle: document.querySelector("#pageTitle"),
  modelList: document.querySelector("#modelList"),
  syncSummary: document.querySelector("#syncSummary"),
  periodPresetInput: document.querySelector("#periodPresetInput"),
  customFromField: document.querySelector("#customFromField"),
  customToField: document.querySelector("#customToField"),
  dateFromInput: document.querySelector("#dateFromInput"),
  dateToInput: document.querySelector("#dateToInput"),
  metricModeInput: document.querySelector("#metricModeInput"),
  comparisonMetricInput: document.querySelector("#comparisonMetricInput"),
  overviewFanvueNet: document.querySelector("#overviewFanvueNet"),
  overviewExternalRevenue: document.querySelector("#overviewExternalRevenue"),
  modelTableSubtitle: document.querySelector("#modelTableSubtitle"),
  trackingLinksRows: document.querySelector("#trackingLinksRows"),
  trackingLinksSubtitle: document.querySelector("#trackingLinksSubtitle"),
  vaultSubtitle: document.querySelector("#vaultSubtitle"),
  vaultContent: document.querySelector("#vaultContent"),
  postsSubtitle: document.querySelector("#postsSubtitle"),
  postsRows: document.querySelector("#postsRows"),
  primaryMetricLabel: document.querySelector("#primaryMetricLabel"),
  primaryMetricValue: document.querySelector("#primaryMetricValue"),
  primaryMetricSubtext: document.querySelector("#primaryMetricSubtext"),
  overviewGross: document.querySelector("#overviewGross"),
  overviewAgencyDue: document.querySelector("#overviewAgencyDue"),
  overviewHealth: document.querySelector("#overviewHealth"),
  comparisonSubtitle: document.querySelector("#comparisonSubtitle"),
  comparisonChart: document.querySelector("#comparisonChart"),
  comparisonLegend: document.querySelector("#comparisonLegend"),
  modelPerformanceRows: document.querySelector("#modelPerformanceRows"),
  payoutSummary: document.querySelector("#payoutSummary"),
  agencyPayoutRows: document.querySelector("#agencyPayoutRows"),
  modelOwnerNet: document.querySelector("#modelOwnerNet"),
  modelPeriodLabel: document.querySelector("#modelPeriodLabel"),
  modelGross: document.querySelector("#modelGross"),
  modelAgencyDue: document.querySelector("#modelAgencyDue"),
  modelTopSource: document.querySelector("#modelTopSource"),
  modelTopSourceShare: document.querySelector("#modelTopSourceShare"),
  modelChartTitle: document.querySelector("#modelChartTitle"),
  modelChartSubtitle: document.querySelector("#modelChartSubtitle"),
  modelChart: document.querySelector("#modelChart"),
  revenueMix: document.querySelector("#revenueMix"),
  revenueMixSubtitle: document.querySelector("#revenueMixSubtitle"),
  dailyRows: document.querySelector("#dailyRows"),
  syncLogRows: document.querySelector("#syncLogRows"),
  connectionStatus: document.querySelector("#connectionStatus"),
  connectionDetails: document.querySelector("#connectionDetails"),
  modelDialog: document.querySelector("#modelDialog"),
  modelForm: document.querySelector("#modelForm"),
  modelFormTitle: document.querySelector("#modelFormTitle"),
  modelSubmitButton: document.querySelector("#modelSubmitButton"),
  formError: document.querySelector("#formError"),
  toast: document.querySelector("#toast")
};

document.querySelector("#addModelButton").addEventListener("click", () => openModelDialog());
document.querySelector("#addModelButtonSecondary").addEventListener("click", () => openModelDialog());
document.querySelector("#trackingEmptyAddButton").addEventListener("click", () => openModelDialog());
document.querySelector("#refreshButton").addEventListener("click", () => loadSummary());
document.querySelector("#syncAllButton").addEventListener("click", () => syncAll());
document.querySelector("#syncSelectedButton").addEventListener("click", () => syncSelected());
document.querySelector("#editModelButton").addEventListener("click", () => openModelDialog(selectedModel()));
document.querySelector("#testConnectionButton").addEventListener("click", () => testSelected());
document.querySelector("#connectFanvueButton").addEventListener("click", () => connectSelectedFanvue());
document.querySelector("#disconnectFanvueButton").addEventListener("click", () => disconnectSelectedFanvue());
document.querySelector("#deleteModelButton").addEventListener("click", () => deleteSelected());
document.querySelector("#closeDialogButton").addEventListener("click", closeDialog);
document.querySelector("#cancelDialogButton").addEventListener("click", closeDialog);
elements.overviewButton.addEventListener("click", () => {
  state.selectedModelId = null;
  render();
});
elements.periodPresetInput.addEventListener("change", updatePeriodControls);
elements.dateFromInput.addEventListener("change", updatePeriodControls);
elements.dateToInput.addEventListener("change", updatePeriodControls);
elements.metricModeInput.addEventListener("change", updatePeriodControls);
elements.comparisonMetricInput.addEventListener("change", () => {
  state.comparisonMetric = elements.comparisonMetricInput.value;
  render();
});
document.querySelectorAll("[data-comparison-period]").forEach((button) => {
  button.addEventListener("click", () => {
    state.comparisonPeriodPreset = button.dataset.comparisonPeriod;
    render();
  });
});
document.querySelector("#avatarInput").addEventListener("change", onAvatarSelected);
document.querySelector("#clearAvatarButton").addEventListener("click", () => {
  state.pendingAvatarUrl = null;
  state.clearAvatar = true;
  renderAvatarPreview(null);
});
elements.modelForm.addEventListener("submit", saveModel);
document.querySelectorAll("[data-model-tab]").forEach((button) => {
  button.addEventListener("click", () => switchModelTab(button.dataset.modelTab));
});
document.querySelector("#refreshVaultButton").addEventListener("click", () => loadVaultContent(true));
document.querySelector("#refreshPostsButton").addEventListener("click", () => loadPostsContent(true));

handleOAuthReturnParams();
await loadSummary();

async function loadSummary() {
  try {
    const [summary, fanvueStatus] = await Promise.all([
      api("/api/summary"),
      api("/api/fanvue/oauth/status")
    ]);
    state.models = summary.models;
    state.snapshots = summary.snapshots;
    state.syncLogs = summary.syncLogs;
    state.totals = summary.totals;
    state.fanvueStatus = fanvueStatus;

    if (state.selectedModelId && !state.models.some((model) => model.id === state.selectedModelId)) {
      state.selectedModelId = null;
    }

    initializePeriod();
    render();
  } catch (error) {
    elements.syncSummary.textContent = "Tracker data could not be loaded.";
    showToast(error.message);
  }
}

function render() {
  const selected = selectedModel();
  const isModelView = Boolean(selected);
  const errors = state.totals.errorModels || 0;
  const ok = state.totals.okModels || 0;
  const pending = Math.max(state.models.length - ok - errors, 0);

  elements.pageTitle.textContent = selected ? selected.displayName : "All models";
  elements.syncSummary.textContent = `${ok} healthy · ${errors} failing · ${pending} pending · ${state.models.length} total`;
  elements.trackingEmpty.hidden = state.models.length > 0;
  elements.overviewView.hidden = isModelView;
  elements.modelView.hidden = !isModelView;
  elements.overviewButton.classList.toggle("active", !isModelView);
  document.querySelector("#syncAllButton").disabled = !state.models.some(canSyncModel);
  elements.periodPresetInput.value = state.periodPreset;
  elements.customFromField.hidden = state.periodPreset !== "custom";
  elements.customToField.hidden = state.periodPreset !== "custom";
  elements.dateFromInput.value = state.dateFrom;
  elements.dateToInput.value = state.dateTo;
  elements.metricModeInput.value = state.metricMode;
  elements.comparisonMetricInput.value = state.comparisonMetric;
  document.querySelectorAll("[data-comparison-period]").forEach((button) => {
    button.classList.toggle("active", button.dataset.comparisonPeriod === state.comparisonPeriodPreset);
  });

  renderModels();
  renderOverview();
  renderModelView(selected);
  renderLogs(selected);
  renderConnection(selected);
  renderModelTabPanels(selected);
}

function renderModels() {
  if (!state.models.length) {
    elements.modelList.innerHTML = `<p class="empty-note">No models yet.</p>`;
    return;
  }

  elements.modelList.innerHTML = state.models.map((model, index) => {
    const active = model.id === state.selectedModelId ? "active" : "";
    const color = modelColor(model, index);
    const latest = latestSnapshotForModel(model.id);
    const ownerNet = latest ? profitForAggregate(latest).ownerNetCents : 0;
    return `
      <button class="model-item ${active}" type="button" data-model-id="${escapeHtml(model.id)}">
        ${modelAvatarHtml(model, color)}
        <span class="model-copy">
          <strong>${escapeHtml(model.displayName)}</strong>
          <small>${escapeHtml(statusLabel(model.lastStatus))} · ${formatMoney(ownerNet)}</small>
        </span>
      </button>
    `;
  }).join("");

  elements.modelList.querySelectorAll("[data-model-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedModelId = button.dataset.modelId;
      render();
    });
  });
}

function renderOverview() {
  const periodRows = state.models.map((model, index) => {
    const totals = periodTotalsForModel(model);
    const insights = modelInsights(model);
    return {
      model,
      color: modelColor(model, index),
      totals,
      insights,
      topSource: topSourceForModel(model)
    };
  });
  const grossCents = sum(periodRows.map((row) => row.totals.grossCents));
  const fanvueNetCents = sum(periodRows.map((row) => row.totals.fanvueNetCents));
  const ownerNetCents = sum(periodRows.map((row) => row.totals.ownerNetCents));
  const selectedMetricCents = metricValue({ grossCents, fanvueNetCents, ownerNetCents });
  const payoutPeriods = agencyPayoutPeriods();
  const agencyDueCents = sum(periodRows.map((row) => (
    payoutTotalForModel(row.model, payoutPeriods.fifteenth) + payoutTotalForModel(row.model, payoutPeriods.twentySeventh)
  )));
  const externalRevenueCents = sum(periodRows.map((row) => row.insights.externalRevenueCents));
  const connected = state.models.filter(canSyncModel).length;

  elements.primaryMetricLabel.textContent = `Combined ${metricLabel(state.metricMode).toLowerCase()}`;
  elements.primaryMetricValue.textContent = formatMoney(selectedMetricCents);
  elements.primaryMetricSubtext.textContent = periodLabel();
  elements.modelTableSubtitle.textContent = `${periodLabel()} · revenue since period start`;
  elements.overviewGross.textContent = formatMoney(grossCents);
  elements.overviewFanvueNet.textContent = formatMoney(fanvueNetCents);
  elements.overviewAgencyDue.textContent = formatMoney(agencyDueCents);
  elements.overviewExternalRevenue.textContent = formatMoney(externalRevenueCents);
  elements.overviewHealth.textContent = `${connected}/${state.models.length}`;

  renderComparisonChart(periodRows);
  renderPerformanceTable(periodRows);
  renderTrackingLinks(periodRows);
  renderAgencyPayouts(periodRows);
}

function renderComparisonChart(rows) {
  const dates = comparisonDateRange();
  const series = rows.map((row) => ({
    label: row.model.displayName,
    color: row.color,
    avatarUrl: row.model.avatarUrl || "",
    points: comparisonPointsForModel(row.model, row.insights, dates)
  }));

  elements.comparisonSubtitle.textContent = `${comparisonMetricLabel(state.comparisonMetric)} · ${comparisonPeriodLabel()}`;
  renderInteractiveChart(elements.comparisonChart, {
    series,
    dates,
    formatValue: comparisonMetricFormatter(state.comparisonMetric),
    emptyMessage: "Sync models, then pick a metric and timeline to compare."
  });
  elements.comparisonLegend.innerHTML = series.map((serie) => `
    <span>${modelAvatarHtml({ displayName: serie.label, avatarUrl: serie.avatarUrl }, serie.color, { small: true })}${escapeHtml(serie.label)}</span>
  `).join("") || `<span>No synced model data</span>`;
}

function renderPerformanceTable(rows) {
  const sortedRows = [...rows].sort((a, b) => b.totals.ownerNetCents - a.totals.ownerNetCents);
  elements.modelPerformanceRows.innerHTML = sortedRows.map((row) => `
    <tr>
      <td>
        <button class="table-model-button" type="button" data-row-model-id="${escapeHtml(row.model.id)}">
          ${modelAvatarHtml(row.model, row.color, { small: true })}
          ${escapeHtml(row.model.displayName)}
        </button>
      </td>
      <td>${formatMoney(row.totals.grossCents)}</td>
      <td>${formatMoney(row.totals.fanvueNetCents)}</td>
      <td>${formatMoney(row.totals.ownerNetCents)}</td>
      <td>${formatCount(row.insights.newSubscribers)}</td>
      <td>${formatCount(row.insights.newFollowers)}</td>
      <td>${formatTrafficCell(row.insights.internal)}</td>
      <td>${formatTrafficCell(row.insights.external)}</td>
      <td>${formatMoney(row.insights.externalRevenueCents)}</td>
      <td><span class="pill ${statusClass(row.model.lastStatus)}">${escapeHtml(statusLabel(row.model.lastStatus))}</span></td>
    </tr>
  `).join("") || `<tr><td colspan="10">No models in this period.</td></tr>`;

  elements.modelPerformanceRows.querySelectorAll("[data-row-model-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedModelId = button.dataset.rowModelId;
      render();
    });
  });
}

function renderTrackingLinks(rows) {
  const linkRows = [];
  for (const row of rows) {
    for (const link of row.insights.links) {
      linkRows.push({ model: row.model, color: row.color, link });
    }
  }

  const hasSyncGap = rows.some((row) => row.insights.dataNote);
  elements.trackingLinksSubtitle.textContent = linkRows.length
    ? `${linkRows.length} links · ${periodLabel()}`
    : hasSyncGap
      ? "No tracking data yet — run Sync all after reconnecting Fanvue."
      : "No tracking links returned from Fanvue for this period.";

  elements.trackingLinksRows.innerHTML = linkRows.map((row) => `
    <tr>
      <td>
        <span class="table-model-inline">
          ${modelAvatarHtml(row.model, row.color, { small: true })}
          ${escapeHtml(row.model.displayName)}
        </span>
      </td>
      <td>${escapeHtml(row.link.name)}</td>
      <td><span class="channel-pill ${row.link.channel}">${escapeHtml(row.link.channel)}</span></td>
      <td>${formatCount(row.link.clicks)}</td>
      <td>${formatCount(row.link.subscribers)}</td>
      <td>${formatCount(row.link.followers)}</td>
      <td>${formatMoney(row.link.netRevenueCents)}</td>
    </tr>
  `).join("") || `<tr><td colspan="7">Sync all models to load tracking links. If still empty, reconnect Fanvue with read:tracking_links.</td></tr>`;
}

function renderAgencyPayouts(rows) {
  const periods = agencyPayoutPeriods();
  const payoutRows = rows.map((row) => ({
    ...row,
    fifteenth: payoutTotalForModel(row.model, periods.fifteenth),
    twentySeventh: payoutTotalForModel(row.model, periods.twentySeventh)
  }));
  const fifteenthTotal = sum(payoutRows.map((row) => row.fifteenth));
  const twentySeventhTotal = sum(payoutRows.map((row) => row.twentySeventh));

  elements.payoutSummary.innerHTML = `
    <div><span>${escapeHtml(periods.fifteenth.label)}</span><strong>${formatMoney(fifteenthTotal)}</strong></div>
    <div><span>${escapeHtml(periods.twentySeventh.label)}</span><strong>${formatMoney(twentySeventhTotal)}</strong></div>
  `;
  elements.agencyPayoutRows.innerHTML = payoutRows
    .filter((row) => row.fifteenth > 0 || row.twentySeventh > 0)
    .map((row) => `
      <tr>
        <td>${escapeHtml(row.model.displayName)}</td>
        <td>${formatMoney(row.fifteenth)}</td>
        <td>${formatMoney(row.twentySeventh)}</td>
      </tr>
    `).join("") || `<tr><td colspan="3">No agency payout due from synced daily earnings yet.</td></tr>`;
}

function renderModelView(model) {
  if (!model) return;

  const totals = periodTotalsForModel(model);
  const topSource = topSourceForModel(model);
  const currentPayout = payoutTotalForModel(model, currentAgencyPeriod());

  elements.modelOwnerNet.textContent = formatMoney(totals.ownerNetCents);
  elements.modelPeriodLabel.textContent = periodLabel();
  elements.modelGross.textContent = formatMoney(totals.grossCents);
  elements.modelAgencyDue.textContent = formatMoney(currentPayout);
  elements.modelTopSource.textContent = topSource.label;
  elements.modelTopSourceShare.textContent = topSource.value ? `${formatMoney(topSource.value)} · ${formatPercent(topSource.share)}` : "No synced revenue";
  elements.modelChartTitle.textContent = `${model.displayName} daily ${metricLabel(state.metricMode).toLowerCase()}`;
  elements.modelChartSubtitle.textContent = periodLabel();

  const dates = selectedDateRange();
  const modelIndex = state.models.findIndex((item) => item.id === model.id);
  const color = modelColor(model, Math.max(modelIndex, 0));
  const points = pointsForModel(model, dates).map((point) => ({ date: point.date, value: metricValue(point) }));
  renderInteractiveChart(elements.modelChart, {
    series: [{ label: model.displayName, color, avatarUrl: model.avatarUrl || "", points }],
    dates,
    formatValue: formatMoney,
    emptyMessage: "No daily earnings in this period yet."
  });

  renderRevenueMix(model);
  renderDailyRows(model);
}

function renderRevenueMix(model) {
  const snapshot = latestSnapshotForModel(model.id);
  if (!snapshot) {
    elements.revenueMixSubtitle.textContent = "Latest source split";
    elements.revenueMix.innerHTML = `<div class="chart-empty compact-empty">No revenue mix synced yet.</div>`;
    return;
  }

  elements.revenueMixSubtitle.textContent = `${formatDate(snapshot.capturedAt)} source split`;
  const rows = sourceRows(snapshot).filter((row) => row.value > 0);
  const total = sum(rows.map((row) => row.value));
  if (!rows.length || total <= 0) {
    elements.revenueMix.innerHTML = `<div class="chart-empty compact-empty">No source breakdown available.</div>`;
    return;
  }

  elements.revenueMix.innerHTML = rows.map((row) => {
    const percent = row.value / total;
    return `
      <div class="mix-row">
        <div>
          <strong>${escapeHtml(row.label)}</strong>
          <span>${formatMoney(row.value)} · ${formatPercent(percent)}</span>
        </div>
        <i style="--mix-width: ${Math.max(percent * 100, 2).toFixed(2)}%"></i>
      </div>
    `;
  }).join("");
}

function renderDailyRows(model) {
  const rows = dailyPointsForModel(model)
    .filter((point) => dateInRange(point.date, state.dateFrom, state.dateTo))
    .sort((a, b) => b.date.localeCompare(a.date));

  elements.dailyRows.innerHTML = rows.map((row) => `
    <tr>
      <td>${formatShortDate(row.date)}</td>
      <td>${formatMoney(row.grossCents)}</td>
      <td>${formatMoney(row.ownerNetCents)}</td>
      <td>${formatMoney(row.agencyFeeCents)}</td>
    </tr>
  `).join("") || `<tr><td colspan="4">No daily earnings in this period.</td></tr>`;
}

function renderLogs(model) {
  const modelNames = new Map(state.models.map((item) => [item.id, item.displayName]));
  const logs = model ? state.syncLogs.filter((log) => log.modelId === model.id) : state.syncLogs;
  const rows = logs.slice(0, 12).map((log) => `
    <tr>
      <td>${formatDate(log.finishedAt || log.startedAt)}</td>
      <td>${escapeHtml(modelNames.get(log.modelId) || "Removed model")}</td>
      <td><span class="pill ${statusClass(log.status)}">${escapeHtml(statusLabel(log.status))}</span></td>
      <td>${escapeHtml(log.message || "Completed")}</td>
    </tr>
  `);

  elements.syncLogRows.innerHTML = rows.join("") || `<tr><td colspan="4">No sync runs yet.</td></tr>`;
}

function renderConnection(model) {
  const syncButton = document.querySelector("#syncSelectedButton");
  const editButton = document.querySelector("#editModelButton");
  const testButton = document.querySelector("#testConnectionButton");
  const connectButton = document.querySelector("#connectFanvueButton");
  const disconnectButton = document.querySelector("#disconnectFanvueButton");
  const deleteButton = document.querySelector("#deleteModelButton");
  const canSync = canSyncModel(model);

  [editButton, connectButton, deleteButton].forEach((button) => {
    button.disabled = !model;
  });
  syncButton.disabled = !canSync;
  testButton.disabled = !canSync;

  if (!model) {
    elements.connectionStatus.textContent = "No model selected";
    elements.connectionDetails.innerHTML = "";
    disconnectButton.hidden = true;
    disconnectButton.disabled = true;
    return;
  }

  const oauthConnected = Boolean(model.fanvueOAuth?.connected);
  connectButton.textContent = oauthConnected ? "Reconnect Fanvue" : "Connect Fanvue";
  disconnectButton.hidden = !oauthConnected;
  disconnectButton.disabled = !oauthConnected;
  elements.connectionStatus.textContent = model.lastError || statusLabel(model.lastStatus);
  elements.connectionDetails.innerHTML = detailRows([
    ["Fanvue", oauthConnected ? `Connected${model.fanvueOAuth.expiresAt ? ` until ${formatDate(model.fanvueOAuth.expiresAt)}` : ""}` : fanvueConfigLabel()],
    ["Profile", oauthConnected ? fanvueProfileLabel(model.fanvueOAuth.profile) : "Not connected"],
    ["Last sync", model.lastSyncAt ? formatDate(model.lastSyncAt) : "Never"],
    ["Next sync", model.nextSyncAt ? formatDate(model.nextSyncAt) : "Not scheduled"],
    ["Interval", `${model.syncIntervalMinutes} minutes`],
    ["Enabled", model.enabled ? "Yes" : "No"]
  ]);
}

function initializePeriod() {
  applyPeriodPreset(state.periodPreset || "last14", { preserveCustom: Boolean(state.dateFrom && state.dateTo) });
}

function updatePeriodControls() {
  state.periodPreset = elements.periodPresetInput.value;
  state.metricMode = elements.metricModeInput.value;
  applyPeriodPreset(state.periodPreset, { preserveCustom: true });
  render();
}

function applyPeriodPreset(preset, options = {}) {
  const bounds = periodBoundsFromPreset(preset, {
    startDate: options.preserveCustom ? elements.dateFromInput.value : "",
    endDate: options.preserveCustom ? elements.dateToInput.value : ""
  });
  state.periodPreset = bounds.preset;
  state.dateFrom = bounds.startDate;
  state.dateTo = bounds.endDate;
  elements.periodPresetInput.value = state.periodPreset;
  elements.customFromField.hidden = state.periodPreset !== "custom";
  elements.customToField.hidden = state.periodPreset !== "custom";
  elements.dateFromInput.value = state.dateFrom;
  elements.dateToInput.value = state.dateTo;
}

function selectedDateRange() {
  return buildDateRange(state.dateFrom, state.dateTo);
}

function comparisonDateRange() {
  const bounds = periodBoundsFromPreset(state.comparisonPeriodPreset, {
    allTimeStart: earliestDataDate()
  });
  return buildDateRange(bounds.startDate, bounds.endDate);
}

function buildDateRange(from, to) {
  const dates = [];
  const start = parseDateKey(from);
  const end = parseDateKey(to);
  if (!start || !end) return dates;

  for (const current = new Date(start); current <= end; current.setUTCDate(current.getUTCDate() + 1)) {
    dates.push(dateKey(current));
  }
  return dates;
}

function earliestDataDate() {
  const dates = state.models
    .flatMap((model) => dailyPointsForModel(model).map((point) => point.date))
    .filter(Boolean)
    .sort();
  return dates[0] || dateKey(shiftUtcDays(startOfUtcDay(new Date()), -89));
}

function periodTotalsForModel(model) {
  const points = dailyPointsForModel(model).filter((point) => dateInRange(point.date, state.dateFrom, state.dateTo));
  if (points.length) {
    return {
      grossCents: sum(points.map((point) => point.grossCents)),
      fanvueNetCents: sum(points.map((point) => point.fanvueNetCents)),
      ownerNetCents: sum(points.map((point) => point.ownerNetCents)),
      agencyFeeCents: sum(points.map((point) => point.agencyFeeCents))
    };
  }

  const latest = latestSnapshotForModel(model.id);
  if (!latest || !dateInRange(dateKey(latest.capturedAt), state.dateFrom, state.dateTo)) {
    return zeroTotals();
  }
  return profitForAggregate(latest);
}

function pointsForModel(model, dates) {
  const pointsByDate = new Map(dailyPointsForModel(model).map((point) => [point.date, point]));
  return dates.map((date) => pointsByDate.get(date) || { date, ...zeroTotals() });
}

function dailyPointsForModel(model) {
  const latest = latestSnapshotForModel(model.id);
  const daily = Array.isArray(latest?.dailyEarnings) ? latest.dailyEarnings : [];
  if (daily.length) {
    return daily.map((point) => dailyProfitPoint(point.date, point.grossRevenueCents || 0, point.fanvueNetCents || 0));
  }

  if (latest?.capturedAt) {
    const profit = profitForAggregate(latest);
    return [{ date: dateKey(latest.capturedAt), ...profit }];
  }
  return [];
}

function dailyProfitPoint(date, grossCents, fanvueNetCents) {
  const normalizedGross = grossCents || deriveGrossFromNet(fanvueNetCents);
  const normalizedFanvueNet = fanvueNetCents || Math.round(normalizedGross * (1 - FANVUE_FEE_RATE / 100));
  const agencyFeeCents = Math.round(normalizedFanvueNet * AGENCY_FEE_RATE / 100);
  return {
    date: dateKey(date),
    grossCents: normalizedGross,
    fanvueNetCents: normalizedFanvueNet,
    ownerNetCents: Math.max(normalizedFanvueNet - agencyFeeCents, 0),
    agencyFeeCents
  };
}

function profitForAggregate(snapshot) {
  const fanvueNetCents = snapshot?.fanvueNetCents ?? snapshot?.revenueCents ?? 0;
  const grossCents = snapshot?.grossRevenueCents ?? deriveGrossFromNet(fanvueNetCents);
  const agencyFeeCents = Math.round(fanvueNetCents * AGENCY_FEE_RATE / 100);
  return {
    grossCents,
    fanvueNetCents,
    ownerNetCents: Math.max(fanvueNetCents - agencyFeeCents, 0),
    agencyFeeCents
  };
}

function zeroTotals() {
  return { grossCents: 0, fanvueNetCents: 0, ownerNetCents: 0, agencyFeeCents: 0 };
}

function deriveGrossFromNet(fanvueNetCents) {
  return Math.round((fanvueNetCents || 0) / (1 - FANVUE_FEE_RATE / 100));
}

function metricValue(point) {
  if (state.metricMode === "gross") return point.grossCents;
  if (state.metricMode === "fanvueNet") return point.fanvueNetCents;
  return point.ownerNetCents;
}

function metricLabel(metric) {
  return {
    gross: "Gross revenue",
    fanvueNet: "Fanvue net",
    ownerNet: "Owner net"
  }[metric] || "Owner net";
}

function topSourceForModel(model) {
  const snapshot = latestSnapshotForModel(model.id);
  if (!snapshot) return { label: "None", value: 0, share: 0 };

  const rows = sourceRows(snapshot);
  const total = sum(rows.map((row) => row.value));
  const top = rows.sort((a, b) => b.value - a.value)[0];
  if (!top?.value || !total) return { label: "None", value: 0, share: 0 };
  return { ...top, share: top.value / total };
}

function sourceRows(snapshot) {
  return [
    { label: "Messages", value: snapshot.messageRevenueCents || 0 },
    { label: "Renewals", value: snapshot.renewalRevenueCents || 0 },
    { label: "Tips", value: snapshot.tipsCents || 0 },
    { label: "Subscriptions", value: snapshot.subscriptionRevenueCents || 0 },
    { label: "Posts", value: snapshot.postRevenueCents || 0 },
    { label: "Referrals", value: snapshot.referralRevenueCents || 0 },
    { label: "Other", value: snapshot.otherRevenueCents || 0 }
  ];
}

function agencyPayoutPeriods() {
  const anchor = parseDateKey(state.dateTo) || new Date();
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  return {
    fifteenth: {
      label: "Due 15th",
      start: dateKey(new Date(year, month, 1)),
      end: dateKey(new Date(year, month, 15))
    },
    twentySeventh: {
      label: "Due 27th",
      start: dateKey(new Date(year, month, 16)),
      end: dateKey(new Date(year, month, 27))
    }
  };
}

function currentAgencyPeriod() {
  const periods = agencyPayoutPeriods();
  const day = (parseDateKey(state.dateTo) || new Date()).getDate();
  return day <= 15 ? periods.fifteenth : periods.twentySeventh;
}

function payoutTotalForModel(model, period) {
  return sum(dailyPointsForModel(model)
    .filter((point) => dateInRange(point.date, period.start, period.end))
    .map((point) => point.agencyFeeCents));
}

function latestSnapshotForModel(modelId) {
  return state.snapshots
    .filter((snapshot) => snapshot.modelId === modelId)
    .sort((a, b) => new Date(a.capturedAt) - new Date(b.capturedAt))
    .at(-1) ?? null;
}

function selectedModel() {
  return state.models.find((model) => model.id === state.selectedModelId) ?? null;
}

function canSyncModel(model) {
  return Boolean(model?.fanvueOAuth?.connected || model?.apiTokenConfigured);
}

async function syncSelected() {
  const model = selectedModel();
  if (!model) return;
  await syncModelById(model.id, document.querySelector("#syncSelectedButton"));
}

async function syncModelById(modelId, button) {
  await withBusyButton(button, "Syncing", async () => {
    await api(`/api/models/${modelId}/sync`, { method: "POST" });
    showToast("Sync completed");
    await loadSummary();
  });
}

async function testSelected() {
  const model = selectedModel();
  if (!model) return;
  await testModelById(model.id, document.querySelector("#testConnectionButton"));
}

async function testModelById(modelId, button) {
  await withBusyButton(button, "Testing", async () => {
    await api(`/api/models/${modelId}/test`, { method: "POST" });
    showToast("Connection test passed");
    await loadSummary();
  });
}

async function connectSelectedFanvue() {
  const model = selectedModel();
  if (!model) return;
  await connectFanvueById(model.id);
}

async function connectFanvueById(modelId) {
  try {
    const result = await api(`/api/models/${modelId}/fanvue/connect`, { method: "POST" });
    window.location.href = result.authorizationUrl;
  } catch (error) {
    showToast(error.message);
  }
}

async function disconnectSelectedFanvue() {
  const model = selectedModel();
  if (!model) return;
  await disconnectFanvueById(model.id);
}

async function disconnectFanvueById(modelId) {
  const model = state.models.find((item) => item.id === modelId);
  if (!model) return;

  const confirmed = confirm(`Disconnect Fanvue OAuth for ${model.displayName}? Existing revenue data will stay.`);
  if (!confirmed) return;

  await api(`/api/models/${modelId}/fanvue/disconnect`, { method: "POST" });
  showToast("Fanvue disconnected");
  await loadSummary();
}

async function syncAll() {
  await withBusyButton(document.querySelector("#syncAllButton"), "Syncing", async () => {
    const result = await api("/api/sync-all", { method: "POST" });
    const failures = result.results.filter((item) => item.status === "error").length;
    showToast(failures ? `Sync finished with ${failures} failure${failures === 1 ? "" : "s"}` : "All models synced");
    await loadSummary();
  });
}

async function deleteSelected() {
  const model = selectedModel();
  if (!model) return;

  const confirmed = confirm(`Delete ${model.displayName} and its stored revenue data?`);
  if (!confirmed) return;

  await api(`/api/models/${model.id}`, { method: "DELETE" });
  state.selectedModelId = null;
  showToast("Model deleted");
  await loadSummary();
}

function openModelDialog(model = null) {
  state.editingModelId = model?.id ?? null;
  state.pendingAvatarUrl = model?.avatarUrl ?? null;
  state.clearAvatar = false;
  elements.formError.textContent = "";
  elements.modelFormTitle.textContent = model ? "Edit Fanvue model" : "Add Fanvue model";
  elements.modelSubmitButton.textContent = model ? "Save model" : "Create model";
  elements.modelForm.displayName.value = model?.displayName ?? "";
  elements.modelForm.syncIntervalMinutes.value = model?.syncIntervalMinutes ?? 60;
  elements.modelForm.chartColor.value = model?.chartColor || MODEL_COLORS[0];
  elements.modelForm.enabled.checked = model?.enabled ?? true;
  document.querySelector("#avatarInput").value = "";
  renderAvatarPreview(state.pendingAvatarUrl, model?.displayName);
  elements.modelDialog.showModal();
}

function closeDialog() {
  elements.modelDialog.close();
}

async function saveModel(event) {
  event.preventDefault();
  elements.formError.textContent = "";

  const submitButton = elements.modelForm.querySelector('button[type="submit"]');
  const originalText = submitButton.textContent;
  submitButton.disabled = true;
  submitButton.textContent = "Saving";

  const payload = {
    displayName: elements.modelForm.displayName.value,
    apiBaseUrl: DEFAULT_FANVUE_API_BASE_URL,
    endpointPath: DEFAULT_FANVUE_ENDPOINT,
    syncIntervalMinutes: Number(elements.modelForm.syncIntervalMinutes.value),
    chartColor: elements.modelForm.chartColor.value,
    enabled: elements.modelForm.enabled.checked,
    clearAvatar: state.clearAvatar
  };
  if (state.pendingAvatarUrl) payload.avatarUrl = state.pendingAvatarUrl;

  try {
    if (state.editingModelId) {
      await api(`/api/models/${state.editingModelId}`, { method: "PATCH", body: payload });
      showToast("Fanvue model updated");
    } else {
      const created = await api("/api/models", { method: "POST", body: payload });
      state.selectedModelId = created.id;
      showToast("Fanvue model added");
    }
    closeDialog();
    await loadSummary();
  } catch (error) {
    elements.formError.textContent = error.message;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = originalText;
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: options.body ? { "content-type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

async function withBusyButton(button, label, task) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = label;
  try {
    await task();
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function detailRows(rows) {
  return rows.map(([label, value]) => `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value ?? "")}</dd>
    </div>
  `).join("");
}

function handleOAuthReturnParams() {
  const params = new URLSearchParams(window.location.search);
  const fanvue = params.get("fanvue");
  const modelId = params.get("modelId");
  if (!fanvue) return;

  if (modelId) state.selectedModelId = modelId;
  if (fanvue === "connected") showToast("Fanvue connected");
  if (fanvue === "error") showToast(params.get("message") || "Fanvue connection failed");
  window.history.replaceState({}, document.title, window.location.pathname);
}

function fanvueConfigLabel() {
  return state.fanvueStatus.configured ? "Ready to connect" : "Set FANVUE_CLIENT_ID, FANVUE_CLIENT_SECRET, and FANVUE_REDIRECT_URI in .env";
}

function fanvueProfileLabel(profile) {
  if (!profile) return "Connected";
  return profile.handle || profile.displayName || profile.email || profile.uuid || "Connected";
}

function statusClass(status) {
  if (status === "ok") return "ok";
  if (status === "error") return "error";
  return "pending";
}

function statusLabel(status) {
  return {
    ok: "Healthy",
    error: "Failing",
    pending: "Pending"
  }[status] || status || "Pending";
}

function trendName(value) {
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "flat";
}

function dateInRange(date, from, to) {
  const key = dateKey(date);
  return (!from || key >= from) && (!to || key <= to);
}

function dateKey(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function parseDateKey(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function monthStart(value) {
  const date = parseDateKey(value) || new Date();
  return dateKey(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)));
}

function periodLabel() {
  const labels = {
    today: "Today (since midnight)",
    yesterday: "Yesterday",
    last7: "Last 7 days",
    last14: "Last 14 days",
    last30: "Last 30 days",
    thisMonth: "This month"
  };
  if (labels[state.periodPreset]) return labels[state.periodPreset];
  if (!state.dateFrom || !state.dateTo) return "Selected period";
  return `${formatShortDate(state.dateFrom)} to ${formatShortDate(state.dateTo)}`;
}

function periodBoundsFromPreset(preset, custom = {}) {
  const today = startOfUtcDay(new Date());
  const endDate = dateKey(today);

  if (preset === "today") return { preset, startDate: endDate, endDate };
  if (preset === "yesterday") {
    const key = dateKey(shiftUtcDays(today, -1));
    return { preset, startDate: key, endDate: key };
  }
  if (preset === "last7") return { preset, startDate: dateKey(shiftUtcDays(today, -6)), endDate };
  if (preset === "last14") return { preset, startDate: dateKey(shiftUtcDays(today, -13)), endDate };
  if (preset === "last30") return { preset, startDate: dateKey(shiftUtcDays(today, -29)), endDate };
  if (preset === "thisMonth") {
    return { preset, startDate: dateKey(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))), endDate };
  }
  if (preset === "allTime") {
    return { preset, startDate: custom.allTimeStart || dateKey(shiftUtcDays(today, -89)), endDate };
  }
  return {
    preset: "custom",
    startDate: custom.startDate || endDate,
    endDate: custom.endDate || endDate
  };
}

function comparisonPeriodLabel() {
  const labels = {
    last7: "Last 7 days",
    last14: "Last 14 days",
    last30: "Last 30 days",
    allTime: "All time"
  };
  return labels[state.comparisonPeriodPreset] || "Selected period";
}

function modelAvatarHtml(model, color, options = {}) {
  const label = model?.displayName || "Model";
  const classes = ["model-avatar", options.small ? "is-small" : ""].filter(Boolean).join(" ");
  if (model?.avatarUrl) {
    return `<span class="${classes}" style="--model-color:${color}"><img src="${escapeHtml(model.avatarUrl)}" alt="${escapeHtml(label)}"></span>`;
  }
  const initial = escapeHtml(label.trim().charAt(0).toUpperCase() || "?");
  return `<span class="${classes}" style="--model-color:${color}">${initial}</span>`;
}

function renderAvatarPreview(avatarUrl, displayName = "Model") {
  const preview = document.querySelector("#avatarPreview");
  preview.innerHTML = avatarUrl
    ? `<img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(displayName)}">`
    : `<span>${escapeHtml(displayName.trim().charAt(0).toUpperCase() || "?")}</span>`;
}

async function onAvatarSelected(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > 220_000) {
    showToast("Choose a smaller image (under 200KB).");
    event.target.value = "";
    return;
  }
  const dataUrl = await readFileAsDataUrl(file);
  state.pendingAvatarUrl = dataUrl;
  state.clearAvatar = false;
  renderAvatarPreview(dataUrl, elements.modelForm.displayName.value || "Model");
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.readAsDataURL(file);
  });
}

function modelColor(model, index) {
  return model?.chartColor || MODEL_COLORS[index % MODEL_COLORS.length];
}

function modelInsights(model) {
  const snapshot = latestSnapshotForModel(model.id);
  const tracking = snapshot?.trackingSummary;
  const audience = snapshot?.audienceSummary;
  const zero = { linkCount: 0, clicks: 0, subscribers: 0, followers: 0, grossRevenueCents: 0, netRevenueCents: 0 };
  const audienceDaily = (audience?.daily || []).filter((row) => dateInRange(row.date, state.dateFrom, state.dateTo));
  const links = Array.isArray(tracking?.links) ? tracking.links : [];
  const internal = aggregateLinkStats(links.filter((link) => link.channel === "internal"));
  const external = aggregateLinkStats(links.filter((link) => link.channel === "external"));

  return {
    newSubscribers: sum(audienceDaily.map((row) => row.newSubscribers)) || audience?.newSubscribers || 0,
    newFollowers: sum(audienceDaily.map((row) => row.newFollowers)) || audience?.newFollowers || 0,
    internal: links.length ? internal : (tracking?.internal || zero),
    external: links.length ? external : (tracking?.external || zero),
    externalRevenueCents: external.netRevenueCents,
    links,
    audienceDaily,
    dataNote: buildInsightsNote(snapshot)
  };
}

function aggregateLinkStats(links) {
  return {
    linkCount: links.length,
    clicks: sum(links.map((link) => link.clicks)),
    subscribers: sum(links.map((link) => link.subscribers)),
    followers: sum(links.map((link) => link.followers)),
    grossRevenueCents: sum(links.map((link) => link.grossRevenueCents)),
    netRevenueCents: sum(links.map((link) => link.netRevenueCents))
  };
}

function buildInsightsNote(snapshot) {
  if (!snapshot?.contentErrors) return "";
  const errors = Object.entries(snapshot.contentErrors).filter(([, message]) => message);
  return errors.length ? errors.map(([key, message]) => `${key}: ${message}`).join(" · ") : "";
}

function comparisonPointsForModel(model, insights, dates) {
  if (["subscribers", "followers"].includes(state.comparisonMetric)) {
    const dailyMap = new Map(insights.audienceDaily.map((row) => [row.date, row]));
    return dates.map((date) => ({
      date,
      value: state.comparisonMetric === "subscribers"
        ? (dailyMap.get(date)?.newSubscribers || 0)
        : (dailyMap.get(date)?.newFollowers || 0)
    }));
  }

  if (state.comparisonMetric === "externalRevenue") {
    const perDay = Math.round((insights.externalRevenueCents || 0) / Math.max(dates.length, 1));
    return dates.map((date) => ({ date, value: perDay }));
  }

  const revenueMetric = state.comparisonMetric === "gross"
    ? "gross"
    : state.comparisonMetric === "fanvueNet"
      ? "fanvueNet"
      : "ownerNet";
  const previousMetric = state.metricMode;
  state.metricMode = revenueMetric;
  const points = pointsForModel(model, dates).map((point) => ({
    date: point.date,
    value: metricValue(point)
  }));
  state.metricMode = previousMetric;
  return points;
}

function comparisonMetricLabel(metric) {
  return {
    gross: "Gross revenue",
    fanvueNet: "Fanvue net",
    ownerNet: "Owner net",
    subscribers: "New subscribers",
    followers: "New followers",
    externalRevenue: "External link revenue"
  }[metric] || "Owner net";
}

function comparisonMetricFormatter(metric) {
  if (["subscribers", "followers"].includes(metric)) return formatCount;
  if (metric === "externalRevenue") return formatMoney;
  return formatMoney;
}

function formatTrafficCell(stats) {
  return `${formatCount(stats.subscribers)} subs · ${formatCount(stats.followers)} foll`;
}

function formatCount(value = 0) {
  return new Intl.NumberFormat("en-US").format(Number(value) || 0);
}

function switchModelTab(tab) {
  state.modelTab = tab;
  renderModelTabPanels(selectedModel());
  if (tab === "vault") loadVaultContent(false);
  if (tab === "posts") loadPostsContent(false);
}

function renderModelTabPanels(model) {
  document.querySelectorAll("[data-model-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.modelTab === state.modelTab);
  });
  document.querySelector("#modelTabOverview").hidden = state.modelTab !== "overview";
  document.querySelector("#modelTabVault").hidden = state.modelTab !== "vault";
  document.querySelector("#modelTabPosts").hidden = state.modelTab !== "posts";
  if (!model) return;
  if (state.modelTab === "vault") renderVaultPanel(model, state.contentCache.vault.get(model.id));
  if (state.modelTab === "posts") renderPostsPanel(model, state.contentCache.posts.get(model.id));
}

async function loadVaultContent(force) {
  const model = selectedModel();
  if (!model) return;
  if (!force && state.contentCache.vault.has(model.id)) {
    renderVaultPanel(model, state.contentCache.vault.get(model.id));
    return;
  }
  elements.vaultContent.innerHTML = `<div class="chart-empty compact-empty">Loading vault...</div>`;
  try {
    const payload = await api(`/api/models/${model.id}/content/vault`);
    state.contentCache.vault.set(model.id, payload);
    renderVaultPanel(model, payload);
  } catch (error) {
    elements.vaultContent.innerHTML = `<div class="chart-empty compact-empty">${escapeHtml(error.message)}</div>`;
  }
}

async function loadPostsContent(force) {
  const model = selectedModel();
  if (!model) return;
  if (!force && state.contentCache.posts.has(model.id)) {
    renderPostsPanel(model, state.contentCache.posts.get(model.id));
    return;
  }
  elements.postsSubtitle.textContent = "Loading posts...";
  try {
    const payload = await api(`/api/models/${model.id}/content/posts`);
    state.contentCache.posts.set(model.id, payload);
    renderPostsPanel(model, payload);
  } catch (error) {
    elements.postsSubtitle.textContent = error.message;
    elements.postsRows.innerHTML = `<tr><td colspan="5">${escapeHtml(error.message)}</td></tr>`;
  }
}

function renderVaultPanel(model, payload) {
  if (!payload) {
    elements.vaultSubtitle.textContent = "Vault not loaded yet";
    elements.vaultContent.innerHTML = `<div class="chart-empty compact-empty">Open this tab to load vault folders.</div>`;
    return;
  }
  elements.vaultSubtitle.textContent = `${payload.folderCount} folders · ${payload.mediaCount} media items`;
  if (payload.warning) {
    elements.vaultContent.innerHTML = `<div class="chart-empty compact-empty">${escapeHtml(payload.warning)}</div>`;
    return;
  }

  elements.vaultContent.innerHTML = payload.folders.map((folder) => `
    <article class="content-card">
      <header>
        <strong>${escapeHtml(folder.name)}</strong>
        <span>${folder.mediaCount} items</span>
      </header>
      <div class="media-grid">
        ${folder.media.slice(0, 24).map((item) => `
          <div class="media-tile">
            ${item.thumbnailUrl ? `<img src="${escapeHtml(item.thumbnailUrl)}" alt="">` : `<span>${escapeHtml(item.mediaType)}</span>`}
            <small>${escapeHtml(item.name)}</small>
          </div>
        `).join("") || `<span class="empty-note">No media in this folder.</span>`}
      </div>
    </article>
  `).join("") || `<div class="chart-empty compact-empty">Vault is empty.</div>`;
}

function renderPostsPanel(model, payload) {
  if (!payload) {
    elements.postsSubtitle.textContent = "Posts not loaded yet";
    elements.postsRows.innerHTML = `<tr><td colspan="5">Open this tab to load posts.</td></tr>`;
    return;
  }
  const counts = payload.counts || {};
  if (payload.warning) {
    elements.postsSubtitle.textContent = payload.warning;
    elements.postsRows.innerHTML = `<tr><td colspan="5">${escapeHtml(payload.warning)}</td></tr>`;
    return;
  }

  elements.postsSubtitle.textContent = `${payload.total} posts · ${counts.published || 0} published · ${counts.scheduled || 0} scheduled · ${counts.draft || 0} draft`;
  elements.postsRows.innerHTML = payload.posts.map((post) => `
    <tr>
      <td>${escapeHtml(post.title)}</td>
      <td><span class="pill">${escapeHtml(post.status)}</span></td>
      <td>${formatCount(post.mediaCount)}</td>
      <td>${post.priceCents ? formatMoney(post.priceCents) : "—"}</td>
      <td>${formatDate(post.publishedAt || post.createdAt)}</td>
    </tr>
  `).join("") || `<tr><td colspan="5">No posts returned by Fanvue API.</td></tr>`;
}

function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function shiftUtcDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatMoney(cents = 0) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format((cents || 0) / 100);
}

function formatPercent(value = 0) {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 1
  }).format(value || 0);
}

function formatDate(value) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatShortDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric"
  }).format(new Date(`${dateKey(value)}T00:00:00.000Z`));
}

function sum(values) {
  return values.reduce((total, value) => total + (Number(value) || 0), 0);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => {
    elements.toast.classList.remove("show");
  }, 3200);
}
