import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const uiFiles = [
  "app/layout.tsx",
  "components/ProtectedLayoutShell.tsx",
  "components/ProtectedLayoutAuthGate.tsx",
  "components/LoginPageClient.tsx",
  "components/TotpSetupDialog.tsx",
  "app/(protected)/search/page.tsx",
  "app/(protected)/creator/[site]/[service]/[id]/page.tsx",
  "app/(protected)/post/[site]/[service]/[user]/[id]/page.tsx",
  "app/(protected)/favorites/page.tsx",
  "app/(protected)/discover/page.tsx",
  "app/(protected)/popular/[site]/[[...page]]/page.tsx",
  "app/(protected)/home/page.tsx",
  "app/(auth)/login/page.tsx",
  "components/CreatorCard.tsx",
  "components/MediaCard.tsx",
  "components/VideoPlayer.tsx",
];

const mojibakePattern = /Ã|Â|â€¦|â€”|â¤|\uFFFD/;

test("key UI files do not contain mojibake characters", () => {
  for (const file of uiFiles) {
    const source = read(file);
    assert.equal(
      mojibakePattern.test(source),
      false,
      `${file} still contains mojibake text`
    );
  }
});

test("video player uses the requested Lucide controls", () => {
  const source = read("components/VideoPlayer.tsx");

  assert.match(source, /\bMaximize\b/, "fullscreen icon should use Maximize");
  assert.match(source, /\bMaximize2\b/, "zoom-to-fill icon should use Maximize2");
  assert.match(source, /\bRotateCwSquare\b/, "rotate icon should use RotateCwSquare");
});

test("core UI copy is exposed in English", () => {
  const shell = read("components/ProtectedLayoutShell.tsx");
  const search = read("app/(protected)/search/page.tsx");
  const login = read("components/LoginPageClient.tsx");
  const layout = read("app/layout.tsx");
  const favorites = read("app/(protected)/favorites/page.tsx");
  const discover = read("app/(protected)/discover/page.tsx");

  assert.match(layout, /<html lang="en">/);
  assert.match(shell, />\s*Home\s*</);
  assert.match(shell, />\s*Favorites\s*</);
  assert.match(shell, />\s*Popular\s*</);
  assert.match(shell, />\s*Discover\s*</);
  assert.match(search, /Search creators/);
  assert.match(search, />\s*Search\s*</);
  assert.match(login, /Use a Passkey/);
  assert.match(login, /Sign in/);
  assert.match(favorites, /Favorites/);
  assert.match(discover, /Discover/);
});
