const fs = require("fs");
const path = require("path");

function cleanValue(value) {
  const trimmed = String(value || "").trim();
  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];

  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function loadEnvFile(filePath, override = false) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) return;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = cleanValue(trimmed.slice(separatorIndex + 1));

    if (!key) return;
    if (override || process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
}

function loadEnv() {
  loadEnvFile(path.join(__dirname, "..", ".env"));
  loadEnvFile(path.join(__dirname, ".env"), true);
}

module.exports = loadEnv;
