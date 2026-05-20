export function periodBounds(preset, custom = {}) {
  const today = startOfDay(new Date());
  const endToday = dateKey(today);

  if (preset === "today") {
    return periodRange(preset, endToday, endToday);
  }
  if (preset === "yesterday") {
    const day = shiftDays(today, -1);
    const key = dateKey(day);
    return periodRange(preset, key, key);
  }
  if (preset === "last7") {
    const startDate = dateKey(shiftDays(today, -6));
    return periodRange(preset, startDate, endToday);
  }
  if (preset === "last14") {
    const startDate = dateKey(shiftDays(today, -13));
    return periodRange(preset, startDate, endToday);
  }
  if (preset === "last30") {
    const startDate = dateKey(shiftDays(today, -29));
    return periodRange(preset, startDate, endToday);
  }
  if (preset === "thisMonth") {
    const startDate = dateKey(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)));
    return periodRange(preset, startDate, endToday);
  }

  const startDate = custom.startDate || endToday;
  const endDate = custom.endDate || endToday;
  return periodRange(preset || "custom", startDate, endDate);
}

function periodRange(preset, startDate, endDate) {
  return {
    preset,
    startDate,
    endDate,
    startIso: isoStart(startDate),
    endIso: isoEnd(endDate),
    endExclusiveIso: isoEndExclusive(endDate)
  };
}

export function periodLabel(bounds) {
  const labels = {
    today: "Today (since midnight)",
    yesterday: "Yesterday",
    last7: "Last 7 days",
    last14: "Last 14 days",
    last30: "Last 30 days",
    thisMonth: "This month"
  };
  if (labels[bounds.preset]) return labels[bounds.preset];
  return `${bounds.startDate} to ${bounds.endDate}`;
}

function startOfDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function shiftDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function isoStart(dateKeyValue) {
  return `${dateKeyValue}T00:00:00.000Z`;
}

function isoEnd(dateKeyValue) {
  return `${dateKeyValue}T23:59:59.999Z`;
}

function isoEndExclusive(dateKeyValue) {
  const date = new Date(`${dateKeyValue}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

export { isoEndExclusive };
