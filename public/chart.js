export function renderInteractiveChart(container, { series, dates, formatValue, emptyMessage = "No chart data yet." }) {
  container.innerHTML = "";
  const activeSeries = series.filter((serie) => serie.points?.length);
  if (!activeSeries.length || !dates.length) {
    container.innerHTML = `<div class="chart-empty">${escapeHtml(emptyMessage)}</div>`;
    return;
  }

  const width = 960;
  const height = 360;
  const padding = { top: 28, right: 20, bottom: 64, left: 76 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const allValues = activeSeries.flatMap((serie) => serie.points.map((point) => point.value));
  const maxValue = Math.max(...allValues, 1);
  const yTicks = buildYTicks(maxValue, formatValue);

  const xForIndex = (index) => padding.left + (index / Math.max(dates.length - 1, 1)) * plotWidth;
  const yForValue = (value) => padding.top + plotHeight - (value / yTicks.max) * plotHeight;
  const xByDate = new Map(dates.map((date, index) => [date, xForIndex(index)]));

  const plotted = activeSeries.map((serie) => {
    const coords = dates.map((date) => {
      const point = serie.points.find((item) => item.date === date) || { date, value: 0 };
      return { date, value: point.value, x: xByDate.get(date), y: yForValue(point.value) };
    });
    return { ...serie, coords, path: smoothLinePath(coords) };
  });

  const xLabelIndexes = pickLabelIndexes(dates.length, 6);
  const xLabels = xLabelIndexes.map((index) => ({
    x: xForIndex(index),
    label: formatShortDate(dates[index])
  }));

  const yGrid = yTicks.values.map((tick) => {
    const y = yForValue(tick);
    return { y, label: formatValue(tick) };
  });

  const hitZones = plotted.flatMap((serie) => serie.coords.map((point) => ({
    ...point,
    color: serie.color,
    label: serie.label
  })));

  const root = document.createElement("div");
  root.className = "interactive-chart";
  root.innerHTML = `
    <div class="chart-tooltip" hidden></div>
    <svg class="chart-svg chart-animate" viewBox="0 0 ${width} ${height}" role="img" aria-label="Model comparison chart">
      <defs>
        ${plotted.map((serie, index) => `
          <linearGradient id="area-${index}" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="${serie.color}" stop-opacity="0.22"></stop>
            <stop offset="100%" stop-color="${serie.color}" stop-opacity="0"></stop>
          </linearGradient>
        `).join("")}
      </defs>
      ${yGrid.map((tick) => `
        <line class="chart-grid-line" x1="${padding.left}" x2="${width - padding.right}" y1="${tick.y}" y2="${tick.y}"></line>
        <text class="chart-axis-y" x="${padding.left - 10}" y="${tick.y + 4}" text-anchor="end">${escapeHtml(tick.label)}</text>
      `).join("")}
      ${plotted.map((serie, index) => {
        const baseline = padding.top + plotHeight;
        const areaPath = `${serie.path} L ${serie.coords.at(-1).x} ${baseline} L ${serie.coords[0].x} ${baseline} Z`;
        return `
          <path class="chart-area" fill="url(#area-${index})" d="${areaPath}"></path>
          <path class="chart-line-smooth" style="--line-color:${serie.color}" d="${serie.path}"></path>
        `;
      }).join("")}
      ${hitZones.map((point) => `
        <circle class="chart-hit" cx="${point.x}" cy="${point.y}" r="10"
          data-label="${escapeHtml(point.label)}"
          data-date="${escapeHtml(point.date)}"
          data-value="${escapeHtml(formatValue(point.value))}"
          data-color="${escapeHtml(point.color)}"></circle>
      `).join("")}
      ${xLabels.map((tick) => `
        <text class="chart-axis-x" x="${tick.x}" y="${height - 18}" text-anchor="middle">${escapeHtml(tick.label)}</text>
      `).join("")}
      <line class="chart-axis-base" x1="${padding.left}" x2="${width - padding.right}" y1="${padding.top + plotHeight}" y2="${padding.top + plotHeight}"></line>
    </svg>
  `;

  const tooltip = root.querySelector(".chart-tooltip");
  const svg = root.querySelector(".chart-svg");

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

  container.appendChild(root);

  requestAnimationFrame(() => {
    svg.classList.add("is-ready");
  });
}

function smoothLinePath(points) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  const path = [`M ${points[0].x} ${points[0].y}`];
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const controlX = (current.x + next.x) / 2;
    path.push(`C ${controlX} ${current.y}, ${controlX} ${next.y}, ${next.x} ${next.y}`);
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
