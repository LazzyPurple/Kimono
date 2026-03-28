import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const libDir = path.join(root, 'lib');
const appDir = path.join(root, 'app');

function grepFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.next' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...grepFiles(full));
      continue;
    }
    const text = fs.readFileSync(full, 'utf8');
    if (/data-store|perf-repository|creators-cache|creator-index-startup/.test(text)) {
      results.push(path.relative(root, full));
    }
  }
  return results;
}

const forbiddenRefs = [...grepFiles(libDir), ...grepFiles(appDir)];
assert.deepEqual(forbiddenRefs, [], `legacy imports remain: ${forbiddenRefs.join(', ')}`);

for (const removed of [
  'lib/data-store.ts',
  'lib/perf-repository.ts',
  'lib/perf-cache.ts',
  'lib/api/creators-cache.ts',
  'lib/server/creator-index-startup.cjs',
  'app/api/creator-posts/route.ts',
  'app/api/creator-posts/search/route.ts',
  'app/api/creator-profile/route.ts',
  'app/api/post/route.ts',
  'app/api/kimono-favorites/route.ts',
  'app/api/kimono-login/route.ts',
  'app/api/kimono-session-status/route.ts',
  'app/api/likes/creators/route.ts',
  'app/api/likes/posts/route.ts',
  'app/api/recommended/route.ts',
  'app/api/cache-jobs/creator-snapshot/route.ts',
  'app/api/cache-jobs/popular-warmup/route.ts',
]) {
  assert.ok(!fs.existsSync(path.join(root, removed)), `${removed} should be removed by Phase 6`);
}

const fixSqlPath = path.join(root, 'deploy', 'migrations', 'v2-fix-creator-columns.sql');
assert.ok(fs.existsSync(fixSqlPath), 'missing deploy/migrations/v2-fix-creator-columns.sql');
const fixSql = fs.readFileSync(fixSqlPath, 'utf8');
assert.match(fixSql, /indexedAt|updatedAt|indexed|updated/, 'v2-fix-creator-columns.sql should handle creator timestamp naming');

const serverJs = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
assert.match(serverJs, /runCreatorSync/, 'server.js should call runCreatorSync in Phase 6');
assert.doesNotMatch(serverJs, /creator-index-startup/, 'server.js should no longer reference creator-index-startup');

console.log('Phase 6 cleanup contract looks good');
