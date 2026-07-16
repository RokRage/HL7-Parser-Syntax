import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const INDEX_PATH = "index.html";
const SW_PATH = "sw.js";
const VERSION_PATTERN = /(<span class="app-version" data-app-version>v)(\d+)\.(\d{4})(<\/span>)/;

function readVersion(source, label) {
  const match = source.match(VERSION_PATTERN);
  if (!match) throw new Error(`Could not find an app version in ${label}`);
  return { major: Number(match[2]), build: Number(match[3]) };
}

function formatVersion(version) {
  return `${version.major}.${String(version.build).padStart(4, "0")}`;
}

function nextVersion(version) {
  if (version.build < 9999) return { major: version.major, build: version.build + 1 };
  return { major: version.major + 1, build: 0 };
}

function versionEquals(left, right) {
  return left && right && left.major === right.major && left.build === right.build;
}

const indexSource = readFileSync(INDEX_PATH, "utf8");
const current = readVersion(indexSource, INDEX_PATH);
let committed = null;

try {
  const committedIndex = execFileSync("git", ["show", `HEAD:${INDEX_PATH}`], { encoding: "utf8" });
  committed = readVersion(committedIndex, `HEAD:${INDEX_PATH}`);
} catch {
  // A repository without a previous version should still receive its first bump.
}

const target = versionEquals(current, committed) ? nextVersion(current) : current;
const formatted = formatVersion(target);

if (process.argv.includes("--dry-run")) {
  console.log(`App version would be v${formatted}`);
  process.exit(0);
}

const nextIndex = indexSource.replace(
  VERSION_PATTERN,
  (_full, prefix, _major, _build, suffix) => `${prefix}${formatted}${suffix}`
);
const swSource = readFileSync(SW_PATH, "utf8");
const nextSw = swSource.replace(
  /^const CACHE_VERSION = "[^"]+";/m,
  `const CACHE_VERSION = "hl7-message-explorer-v${formatted}";`
);

if (nextSw === swSource && !swSource.includes(`hl7-message-explorer-v${formatted}`)) {
  throw new Error(`Could not update CACHE_VERSION in ${SW_PATH}`);
}

writeFileSync(INDEX_PATH, nextIndex);
writeFileSync(SW_PATH, nextSw);
console.log(`App version: v${formatted}`);
