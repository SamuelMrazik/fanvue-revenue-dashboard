export function periodBounds(preset, custom = {}) {
  const today = startOfDay(new Date());
  const endToday = dateKey(today);

  if (preset === "today") {
    return { preset, startDate: endToday, endDate: endToday, startIso: isoStart(endToday), endIso: isoEnd(endToday) };
  }
  if (preset === "yesterday") {
    const day = shiftDays(today, -1);
    const key = dateKey(day);
    return { preset, startDate: key, endDate: key, startIso: isoStart(key), endIso: isoEnd(key) };
  }
  if (preset === "last7") {
    const startDate = dateKey(shiftDays(today, -6));
    return { preset, startDate, endDate: endToday, startIso: isoStart(startDate), endIso: isoEnd(endToday) };
  }
  if (preset === "last14") {
    const startDate = dateKey(shiftDays(today, -13));
    return { preset, startDate, endDate: endToday, startIso: isoStart(startDate), endIso: isoEnd(endToday) };
  }
  if (preset === "last30") {
    const startDate = dateKey(shiftDays(today, -29));
    return { preset, startDate, endDate: endToday, startIso: isoStart(startDate), endIso: isoEnd(endToday) };
  }
  if (preset === "thisMonth") {
    const startDate = dateKey(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)));
    return { preset, startDate, endDate: endToday, startIso: isoStart(startDate), endIso: isoEnd(endToday) };
  }

  const startDate = custom.startDate || endToday;
  const endDate = custom.endDate || endToday;
  return {
    preset: preset || "custom",
    startDate,
    endDate,
    startIso: isoStart(startDate),
    endIso: isoEnd(endDate)
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
