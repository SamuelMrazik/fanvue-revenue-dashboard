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
  contentRequests: [],
  driveLinks: [],
  totals: {},
  fanvueStatus: { configured: false },
  workspaceView: "overview",
  selectedModelId: null,
  editingModelId: null,
  periodPreset: "allTime",
  dateFrom: "",
  dateTo: "",
  metricMode: "gross",
  comparisonMetric: "gross",
  comparisonPeriodPreset: "allTime",
  chartVisibleModels: new Set(),
  chartAnimateSeen: new Map(),
  chartWorkspaceKey: "",
  settings: {
    autoSyncEnabled: true,
    autoSyncIntervalMinutes: 60
  },
  trafficModelFilter: "",
  pendingAvatarUrl: null,
  clearAvatar: false,
  modelTab: "overview",
  vaRequestModelId: null,
  driveLinkModelId: null,
  contentCache: {
    vault: new Map(),
    posts: new Map()
  }
};

const elements = {
  overviewButton: document.querySelector("#overviewButton"),
  settingsButton: document.querySelector("#settingsButton"),
  settingsView: document.querySelector("#settingsView"),
  settingsForm: document.querySelector("#settingsForm"),
  autoSyncEnabledInput: document.querySelector("#autoSyncEnabledInput"),
  autoSyncIntervalInput: document.querySelector("#autoSyncIntervalInput"),
  settingsFormError: document.querySelector("#settingsFormError"),
  contentDriveButton: document.querySelector("#contentDriveButton"),
  contentDriveNavCount: document.querySelector("#contentDriveNavCount"),
  overviewView: document.querySelector("#overviewView"),
  contentDriveView: document.querySelector("#contentDriveView"),
  modelView: document.querySelector("#modelView"),
  trackingEmpty: document.querySelector("#trackingEmpty"),
  pageTitle: document.querySelector("#pageTitle"),
  modelList: document.querySelector("#modelList"),
  modelsSectionLabel: document.querySelector("#modelsSectionLabel"),
  syncSummary: document.querySelector("#syncSummary"),
  periodPresetInput: document.querySelector("#periodPresetInput"),
  customFromField: document.querySelector("#customFromField"),
  customToField: document.querySelector("#customToField"),
  dateFromInput: document.querySelector("#dateFromInput"),
  dateToInput: document.querySelector("#dateToInput"),
  metricModeInput: document.querySelector("#metricModeInput"),
  modelTableSubtitle: document.querySelector("#modelTableSubtitle"),
  syncHintBanner: document.querySelector("#syncHintBanner"),
  vaRequestsStrip: document.querySelector("#vaRequestsStrip"),
  openVaRequestsCount: document.querySelector("#openVaRequestsCount"),
  vaultSubtitle: document.querySelector("#vaultSubtitle"),
  vaultContent: document.querySelector("#vaultContent"),
  postsSubtitle: document.querySelector("#postsSubtitle"),
  postsRows: document.querySelector("#postsRows"),
  primaryMetricValue: document.querySelector("#primaryMetricValue"),
  primaryMetricSubtext: document.querySelector("#primaryMetricSubtext"),
  overviewGross: document.querySelector("#overviewGross"),
  overviewAgencyDue: document.querySelector("#overviewAgencyDue"),
  comparisonSubtitle: document.querySelector("#comparisonSubtitle"),
  comparisonChart: document.querySelector("#comparisonChart"),
  chartModelToggles: document.querySelector("#chartModelToggles"),
  modelPerformanceRows: document.querySelector("#modelPerformanceRows"),
  trafficPanelSubtitle: document.querySelector("#trafficPanelSubtitle"),
  trafficModelFilter: document.querySelector("#trafficModelFilter"),
  trafficProfitRows: document.querySelector("#trafficProfitRows"),
  contentDriveSubtitle: document.querySelector("#contentDriveSubtitle"),
  contentDriveRequests: document.querySelector("#contentDriveRequests"),
  modelProfileHeader: document.querySelector("#modelProfileHeader"),
  modelContentSubtitle: document.querySelector("#modelContentSubtitle"),
  modelContentSummary: document.querySelector("#modelContentSummary"),
  modelContentRequests: document.querySelector("#modelContentRequests"),
  modelDriveLinks: document.querySelector("#modelDriveLinks"),
  modelTrackingSubtitle: document.querySelector("#modelTrackingSubtitle"),
  modelTrafficSplit: document.querySelector("#modelTrafficSplit"),
  modelTrackingRows: document.querySelector("#modelTrackingRows"),
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
document.querySelector("#syncHintButton")?.addEventListener("click", () => syncAll());
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
  state.workspaceView = "overview";
  render();
});
elements.settingsButton.addEventListener("click", () => {
  state.selectedModelId = null;
  state.workspaceView = "settings";
  render();
});
elements.settingsForm?.addEventListener("submit", saveSettings);
elements.contentDriveButton.addEventListener("click", () => {
  state.selectedModelId = null;
  state.workspaceView = "contentDrive";
  render();
});
document.querySelector("#vaRequestsStripButton")?.addEventListener("click", () => {
  state.workspaceView = "contentDrive";
  render();
});
document.querySelector("#addVaRequestButton")?.addEventListener("click", () => openVaRequestDialog());
document.querySelector("#addModelVaRequestButton")?.addEventListener("click", () => openVaRequestDialog(selectedModel()?.id));
document.querySelector("#addDriveLinkButton")?.addEventListener("click", () => openDriveLinkDialog(selectedModel()?.id));
document.querySelector("#vaRequestForm")?.addEventListener("submit", saveVaRequest);
document.querySelector("#driveLinkForm")?.addEventListener("submit", saveDriveLink);
document.querySelector("#closeVaRequestButton")?.addEventListener("click", closeVaRequestDialog);
document.querySelector("#cancelVaRequestButton")?.addEventListener("click", closeVaRequestDialog);
document.querySelector("#closeDriveLinkButton")?.addEventListener("click", closeDriveLinkDialog);
document.querySelector("#cancelDriveLinkButton")?.addEventListener("click", closeDriveLinkDialog);
document.querySelectorAll("[data-comparison-metric]").forEach((button) => {
  button.addEventListener("click", () => {
    state.comparisonMetric = button.dataset.comparisonMetric;
    render();
  });
});
elements.trafficModelFilter?.addEventListener("change", () => {
  state.trafficModelFilter = elements.trafficModelFilter.value;
  render();
});
elements.periodPresetInput.addEventListener("change", updatePeriodControls);
elements.dateFromInput.addEventListener("change", updatePeriodControls);
elements.dateToInput.addEventListener("change", updatePeriodControls);
elements.metricModeInput.addEventListener("change", updatePeriodControls);
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
    state.contentRequests = summary.contentRequests || [];
    state.driveLinks = summary.driveLinks || [];
    state.settings = summary.settings || state.settings;
    state.totals = summary.totals;
    state.fanvueStatus = fanvueStatus;

    if (state.selectedModelId && !state.models.some((model) => model.id === state.selectedModelId)) {
      state.selectedModelId = null;
    }

    ensureChartVisibility();
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
  const isOverview = !isModelView && state.workspaceView === "overview";
  const isContentDrive = !isModelView && state.workspaceView === "contentDrive";
  const isSettings = !isModelView && state.workspaceView === "settings";
  const openRequests = openRequestCount();

  elements.pageTitle.textContent = selected
    ? selected.displayName
    : isContentDrive
      ? "Content Requests"
      : isSettings
        ? "Settings"
        : "Dashboard";
  elements.syncSummary.textContent = `${openRequests} open content request${openRequests === 1 ? "" : "s"} · ${state.models.length} model${state.models.length === 1 ? "" : "s"}`;
  elements.trackingEmpty.hidden = state.models.length > 0;
  elements.overviewView.hidden = !isOverview;
  elements.contentDriveView.hidden = !isContentDrive;
  elements.settingsView.hidden = !isSettings;
  elements.modelView.hidden = !isModelView;
  elements.overviewButton.classList.toggle("active", isOverview);
  elements.contentDriveButton.classList.toggle("active", isContentDrive);
  elements.settingsButton?.classList.toggle("active", isSettings);
  elements.contentDriveNavCount.textContent = String(openRequests);
  elements.modelsSectionLabel.textContent = `Models (${state.models.length})`;
  document.querySelector("#syncAllButton").disabled = !state.models.some(canSyncModel);
  elements.periodPresetInput.value = state.periodPreset;
  elements.customFromField.hidden = state.periodPreset !== "custom";
  elements.customToField.hidden = state.periodPreset !== "custom";
  elements.dateFromInput.value = state.dateFrom;
  elements.dateToInput.value = state.dateTo;
  elements.metricModeInput.value = state.metricMode;
  document.querySelectorAll("[data-comparison-period]").forEach((button) => {
    button.classList.toggle("active", button.dataset.comparisonPeriod === state.comparisonPeriodPreset);
  });
  document.querySelectorAll("[data-comparison-metric]").forEach((button) => {
    button.classList.toggle("active", button.dataset.comparisonMetric === state.comparisonMetric);
  });
  const workspaceKey = `${state.workspaceView}:${state.selectedModelId || ""}:${state.modelTab}`;
  if (workspaceKey !== state.chartWorkspaceKey) {
    state.chartAnimateSeen = new Map();
    state.chartWorkspaceKey = workspaceKey;
  }

  renderVaRequestsStrip(openRequests);
  renderSyncHint();
  renderModels();
  if (isOverview) renderOverview();
  if (isContentDrive) renderContentDrive();
  if (isSettings) renderSettings();
  if (isModelView) {
    renderModelProfileHeader(selected);
    renderModelView(selected);
    renderLogs(selected);
    renderConnection(selected);
    renderModelTabPanels(selected);
  }
}

function renderModels() {
  if (!state.models.length) {
    elements.modelList.innerHTML = `<p class="empty-note">No models yet.</p>`;
    return;
  }

  elements.modelList.innerHTML = state.models.map((model, index) => {
    const active = model.id === state.selectedModelId ? "active" : "";
    const color = modelColor(model, index);
    const totalRevenue = periodTotalsForModel(model).ownerNetCents;
    return `
      <button class="model-item ${active}" type="button" data-model-id="${escapeHtml(model.id)}">
        ${modelAvatarHtml(model, color)}
        <span class="model-copy">
          <strong>${escapeHtml(model.displayName)}</strong>
          <span class="model-sidebar-meta">
            <small class="model-total-revenue">${formatMoney(totalRevenue)} total revenue</small>
          </span>
        </span>
      </button>
    `;
  }).join("");

  elements.modelList.querySelectorAll("[data-model-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedModelId = button.dataset.modelId;
      state.workspaceView = "overview";
      render();
    });
  });
}

function renderOverview() {
  const periodRows = state.models.map((model, index) => {
    const totals = periodTotalsForModel(model);
    const insights = modelInsights(model);
    const priorInsights = modelInsightsForPriorPeriod(model);
    return {
      model,
      color: modelColor(model, index),
      totals,
      insights,
      priorInsights,
      topSource: topSourceForModel(model)
    };
  });
  const grossCents = sum(periodRows.map((row) => row.totals.grossCents));
  const fanvueNetCents = sum(periodRows.map((row) => row.totals.fanvueNetCents));
  const ownerNetCents = sum(periodRows.map((row) => row.totals.ownerNetCents));

  const hasSnapshots = state.snapshots.length > 0;
  const needsSync = state.models.length > 0 && !hasSnapshots;

  elements.primaryMetricValue.textContent = formatMoney(grossCents);
  elements.primaryMetricSubtext.textContent = needsSync
    ? "Models found — run Sync all to load revenue"
    : periodLabel();
  elements.modelTableSubtitle.textContent = needsSync
    ? "No synced snapshots yet — click Sync all in the top bar"
    : `${periodLabel()} · sorted by gross`;
  elements.overviewGross.textContent = formatMoney(fanvueNetCents);
  elements.overviewAgencyDue.textContent = formatMoney(ownerNetCents);

  renderTrafficModelFilter();
  renderComparisonChart(periodRows);
  renderChartModelToggles(periodRows);
  renderPerformanceTable(periodRows);
  renderTrafficProfitPanel(periodRows);
}

function renderComparisonChart(rows) {
  const dates = comparisonDateRange();
  const series = rows
    .filter((row) => state.chartVisibleModels.has(row.model.id))
    .map((row) => ({
      label: row.model.displayName,
      color: row.color,
      avatarUrl: row.model.avatarUrl || "",
      points: comparisonPointsForModel(row.model, row.insights, dates)
    }));

  elements.comparisonSubtitle.textContent = `${comparisonMetricLabel(state.comparisonMetric)} · ${comparisonPeriodLabel()}`;
  mountChart(elements.comparisonChart, {
    series,
    dates,
    formatValue: comparisonMetricFormatter(state.comparisonMetric),
    emptyMessage: "Turn on models below or sync data to compare.",
    animateKey: chartAnimateKey("dashboard-comparison", [...state.chartVisibleModels].sort().join(","), state.comparisonMetric, state.comparisonPeriodPreset)
  });
}

function renderChartModelToggles(rows) {
  if (!elements.chartModelToggles) return;
  elements.chartModelToggles.innerHTML = rows.map((row) => {
    const active = state.chartVisibleModels.has(row.model.id);
    return `
      <button class="chart-toggle ${active ? "active" : ""}" type="button" data-chart-model-id="${escapeHtml(row.model.id)}" style="--toggle-color:${row.color}">
        ${modelAvatarHtml(row.model, row.color, { small: true })}
        ${escapeHtml(row.model.displayName)}
      </button>
    `;
  }).join("") || `<span class="empty-note">Add models to compare them here.</span>`;

  elements.chartModelToggles.querySelectorAll("[data-chart-model-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const modelId = button.dataset.chartModelId;
      if (state.chartVisibleModels.has(modelId)) state.chartVisibleModels.delete(modelId);
      else state.chartVisibleModels.add(modelId);
      render();
    });
  });
}

function renderPerformanceTable(rows) {
  const sortedRows = [...rows].sort((a, b) => b.totals.grossCents - a.totals.grossCents);
  elements.modelPerformanceRows.innerHTML = sortedRows.map((row) => {
    const openRequests = openRequestCount(row.model.id);
    return `
    <tr>
      <td>
        <button class="table-model-button" type="button" data-row-model-id="${escapeHtml(row.model.id)}">
          ${modelAvatarHtml(row.model, row.color, { small: true })}
          <span class="table-model-copy">
            <strong>${escapeHtml(row.model.displayName)}</strong>
          </span>
        </button>
      </td>
      <td>${formatMoney(row.totals.grossCents)}</td>
      <td>${formatTrafficMetricCell(row.insights.totals)}</td>
      <td>${formatMoney(row.insights.totals.netRevenueCents)}</td>
      <td>${openRequests ? formatCount(openRequests) : "—"}</td>
    </tr>
  `;
  }).join("") || `<tr><td colspan="6">No models in this period.</td></tr>`;

  elements.modelPerformanceRows.querySelectorAll("[data-row-model-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedModelId = button.dataset.rowModelId;
      state.workspaceView = "overview";
      render();
    });
  });
}

function renderTrafficModelFilter() {
  if (!elements.trafficModelFilter) return;
  const current = state.trafficModelFilter;
  elements.trafficModelFilter.innerHTML = `
    <option value="">All models</option>
    ${state.models.map((model) => `<option value="${escapeHtml(model.id)}">${escapeHtml(model.displayName)}</option>`).join("")}
  `;
  elements.trafficModelFilter.value = current;
}

function renderTrafficProfitPanel(rows) {
  const filteredRows = state.trafficModelFilter
    ? rows.filter((row) => row.model.id === state.trafficModelFilter)
    : rows;
  const linkRows = [];
  for (const row of filteredRows) {
    for (const link of row.insights.links) {
      linkRows.push({
        model: row.model,
        color: row.color,
        link,
        grossShare: row.totals.grossCents
      });
    }
  }

  linkRows.sort((a, b) => (b.link.netRevenueCents || 0) - (a.link.netRevenueCents || 0));
  const hasSyncGap = filteredRows.some((row) => row.insights.dataNote);
  elements.trafficPanelSubtitle.textContent = linkRows.length
    ? `${linkRows.length} links · total tracking performance · ${periodLabel()}`
    : hasSyncGap
      ? "Sync models to load tracking links."
      : "No tracking links for this filter.";

  elements.trafficProfitRows.innerHTML = linkRows.map((row) => `
    <tr>
      <td>
        <span class="table-model-inline">
          ${modelAvatarHtml(row.model, row.color, { small: true })}
          ${escapeHtml(row.model.displayName)}
        </span>
      </td>
      <td>${escapeHtml(row.link.name)}</td>
      <td>${formatTrafficMetricCell(row.link)}</td>
      <td>${formatMoney(row.link.netRevenueCents)}</td>
      <td>${formatMoney(row.grossShare)}</td>
    </tr>
  `).join("") || `<tr><td colspan="5">Sync all models to rank links by profitability.</td></tr>`;
}

function renderVaRequestsStrip(openRequests) {
  if (!elements.vaRequestsStrip) return;
  elements.vaRequestsStrip.hidden = openRequests <= 0;
  elements.openVaRequestsCount.textContent = String(openRequests);
}

function renderSyncHint() {
  if (!elements.syncHintBanner) return;
  const connected = state.models.filter(canSyncModel).length;
  const hasSnapshots = state.snapshots.length > 0;
  elements.syncHintBanner.hidden = !(connected > 0 && !hasSnapshots);
}

function renderModelProfileHeader(model) {
  if (!model || !elements.modelProfileHeader) return;
  const index = state.models.findIndex((item) => item.id === model.id);
  const color = modelColor(model, Math.max(index, 0));
  const totals = periodTotalsForModel(model);

  elements.modelProfileHeader.innerHTML = `
    <div class="model-profile-card">
      ${modelAvatarHtml(model, color)}
      <div>
        <h2>${escapeHtml(model.displayName)}</h2>
        <div class="model-profile-meta">
          <span>${formatMoney(totals.grossCents)} gross · ${periodLabel()}</span>
        </div>
      </div>
    </div>
    <div class="pill-group profile-period-pills" role="group" aria-label="Timeline">
      ${["last7", "last14", "last30", "allTime"].map((preset) => `
        <button class="pill-button ${state.periodPreset === preset ? "active" : ""}" type="button" data-profile-period="${preset}">
          ${preset === "last7" ? "7d" : preset === "last14" ? "14d" : preset === "last30" ? "30d" : "All"}
        </button>
      `).join("")}
    </div>
  `;

  elements.modelProfileHeader.querySelectorAll("[data-profile-period]").forEach((button) => {
    button.addEventListener("click", () => {
      applyPeriodPreset(button.dataset.profilePeriod);
      render();
    });
  });
}

function renderContentDrive() {
  const open = state.contentRequests.filter((request) => request.status === "open").length;
  elements.contentDriveSubtitle.textContent = `${open} open · ${state.contentRequests.length} total requests`;

  const groups = state.models.map((model) => {
    const requests = state.contentRequests.filter((request) => request.modelId === model.id);
    const openCount = requests.filter((request) => request.status === "open").length;
    return { model, requests, openCount };
  }).filter((group) => group.requests.length);

  elements.contentDriveRequests.innerHTML = groups.map((group) => `
    <section class="panel compact-panel">
      <div class="panel-header compact">
        <div>
          <h3>${escapeHtml(group.model.displayName)}</h3>
          <p>${group.openCount} open · ${group.requests.length} total</p>
        </div>
      </div>
      <div class="request-list">${renderRequestCards(group.requests, { showModel: false })}</div>
    </section>
  `).join("") || `<p class="empty-note">No content requests yet.</p>`;
  bindRequestCardActions(elements.contentDriveRequests);
}

function renderModelView(model) {
  if (!model) return;

  const totals = periodTotalsForModel(model);
  const topSource = topSourceForModel(model);

  elements.modelOwnerNet.textContent = formatMoney(totals.grossCents);
  elements.modelPeriodLabel.textContent = periodLabel();
  elements.modelGross.textContent = formatMoney(totals.fanvueNetCents);
  elements.modelAgencyDue.textContent = formatMoney(totals.ownerNetCents);
  elements.modelTopSource.textContent = topSource.label;
  elements.modelTopSourceShare.textContent = topSource.value ? `${formatMoney(topSource.value)} · ${formatPercent(topSource.share)}` : "No synced revenue";
  elements.modelChartTitle.textContent = `${model.displayName} daily ${metricLabel(state.metricMode).toLowerCase()}`;
  elements.modelChartSubtitle.textContent = periodLabel();

  const dates = selectedDateRange();
  const modelIndex = state.models.findIndex((item) => item.id === model.id);
  const color = modelColor(model, Math.max(modelIndex, 0));
  const points = pointsForModel(model, dates).map((point) => ({ date: point.date, value: metricValue(point) }));
  mountChart(elements.modelChart, {
    series: [{ label: model.displayName, color, avatarUrl: model.avatarUrl || "", points }],
    dates,
    formatValue: formatMoney,
    emptyMessage: "No daily earnings in this period yet.",
    animateKey: chartAnimateKey("model-revenue", model.id, state.periodPreset, state.dateFrom, state.dateTo)
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

  const sorted = [...rows].sort((a, b) => b.value - a.value);
  elements.revenueMix.innerHTML = sorted.map((row, index) => {
    const percent = row.value / total;
    const barColor = mixColor(index);
    return `
      <div class="mix-row" style="--mix-bar:${barColor}">
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
      <td>${formatMoney(row.fanvueNetCents)}</td>
      <td>${formatMoney(row.ownerNetCents)}</td>
    </tr>
  `).join("") || `<tr><td colspan="4">No daily earnings in this period.</td></tr>`;
}

function renderLogs(model) {
  const logs = model ? state.syncLogs.filter((log) => log.modelId === model.id) : state.syncLogs;
  const rows = logs.slice(0, 12).map((log) => `
    <tr>
      <td>${formatDate(log.finishedAt || log.startedAt)}</td>
      <td><span class="pill ${statusClass(log.status)}">${escapeHtml(syncStatusLabel(log.status))}</span></td>
      <td>${escapeHtml(log.message || "Completed")}</td>
    </tr>
  `);

  elements.syncLogRows.innerHTML = rows.join("") || `<tr><td colspan="3">No sync runs yet.</td></tr>`;
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
  const connectionMessage = model.lastError || syncStatusLabel(model.lastStatus);
  elements.connectionStatus.textContent = connectionMessage;
  elements.connectionStatus.classList.toggle("connection-error", Boolean(model.lastError));
  const contentErrors = contentErrorsForModel(model);
  const errorHint = contentErrors.length
    ? contentErrors.map((row) => `${row.key}: ${row.message}`).join(" · ")
    : "";
  const snapshot = latestSnapshotForModel(model.id);
  const syncDetails = snapshot?.syncDetails;
  const syncCoverage = syncDetails
    ? `${syncDetails.dailyEarningsPoints || 0} revenue days · ${syncDetails.trackingLinks || 0} links · ${syncDetails.audienceDays || 0} audience days`
    : "Run Sync to pull all-time revenue, tracking links, and audience metrics";

  elements.connectionDetails.innerHTML = detailRows([
    ["Fanvue", oauthConnected ? `Connected${model.fanvueOAuth.expiresAt ? ` until ${formatDate(model.fanvueOAuth.expiresAt)}` : ""}` : fanvueConfigLabel()],
    ["Profile", oauthConnected ? fanvueProfileLabel(model.fanvueOAuth.profile) : "Not connected"],
    ["Scopes", model.fanvueOAuth?.scope || state.fanvueStatus?.scopes || "—"],
    ["Last sync", model.lastSyncAt ? formatDate(model.lastSyncAt) : "Never"],
    ["Sync coverage", syncCoverage],
    ["Vault / posts", "Loaded on their tabs (not during background sync)"],
    ["Next sync", model.nextSyncAt ? formatDate(model.nextSyncAt) : "Not scheduled"],
    ["Interval", `${model.syncIntervalMinutes} minutes`],
    ["Enabled", model.enabled ? "Yes" : "No"],
    ...(errorHint ? [["Sync gaps", errorHint]] : [])
  ]);
}

function initializePeriod() {
  applyPeriodPreset(state.periodPreset || "allTime", { preserveCustom: Boolean(state.dateFrom && state.dateTo) });
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
    endDate: options.preserveCustom ? elements.dateToInput.value : "",
    allTimeStart: earliestDataDate()
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
  if (!latest) return zeroTotals();
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
  const safeGross = Math.max(Number(grossCents) || 0, 0);
  const safeNet = Math.max(Number(fanvueNetCents) || 0, 0);
  const normalizedGross = safeGross || deriveGrossFromNet(safeNet);
  const normalizedFanvueNet = safeNet || Math.round(normalizedGross * (1 - FANVUE_FEE_RATE / 100));
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
  const fanvueNetCents = Math.max(snapshot?.fanvueNetCents ?? snapshot?.revenueCents ?? 0, 0);
  const grossCents = Math.max(snapshot?.grossRevenueCents ?? deriveGrossFromNet(fanvueNetCents), 0);
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

function syncStatusLabel(status) {
  return {
    ok: "Synced",
    error: "Failed",
    pending: "Pending"
  }[status] || status || "Pending";
}

function contentErrorsForModel(model) {
  const snapshot = latestSnapshotForModel(model.id);
  if (!snapshot?.contentErrors) return [];
  return Object.entries(snapshot.contentErrors)
    .filter(([, message]) => message)
    .map(([key, message]) => ({ key, message }));
}

function openRequestCount(modelId = null) {
  return state.contentRequests.filter((request) => (
    request.status === "open" && (!modelId || request.modelId === modelId)
  )).length;
}

function ensureChartVisibility() {
  const ids = state.models.map((model) => model.id);
  if (!state.chartVisibleModels.size) {
    ids.slice(0, Math.min(3, ids.length)).forEach((id) => state.chartVisibleModels.add(id));
    return;
  }
  for (const id of [...state.chartVisibleModels]) {
    if (!ids.includes(id)) state.chartVisibleModels.delete(id);
  }
  if (!state.chartVisibleModels.size) {
    ids.slice(0, Math.min(3, ids.length)).forEach((id) => state.chartVisibleModels.add(id));
  }
}

function priorPeriodBounds() {
  const start = parseDateKey(state.dateFrom);
  const end = parseDateKey(state.dateTo);
  if (!start || !end) return { dateFrom: "", dateTo: "" };
  const dayCount = Math.max(Math.round((end - start) / 86_400_000) + 1, 1);
  const priorEnd = shiftUtcDays(start, -1);
  const priorStart = shiftUtcDays(priorEnd, -(dayCount - 1));
  return { dateFrom: dateKey(priorStart), dateTo: dateKey(priorEnd) };
}

function modelInsightsForPriorPeriod(model) {
  const bounds = priorPeriodBounds();
  const snapshot = latestSnapshotForModel(model.id);
  const tracking = snapshot?.trackingSummary;
  const audience = snapshot?.audienceSummary;
  const zero = { linkCount: 0, clicks: 0, subscribers: 0, followers: 0, grossRevenueCents: 0, netRevenueCents: 0 };
  const audienceDaily = (audience?.daily || []).filter((row) => dateInRange(row.date, bounds.dateFrom, bounds.dateTo));
  const links = Array.isArray(tracking?.links) ? tracking.links : [];
  const totals = aggregateLinkStats(links);

  return {
    newSubscribers: sum(audienceDaily.map((row) => row.newSubscribers)) || 0,
    newFollowers: sum(audienceDaily.map((row) => row.newFollowers)) || 0,
    totals: links.length ? totals : zero,
    links,
    audienceDaily
  };
}

function totalTrafficForInsights(insights) {
  return insights.totals?.clicks || 0;
}

function formatTrafficCount(value) {
  return formatCount(value);
}

function formatTrafficMetricCell(stats) {
  if (!stats) return "—";
  return `${formatCount(stats.clicks || 0)} clicks`;
}

function mixColor(index) {
  return MODEL_COLORS[index % MODEL_COLORS.length];
}

function renderRequestCards(requests, options = {}) {
  if (!requests.length) {
    return `<p class="empty-note">No requests yet.</p>`;
  }

  const modelNames = new Map(state.models.map((model) => [model.id, model.displayName]));
  const sorted = [...requests].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  return sorted.map((request) => {
    const modelName = modelNames.get(request.modelId) || "Unknown model";
    return `
      <article class="request-card" data-request-id="${escapeHtml(request.id)}">
        <header class="request-card-header">
          <div>
            ${options.showModel ? `<span class="request-model">${escapeHtml(modelName)}</span>` : ""}
            <span class="urgency-pill ${escapeHtml(request.urgency)}">${escapeHtml(request.urgency)}</span>
            <span class="request-type">${escapeHtml(request.type || "content")}</span>
            <span class="request-status">${escapeHtml(request.status)}</span>
          </div>
        </header>
        <div class="request-body">
          <p>${escapeHtml(request.description || "No description")}</p>
          ${request.exampleImageUrl ? `<p><a href="${escapeHtml(request.exampleImageUrl)}" target="_blank" rel="noopener noreferrer">Reference image</a></p>` : ""}
          <small>Created ${formatDate(request.createdAt)}</small>
          ${request.status === "open" ? `
            <div class="button-row">
              <button class="solid-button" type="button" data-finish-request="${escapeHtml(request.id)}">Finished</button>
              <button class="danger-button" type="button" data-deny-request="${escapeHtml(request.id)}">Denied</button>
            </div>
          ` : ""}
        </div>
      </article>
    `;
  }).join("");
}

function bindRequestCardActions(container) {
  container.querySelectorAll("[data-finish-request]").forEach((button) => {
    button.addEventListener("click", () => updateRequestStatus(button.dataset.finishRequest, "finished"));
  });
  container.querySelectorAll("[data-deny-request]").forEach((button) => {
    button.addEventListener("click", () => updateRequestStatus(button.dataset.denyRequest, "denied"));
  });
}

async function updateRequestStatus(requestId, status) {
  await api(`/api/content-requests/${requestId}`, { method: "PATCH", body: { status } });
  showToast(status === "finished" ? "Request marked finished" : "Request denied");
  await loadSummary();
}

function openVaRequestDialog(modelId = null) {
  state.vaRequestModelId = modelId;
  const select = document.querySelector("#vaRequestModelInput");
  select.innerHTML = state.models.map((model) => `
    <option value="${escapeHtml(model.id)}">${escapeHtml(model.displayName)}</option>
  `).join("");
  if (modelId) select.value = modelId;
  document.querySelector("#vaRequestFormError").textContent = "";
  document.querySelector("#vaRequestForm").reset();
  if (modelId) select.value = modelId;
  document.querySelector("#vaRequestDialog").showModal();
}

function closeVaRequestDialog() {
  document.querySelector("#vaRequestDialog").close();
}

async function saveVaRequest(event) {
  event.preventDefault();
  const errorEl = document.querySelector("#vaRequestFormError");
  errorEl.textContent = "";
  try {
    await api("/api/content-requests", {
      method: "POST",
      body: {
        modelId: document.querySelector("#vaRequestModelInput").value,
        urgency: document.querySelector("#vaRequestUrgencyInput").value,
        description: document.querySelector("#vaRequestDescriptionInput").value
      }
    });
    closeVaRequestDialog();
    showToast("VA request added");
    await loadSummary();
  } catch (error) {
    errorEl.textContent = error.message;
  }
}

function openDriveLinkDialog(modelId = null) {
  if (!modelId && !selectedModel()) {
    showToast("Select a model first.");
    return;
  }
  state.driveLinkModelId = modelId || selectedModel().id;
  document.querySelector("#driveLinkFormError").textContent = "";
  document.querySelector("#driveLinkForm").reset();
  document.querySelector("#driveLinkDialog").showModal();
}

function closeDriveLinkDialog() {
  document.querySelector("#driveLinkDialog").close();
}

async function saveDriveLink(event) {
  event.preventDefault();
  const errorEl = document.querySelector("#driveLinkFormError");
  errorEl.textContent = "";
  try {
    await api("/api/drive-links", {
      method: "POST",
      body: {
        modelId: state.driveLinkModelId,
        name: document.querySelector("#driveLinkNameInput").value,
        url: document.querySelector("#driveLinkUrlInput").value,
        description: document.querySelector("#driveLinkDescriptionInput").value
      }
    });
    closeDriveLinkDialog();
    showToast("Drive link saved");
    await loadSummary();
  } catch (error) {
    errorEl.textContent = error.message;
  }
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
    last90: "Last 90 days",
    allTime: "All time",
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
    return { preset, startDate: custom.allTimeStart || dateKey(shiftUtcDays(today, -3650)), endDate };
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
  const totals = aggregateLinkStats(links);

  return {
    newSubscribers: sum(audienceDaily.map((row) => row.newSubscribers)) || audience?.newSubscribers || 0,
    newFollowers: sum(audienceDaily.map((row) => row.newFollowers)) || audience?.newFollowers || 0,
    totals: links.length ? totals : (tracking?.totals || zero),
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

function trafficInsightsNote(snapshot) {
  if (!snapshot?.contentErrors) return "";
  const tracking = snapshot.contentErrors.tracking;
  if (tracking) return `tracking: ${tracking}`;
  const audience = snapshot.contentErrors.audience;
  const hasLinks = (snapshot.trackingSummary?.links?.length || 0) > 0;
  if (audience && !hasLinks) return `audience: ${audience}`;
  if (audience && hasLinks) return `Subscriber API issue (links still loaded): ${audience}`;
  return "";
}

function comparisonPointsForModel(model, insights, dates) {
  const revenueMetric = state.comparisonMetric === "gross" ? "gross" : "ownerNet";
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
    ownerNet: "Owner net"
  }[metric] || "Owner net";
}

function comparisonMetricFormatter(metric) {
  return formatMoney;
}

function formatCount(value = 0) {
  return new Intl.NumberFormat("en-US").format(Number(value) || 0);
}

function switchModelTab(tab) {
  state.modelTab = tab;
  const model = selectedModel();
  renderModelTabPanels(model);
  if (tab === "vault") loadVaultContent(false);
  if (tab === "posts") loadPostsContent(false);
  if (tab === "traffic" && model) renderModelTrafficTab(model);
}

function renderModelTabPanels(model) {
  document.querySelectorAll("[data-model-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.modelTab === state.modelTab);
  });
  document.querySelector("#modelTabOverview").hidden = state.modelTab !== "overview";
  document.querySelector("#modelTabTraffic").hidden = state.modelTab !== "traffic";
  document.querySelector("#modelTabContent").hidden = state.modelTab !== "content";
  document.querySelector("#modelTabVault").hidden = state.modelTab !== "vault";
  document.querySelector("#modelTabPosts").hidden = state.modelTab !== "posts";
  document.querySelector("#modelTabConnection").hidden = state.modelTab !== "connection";
  if (!model) return;
  if (state.modelTab === "traffic") renderModelTrafficTab(model);
  if (state.modelTab === "content") renderModelContentTab(model);
  if (state.modelTab === "vault") renderVaultPanel(model, state.contentCache.vault.get(model.id));
  if (state.modelTab === "posts") renderPostsPanel(model, state.contentCache.posts.get(model.id));
}

function renderModelTrafficTab(model) {
  const insights = modelInsights(model);
  const total = totalTrafficForInsights(insights);

  const snapshot = latestSnapshotForModel(model.id);
  const syncNote = trafficInsightsNote(snapshot);
  elements.modelTrackingSubtitle.textContent = syncNote
    ? syncNote
    : `${periodLabel()} · ${insights.links.length} tracking links`;
  elements.modelTrafficSplit.innerHTML = `
    <article class="traffic-card total"><span>Total traffic</span><strong>${formatTrafficCount(total)}</strong></article>
    <article class="traffic-card external"><span>Tracked links</span><strong>${formatCount(insights.links.length)}</strong></article>
    <article class="traffic-card internal"><span>Link revenue</span><strong>${formatMoney(insights.totals.netRevenueCents)}</strong></article>
  `;

  if (!insights.links.length) {
    const emptyMessage = syncNote || buildInsightsNote(snapshot) || "No tracking links returned. Reconnect Fanvue with read:tracking_links, then sync.";
    elements.modelTrafficSplit.innerHTML = `<div class="chart-empty compact-empty">${escapeHtml(emptyMessage)}</div>`;
    elements.modelTrackingRows.innerHTML = `<tr><td colspan="3">${escapeHtml(emptyMessage)}</td></tr>`;
    return;
  }

  elements.modelTrackingRows.innerHTML = insights.links.map((link) => `
    <tr>
      <td>${escapeHtml(link.name)}</td>
      <td>${formatTrafficMetricCell(link)}</td>
      <td>${formatMoney(link.netRevenueCents)}</td>
    </tr>
  `).join("") || `<tr><td colspan="3">Sync this model to load tracking links.</td></tr>`;
}

function renderModelContentTab(model) {
  const requests = state.contentRequests.filter((request) => request.modelId === model.id);
  const open = requests.filter((request) => request.status === "open");
  const links = state.driveLinks.filter((link) => link.modelId === model.id);

  elements.modelContentSubtitle.textContent = `${open.length} open request${open.length === 1 ? "" : "s"} · ${links.length} Drive link${links.length === 1 ? "" : "s"}`;
  elements.modelContentSummary.innerHTML = `
    <div class="content-gen-stat"><span>Open requests:</span><strong>${formatCount(open.length)}</strong></div>
    <div class="content-gen-stat"><span>Drive links:</span><strong>${formatCount(links.length)}</strong></div>
  `;
  elements.modelContentRequests.innerHTML = renderRequestCards(requests, { showModel: false });
  bindRequestCardActions(elements.modelContentRequests);
  elements.modelDriveLinks.innerHTML = links.map((link) => `
    <article class="drive-link-card">
      <div>
        <strong><a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.name)}</a></strong>
        <p>${escapeHtml(link.description || "No description")}</p>
      </div>
    </article>
  `).join("") || `<p class="empty-note">No Google Drive links yet. Add one for reference folders.</p>`;
  state.driveLinkModelId = model.id;
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
    elements.postsRows.innerHTML = `<tr><td colspan="6">${escapeHtml(error.message)}</td></tr>`;
  }
}

function mediaProxySrc(modelId, mediaUrl) {
  if (!mediaUrl) return "";
  return `/api/models/${encodeURIComponent(modelId)}/media-proxy?url=${encodeURIComponent(mediaUrl)}`;
}

function renderVaultPanel(model, payload) {
  if (!payload) {
    elements.vaultSubtitle.textContent = "Vault not loaded yet";
    elements.vaultContent.innerHTML = `<div class="chart-empty compact-empty">Open this tab to load vault folders.</div>`;
    return;
  }
  elements.vaultSubtitle.textContent = `${payload.folderCount} folders · ${payload.mediaCount} media items · thumbnails via dashboard proxy`;
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
      ${folder.loadError ? `<p class="empty-note">${escapeHtml(folder.loadError)}</p>` : ""}
      <div class="media-grid">
        ${folder.media.slice(0, 120).map((item) => {
          const src = item.thumbnailUrl ? mediaProxySrc(model.id, item.thumbnailUrl) : "";
          return `
          <div class="media-tile">
            ${src ? `<img src="${escapeHtml(src)}" alt="" loading="lazy">` : `<span>${escapeHtml(item.mediaType)}</span>`}
            <small>${escapeHtml(item.name)}</small>
          </div>`;
        }).join("") || `<span class="empty-note">No media in this folder.</span>`}
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
    elements.postsRows.innerHTML = `<tr><td colspan="6">${escapeHtml(payload.warning)}</td></tr>`;
    return;
  }

  elements.postsSubtitle.textContent = `${payload.total} posts · ${counts.published || 0} published · ${counts.scheduled || 0} scheduled · ${counts.draft || 0} draft`;
  elements.postsRows.innerHTML = payload.posts.map((post) => `
    <tr>
      <td>
        ${post.thumbnailUrl ? `<img class="post-thumb" src="${escapeHtml(mediaProxySrc(model.id, post.thumbnailUrl))}" alt="" loading="lazy">` : "—"}
      </td>
      <td>
        <strong>${escapeHtml(post.title)}</strong>
        ${post.caption && post.caption !== post.title ? `<div class="table-sub">${escapeHtml(post.caption)}</div>` : ""}
      </td>
      <td><span class="pill">${escapeHtml(post.status)}</span></td>
      <td>${formatCount(post.mediaCount)}</td>
      <td>${post.priceCents ? formatMoney(post.priceCents) : "—"}</td>
      <td>${formatDate(post.publishedAt || post.createdAt)}</td>
    </tr>
  `).join("") || `<tr><td colspan="6">No posts returned by Fanvue API.</td></tr>`;
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

function chartAnimateKey(...parts) {
  return parts.filter(Boolean).join("|");
}

function shouldAnimateChart(animateKey) {
  if (!animateKey) return false;
  if (state.chartAnimateSeen.has(animateKey)) return false;
  state.chartAnimateSeen.set(animateKey, true);
  return true;
}

function mountChart(container, options) {
  if (!container) return;
  const animate = shouldAnimateChart(options.animateKey);
  renderInteractiveChart(container, {
    series: options.series,
    dates: options.dates,
    formatValue: options.formatValue,
    emptyMessage: options.emptyMessage,
    animate
  });
}

function renderSettings() {
  elements.autoSyncEnabledInput.checked = Boolean(state.settings.autoSyncEnabled);
  elements.autoSyncIntervalInput.value = state.settings.autoSyncIntervalMinutes || 60;
  elements.autoSyncIntervalInput.disabled = !state.settings.autoSyncEnabled;
  elements.settingsFormError.textContent = "";
}

async function saveSettings(event) {
  event.preventDefault();
  elements.settingsFormError.textContent = "";
  try {
    const payload = {
      autoSyncEnabled: elements.autoSyncEnabledInput.checked,
      autoSyncIntervalMinutes: Number(elements.autoSyncIntervalInput.value)
    };
    state.settings = await api("/api/settings", { method: "PATCH", body: payload });
    showToast("Settings saved");
    render();
  } catch (error) {
    elements.settingsFormError.textContent = error.message;
  }
}

elements.autoSyncEnabledInput?.addEventListener("change", () => {
  elements.autoSyncIntervalInput.disabled = !elements.autoSyncEnabledInput.checked;
});

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => {
    elements.toast.classList.remove("show");
  }, 3200);
}
