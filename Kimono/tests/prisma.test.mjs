import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";

import {
  resolveLocalPrismaDatabaseUrl,
  resolveLocalPrismaFilePath,
} from "../lib/prisma.ts";

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), relativePath), "utf8"));
}

test("resolveLocalPrismaDatabaseUrl defaults to prisma/dev.db", () => {
  assert.equal(resolveLocalPrismaDatabaseUrl({}), "file:./dev.db");
  assert.equal(
    resolveLocalPrismaDatabaseUrl({ DATABASE_URL: "file:./custom.db" }),
    "file:./custom.db"
  );
  assert.equal(
    resolveLocalPrismaDatabaseUrl({ DATABASE_URL: "mysql://example" }),
    "file:./dev.db"
  );
});

test("resolveLocalPrismaFilePath resolves relative and absolute sqlite urls", () => {
  assert.equal(
    resolveLocalPrismaFilePath("file:./dev.db", "C:/workspace/Kimono"),
    path.join("C:/workspace/Kimono", "prisma", "dev.db")
  );

  assert.equal(
    resolveLocalPrismaFilePath("file:C:/temp/kimono.db", "C:/workspace/Kimono"),
    path.normalize("C:/temp/kimono.db")
  );
});

test("prisma packages stay version-aligned for clean Linux builds", () => {
  const pkg = readJson("package.json");
  const lock = readJson("package-lock.json");
  const prismaVersion = pkg.dependencies["@prisma/client"];

  assert.equal(pkg.devDependencies.prisma, prismaVersion);
  assert.equal(pkg.devDependencies["@prisma/adapter-better-sqlite3"], prismaVersion);
  assert.equal(lock.packages[""].devDependencies.prisma, prismaVersion);
});

test("o2switch packaging skips Prisma generation for the production-only artifact", () => {
  const buildScript = fs.readFileSync(path.join(process.cwd(), "scripts", "build-o2switch-package.sh"), "utf8");

  assert.doesNotMatch(buildScript, /npm run prisma:generate/);
  assert.doesNotMatch(buildScript, /Generating Prisma client/);
  assert.match(buildScript, /npm run build/);
});
