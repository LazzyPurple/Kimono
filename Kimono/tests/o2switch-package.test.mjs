import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const configModuleUrl = pathToFileURL(
  path.join(root, "scripts/o2switch-package-config.mjs")
).href;

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

test("o2switch packaging config defines the Linux prebuilt artifact shape", async () => {
  const config = await import(configModuleUrl);

  assert.equal(config.ARTIFACT_NAME, "kimono-o2switch-linux-prebuilt.zip");
  assert.ok(config.RUNTIME_INCLUDE_PATHS.includes(".next"));
  assert.ok(config.RUNTIME_INCLUDE_PATHS.includes("server.js"));
  assert.ok(config.RUNTIME_INCLUDE_PATHS.includes("deploy/o2switch-init.sql"));
  assert.ok(config.EXCLUDED_SOURCE_PATHS.includes("deploy-package"));
  assert.ok(config.EXCLUDED_SOURCE_PATHS.includes("dev.db"));
  assert.ok(config.EXCLUDED_SOURCE_PATHS.includes(".env.local"));
});

test("runtime package manifest keeps prod deps and strips local-only dependencies", async () => {
  const sourcePackage = readJson("package.json");
  const { createRuntimePackageManifest } = await import(configModuleUrl);

  const runtimePackage = createRuntimePackageManifest(sourcePackage);

  assert.equal(runtimePackage.private, true);
  assert.equal(runtimePackage.scripts.start, "node server.js");
  assert.equal(runtimePackage.scripts.build, undefined);
  assert.ok(runtimePackage.dependencies.next);
  assert.ok(runtimePackage.dependencies["next-auth"]);
  assert.ok(runtimePackage.dependencies.mysql2);
  assert.equal(runtimePackage.dependencies["@prisma/client"], undefined);
  assert.equal(runtimePackage.dependencies["@prisma/adapter-better-sqlite3"], undefined);
  assert.equal(runtimePackage.dependencies["better-sqlite3"], undefined);
  assert.equal(runtimePackage.devDependencies, undefined);
});

test("powershell wrapper converts Windows paths without piping raw backslashes into wslpath", () => {
  const helperScript = fs.readFileSync(
    path.join(root, "scripts", "o2switch-path-utils.ps1"),
    "utf8"
  );
  const buildScript = fs.readFileSync(
    path.join(root, "scripts", "build-o2switch-package.ps1"),
    "utf8"
  );

  assert.match(helperScript, /function Convert-WindowsPathToWslPath/);
  assert.match(helperScript, /\^\(\[A-Za-z\]\):\\\\\(\.\*\)\$/);
  assert.match(buildScript, /o2switch-path-utils\.ps1/);
  assert.match(buildScript, /Convert-WindowsPathToWslPath -Path \$Path/);
  assert.doesNotMatch(buildScript, /wsl\.exe wslpath -a \$resolvedPath/);
  assert.match(buildScript, /\$linuxStagingDir = Convert-ToWslPath -Path \$stagingDir/);
});

test("zip validation accepts Windows-style entry separators", () => {
  const buildScript = fs.readFileSync(
    path.join(root, "scripts", "build-o2switch-package.ps1"),
    "utf8"
  );

  assert.ok(buildScript.includes("$normalizedEntries = $zip.Entries.FullName"));
  assert.ok(buildScript.includes("-replace"));
  assert.ok(buildScript.includes(".next/BUILD_ID"));
});

test("WSL build script is checked in as a real Unix shell script", () => {
  const scriptBuffer = fs.readFileSync(path.join(root, "scripts", "build-o2switch-package.sh"));
  const gitAttributes = fs.readFileSync(path.join(root, "..", ".gitattributes"), "utf8");

  assert.equal(scriptBuffer[0], 0x23, "shell script should start directly with #!, without a UTF-8 BOM");
  assert.equal(scriptBuffer.includes(Buffer.from("\r\n")), false, "shell script should use LF line endings");
  assert.match(scriptBuffer.subarray(0, 20).toString("utf8"), /^#!\/usr\/bin\/env bash\n/);
  assert.match(gitAttributes, /^\*\.sh text eol=lf$/m);
});

test("WSL build script skips local Prisma generation for the production artifact", () => {
  const buildScript = fs.readFileSync(
    path.join(root, "scripts", "build-o2switch-package.sh"),
    "utf8"
  );

  assert.doesNotMatch(buildScript, /npm run prisma:generate/);
  assert.doesNotMatch(buildScript, /PRISMA_DISABLE_CONFIG=1 npm run prisma:generate/);
});

test("main source tree exposes the production bootstrap expected by o2switch", () => {
  const pkg = readJson("package.json");
  const serverPath = path.join(root, "server.js");

  assert.equal(pkg.scripts.build, "next build --webpack");
  assert.equal(
    pkg.scripts["build:o2switch-package"],
    "powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/build-o2switch-package.ps1"
  );
  assert.equal(fs.existsSync(serverPath), true, "server.js should exist at the app root");
});

test("perf-repository keeps Prisma imports lazy for production runtime packaging", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "lib", "perf-repository.ts"), "utf8");

  assert.equal(source.includes('from "./prisma.ts"'), false);
  assert.ok(source.includes('await import("./prisma.ts")'));
});
test("local-only Prisma files avoid static @prisma/client imports in the production build path", () => {
  const dataStoreSource = fs.readFileSync(path.join(root, "lib", "data-store.ts"), "utf8");
  const perfRepositorySource = fs.readFileSync(path.join(root, "lib", "perf-repository.ts"), "utf8");
  const prismaSource = fs.readFileSync(path.join(root, "lib", "prisma.ts"), "utf8");

  assert.ok(!dataStoreSource.includes('from "@prisma/client"'));
  assert.ok(!perfRepositorySource.includes('from "@prisma/client"'));
  assert.ok(!prismaSource.includes('import { PrismaClient } from "@prisma/client"'));
  assert.ok(prismaSource.includes('localRequire("@prisma/client")'));
});

test("runtime package manifest keeps ffmpeg dependencies required for server-side popular previews", async () => {
  const sourcePackage = readJson("package.json");
  const { createRuntimePackageManifest } = await import(configModuleUrl);

  const runtimePackage = createRuntimePackageManifest(sourcePackage);

  assert.ok(runtimePackage.dependencies["ffmpeg-static"]);
  assert.ok(runtimePackage.dependencies["fluent-ffmpeg"]);
});
