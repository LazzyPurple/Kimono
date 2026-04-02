import fs from "node:fs";
import path from "node:path";
import { createRuntimePackageManifest } from "./o2switch-package-config.mjs";

const [, , arg1, arg2, arg3] = process.argv;

const sourcePackagePath = arg1;
const maybeSourceLockPath = arg3 ? arg2 : null;
const outputPackagePath = arg3 ?? arg2;

if (!sourcePackagePath || !outputPackagePath) {
  console.error("Usage: node scripts/write-o2switch-runtime-package.mjs <source-package.json> [source-package-lock.json] <output-package.json>");
  process.exit(1);
}

const sourcePackage = JSON.parse(fs.readFileSync(sourcePackagePath, "utf8"));
const sourceLock = maybeSourceLockPath
  ? JSON.parse(fs.readFileSync(maybeSourceLockPath, "utf8"))
  : null;
const runtimePackage = createRuntimePackageManifest(sourcePackage, sourceLock);

fs.mkdirSync(path.dirname(outputPackagePath), { recursive: true });
fs.writeFileSync(outputPackagePath, `${JSON.stringify(runtimePackage, null, 2)}\n`, "utf8");
