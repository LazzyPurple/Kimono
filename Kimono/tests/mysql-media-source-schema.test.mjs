import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function readWorkspaceFile(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test("MySQL production schema includes MediaSourceCache and CreatorSearchCache in runtime bootstrap and deploy SQL", () => {
  const repositorySource = readWorkspaceFile("lib/perf-repository.ts");
  const deploySql = readWorkspaceFile("deploy/o2switch-init.sql");

  const mysqlBranch = repositorySource.match(/if \(driver\.kind === "mysql"\) \{([\s\S]*?)return;/);
  assert.ok(mysqlBranch, "Expected a MySQL schema bootstrap branch in perf-repository.ts");
  assert.match(mysqlBranch[1], /CREATE TABLE IF NOT EXISTS MediaSourceCache/, "MySQL runtime bootstrap should create MediaSourceCache");
  assert.match(mysqlBranch[1], /CREATE TABLE IF NOT EXISTS CreatorSearchCache/, "MySQL runtime bootstrap should create CreatorSearchCache");
  assert.match(deploySql, /CREATE TABLE\s+IF NOT EXISTS `MediaSourceCache`/, "deploy/o2switch-init.sql should create MediaSourceCache");
  assert.match(deploySql, /CREATE TABLE\s+IF NOT EXISTS `CreatorSearchCache`/, "deploy/o2switch-init.sql should create CreatorSearchCache");
});