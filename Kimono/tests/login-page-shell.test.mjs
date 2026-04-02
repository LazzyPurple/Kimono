import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("login page passes search params into LoginPageClient without Suspense fallback loading shell", () => {
  const page = read("app/(auth)/login/page.tsx");
  const client = read("components/LoginPageClient.tsx");

  assert.doesNotMatch(page, /<Suspense/);
  assert.doesNotMatch(page, /Loading\.\.\./);
  assert.match(page, /const resolvedSearchParams = await searchParams;/);
  assert.match(page, /<LoginPageClient initialStepParam=\{resolvedSearchParams\?\.step\} \/>/);
  assert.doesNotMatch(client, /useSearchParams\(/);
  assert.match(client, /initialStepParam\?: string \| string\[\] \| undefined/);
});
