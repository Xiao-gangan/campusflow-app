import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

const root = process.cwd();
const skipDirectories = new Set([
  ".git",
  ".vite",
  "coverage",
  "dist",
  "node_modules",
]);
const skipFiles = new Set(["package-lock.json"]);
const textExtensions = new Set([
  ".cjs",
  ".css",
  ".example",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

const patterns = [
  {
    name: "private key block",
    regex: /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/,
  },
  { name: "AWS access key", regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "GitHub token", regex: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
  { name: "Slack token", regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: "OpenAI-style key", regex: /\bsk-[A-Za-z0-9]{20,}\b/ },
  {
    name: "quoted credential assignment",
    regex:
      /\b(?:api[_-]?key|client[_-]?secret|password|passwd|access[_-]?token)\s*[:=]\s*["'][^"'\s]{8,}["']/i,
  },
];

async function listRepositoryFiles() {
  try {
    const output = execFileSync(
      "git",
      ["ls-files", "-co", "--exclude-standard", "-z"],
      {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    const files = output.split("\0").filter(Boolean);
    return files.length > 0 ? files : null;
  } catch {
    return null;
  }
}

async function listTrackedFiles() {
  try {
    const output = execFileSync("git", ["ls-files", "-z"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return output.split("\0").filter(Boolean);
  } catch {
    return [];
  }
}

async function walk(directory) {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (skipDirectories.has(entry.name)) continue;
      files.push(...(await walk(join(directory, entry.name))));
      continue;
    }
    if (entry.isFile()) files.push(join(directory, entry.name));
  }

  return files;
}

function isScannable(relativePath) {
  const baseName = relativePath.split("/").pop() ?? "";
  if (skipFiles.has(baseName)) return false;
  if (baseName === ".env" || /^\.env\./.test(baseName)) return false;
  if (!baseName.includes(".") && baseName !== "Dockerfile") return false;
  return textExtensions.has(extname(baseName).toLowerCase());
}

const repositoryFiles = await listRepositoryFiles();
const trackedFiles = await listTrackedFiles();
const trackedEnvFiles = trackedFiles.filter(
  (file) => /(^|\/)\.env(?:\.(?!example$).*)?$/.test(file),
);

const files =
  repositoryFiles ??
  (await walk(root)).map((file) => relative(root, file).split("\\").join("/"));
const findings = [];

for (const file of trackedEnvFiles) {
  findings.push({ file, line: 0, name: "tracked .env file" });
}

for (const file of files) {
  if (!isScannable(file)) continue;

  let content;
  try {
    content = await readFile(resolve(root, file), "utf8");
  } catch {
    continue;
  }

  const lines = content.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    for (const pattern of patterns) {
      if (pattern.regex.test(line)) {
        findings.push({ file, line: index + 1, name: pattern.name });
      }
    }
  }
}

if (findings.length > 0) {
  console.error("Potential secrets found:");
  for (const finding of findings) {
    const location = finding.line > 0 ? `${finding.file}:${finding.line}` : finding.file;
    console.error(`- ${location} — ${finding.name}`);
  }
  process.exit(1);
}

console.log(`Secret scan passed (${files.length} files checked).`);
