export function renderInteractiveChart(container, {
  series,
  dates,
  formatValue,
  emptyMessage = "No chart data yet.",
  animate = false
}) {
  container.innerHTML = "";
  const activeSeries = series.filter((serie) => serie.points?.length);
  if (!activeSeries.length || !dates.length) {
    container.innerHTML = `<div class="chart-empty">${escapeHtml(emptyMessage)}</div>`;
    return;
  }

  const root = document.createElement("div");
  root.className = `interactive-chart${animate ? " chart-animated" : ""}`;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "chart-svg");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Chart");

  const tooltip = document.createElement("div");
  tooltip.className = "chart-tooltip";
  tooltip.hidden = true;
  root.append(tooltip, svg);
  container.appendChild(root);

  const state = {
    width: 960,
    height: 380,
    padding: { top: 24, right: 16, bottom: 72, left: 72 },
    plotted: [],
    hitZones: [],
    xLabels: [],
    yGrid: []
  };

  const draw = () => {
    const bounds = root.getBoundingClientRect();
    const width = Math.max(Math.floor(bounds.width || container.clientWidth || 960), 320);
    const height = Math.max(Math.floor(bounds.height || container.clientHeight || 380), 280);
    state.width = width;
    state.height = height;

    const plotWidth = width - state.padding.left - state.padding.right;
    const plotHeight = height - state.padding.top - state.padding.bottom;

    const allValues = activeSeries.flatMap((serie) => serie.points.map((point) => point.value));
    const maxValue = Math.max(...allValues, 1);
    const yTicks = buildYTicks(maxValue, formatValue);

    const xForIndex = (index) => state.padding.left + (index / Math.max(dates.length - 1, 1)) * plotWidth;
    const yForValue = (value) => state.padding.top + plotHeight - (value / yTicks.max) * plotHeight;
    const xByDate = new Map(dates.map((date, index) => [date, xForIndex(index)]));

    state.plotted = activeSeries.map((serie) => {
      const coords = dates.map((date) => {
        const point = serie.points.find((item) => item.date === date) || { date, value: 0 };
        return { date, value: point.value, x: xByDate.get(date), y: yForValue(point.value) };
      });
      return { ...serie, coords, path: smoothLinePath(coords) };
    });

    const xLabelIndexes = pickLabelIndexes(dates.length, Math.min(6, Math.max(3, Math.floor(width / 140))));
    state.xLabels = xLabelIndexes.map((index) => ({
      x: xForIndex(index),
      label: formatShortDate(dates[index])
    }));

    state.yGrid = yTicks.values.map((tick) => {
      const y = yForValue(tick);
      return { y, label: formatValue(tick) };
    });

    state.hitZones = state.plotted.flatMap((serie) => serie.coords.map((point) => ({
      ...point,
      color: serie.color,
      label: serie.label
    })));

    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.innerHTML = `
      <defs>
        ${state.plotted.map((serie, index) => `
          <linearGradient id="area-${chartId(container)}-${index}" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="${serie.color}" stop-opacity="0.18"></stop>
            <stop offset="100%" stop-color="${serie.color}" stop-opacity="0"></stop>
          </linearGradient>
        `).join("")}
      </defs>
      ${state.yGrid.map((tick) => `
        <line class="chart-grid-line" x1="${state.padding.left}" x2="${width - state.padding.right}" y1="${tick.y}" y2="${tick.y}"></line>
        <text class="chart-axis-y" x="${state.padding.left - 10}" y="${tick.y + 4}" text-anchor="end">${escapeHtml(tick.label)}</text>
      `).join("")}
      ${state.plotted.map((serie, index) => {
        const baseline = state.padding.top + plotHeight;
        const areaPath = `${serie.path} L ${serie.coords.at(-1).x} ${baseline} L ${serie.coords[0].x} ${baseline} Z`;
        return `
          <path class="chart-area" fill="url(#area-${chartId(container)}-${index})" d="${areaPath}"></path>
          <path class="chart-line-smooth" style="--line-color:${serie.color}" d="${serie.path}"></path>
        `;
      }).join("")}
      ${state.hitZones.map((point) => `
        <circle class="chart-hit" cx="${point.x}" cy="${point.y}" r="10"
          data-label="${escapeHtml(point.label)}"
          data-date="${escapeHtml(point.date)}"
          data-value="${escapeHtml(formatValue(point.value))}"
          data-color="${escapeHtml(point.color)}"></circle>
      `).join("")}
      ${state.xLabels.map((tick) => `
        <text class="chart-axis-x" x="${tick.x}" y="${height - 22}" text-anchor="middle">${escapeHtml(tick.label)}</text>
      `).join("")}
      <line class="chart-axis-base" x1="${state.padding.left}" x2="${width - state.padding.right}" y1="${state.padding.top + plotHeight}" y2="${state.padding.top + plotHeight}"></line>
    `;
  };

  draw();

  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(() => draw());
    observer.observe(root);
    root.chartObserver = observer;
  }

  root.addEventListener("mousemove", (event) => {
    const target = event.target.closest(".chart-hit");
    if (!target) {
      tooltip.hidden = true;
      return;
    }
    const rect = root.getBoundingClientRect();
    tooltip.hidden = false;
    tooltip.style.left = `${event.clientX - rect.left + 12}px`;
    tooltip.style.top = `${event.clientY - rect.top - 12}px`;
    tooltip.style.borderColor = target.dataset.color;
    tooltip.innerHTML = `
      <strong>${target.dataset.label}</strong>
      <span>${formatLongDate(target.dataset.date)}</span>
      <span>${target.dataset.value}</span>
    `;
  });

  root.addEventListener("mouseleave", () => {
    tooltip.hidden = true;
  });

  if (animate) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => svg.classList.add("is-ready"));
    });
  } else {
    svg.classList.add("is-ready");
  }

  return root;
}

function chartId(container) {
  return String(container.id || "chart").replace(/[^a-z0-9_-]/gi, "");
}

function smoothLinePath(points) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  const path = [`M ${points[0].x} ${points[0].y}`];
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[Math.max(index - 1, 0)];
    const current = points[index];
    const next = points[index + 1];
    const after = points[Math.min(index + 2, points.length - 1)];
    const tension = 0.28;
    const cp1x = current.x + (next.x - previous.x) * tension;
    const cp1y = current.y + (next.y - previous.y) * tension;
    const cp2x = next.x - (after.x - current.x) * tension;
    const cp2y = next.y - (after.y - current.y) * tension;
    path.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${next.x} ${next.y}`);
  }
  return path.join(" ");
}

function buildYTicks(maxValue, formatValue) {
  const magnitude = 10 ** Math.floor(Math.log10(maxValue));
  const step = Math.ceil(maxValue / 4 / magnitude) * magnitude || 1;
  const top = Math.ceil(maxValue / step) * step || step;
  const values = [];
  for (let tick = 0; tick <= top; tick += step) values.push(tick);
  if (values[values.length - 1] !== top) values.push(top);
  return { max: top || 1, values: values.reverse() };
}

function pickLabelIndexes(length, maxLabels) {
  if (length <= maxLabels) return [...Array(length).keys()];
  const indexes = [];
  const step = (length - 1) / (maxLabels - 1);
  for (let index = 0; index < maxLabels; index += 1) {
    indexes.push(Math.round(index * step));
  }
  return indexes;
}

function formatShortDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatLongDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(new Date(`${value}T00:00:00.000Z`));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
