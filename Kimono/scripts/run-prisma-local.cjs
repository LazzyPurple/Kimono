const { spawnSync } = require("node:child_process");
const path = require("node:path");

const args = process.argv.slice(2);
const prismaCmdPath = path.join(__dirname, "..", "node_modules", ".bin", "prisma.cmd");
const localDatabaseUrl =
  process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith("file:")
    ? process.env.DATABASE_URL
    : "file:./dev.db";

const env = {
  ...process.env,
  DATABASE_URL: localDatabaseUrl,
};

const result =
  process.platform === "win32"
    ? spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", prismaCmdPath, ...args], {
        stdio: "inherit",
        env,
      })
    : spawnSync(path.join(__dirname, "..", "node_modules", ".bin", "prisma"), args, {
        stdio: "inherit",
        env,
      });

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
