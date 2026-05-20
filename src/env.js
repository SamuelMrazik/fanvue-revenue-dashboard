import fs from "node:fs";
import path from "node:path";

export function loadDotEnv(filePath = path.join(process.cwd(), ".env")) {
  if (!fs.existsSync(filePath)) return;

  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = unquote(trimmed.slice(separatorIndex + 1).trim());
    if (!key || key in process.env) continue;
    process.env[key] = value;
  }
}

function unquote(value) {
  const first = value[0];
  const last = value[value.length - 1];
  if ((first === `"` && last === `"`) || (first === "'" && last === "'")) {
    return value.slice(1, -1);
  }
  return value;
}
