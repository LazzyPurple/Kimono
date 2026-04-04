import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

test("grand cleanup removes Prisma and local SQLite scaffolding from the app layer", () => {
  const packageJson = JSON.parse(read("package.json"));
  const dbIndex = read("lib/db/index.ts");

  assert.equal(exists("lib/prisma.ts"), false);
  assert.equal(exists("lib/db/local-repository.ts"), false);
  assert.equal(exists("prisma/schema.prisma"), false);
  assert.equal(packageJson.dependencies?.["@prisma/client"], undefined);
  assert.equal(packageJson.devDependencies?.prisma, undefined);
  assert.equal(packageJson.devDependencies?.["@prisma/adapter-better-sqlite3"], undefined);
  assert.equal(packageJson.devDependencies?.["better-sqlite3"], undefined);
  assert.equal(packageJson.scripts?.["prisma:generate"], undefined);
  assert.equal(packageJson.scripts?.["prisma:push"], undefined);
  assert.doesNotMatch(dbIndex, /local-repository\.ts/);
  assert.doesNotMatch(dbIndex, /app-store\.ts/);
  assert.doesNotMatch(dbIndex, /performance\.ts/);
  assert.doesNotMatch(dbIndex, /performance-cache\.ts/);
});
