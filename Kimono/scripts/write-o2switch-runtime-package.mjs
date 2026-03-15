import fs from "node:fs";
import path from "node:path";
import { createRuntimePackageManifest } from "./o2switch-package-config.mjs";

const [, , sourcePackagePath, outputPackagePath] = process.argv;

if (!sourcePackagePath || !outputPackagePath) {
  console.error("Usage: node scripts/write-o2switch-runtime-package.mjs <source-package.json> <output-package.json>");
  process.exit(1);
}

const sourcePackage = JSON.parse(fs.readFileSync(sourcePackagePath, "utf8"));
const runtimePackage = createRuntimePackageManifest(sourcePackage);

fs.mkdirSync(path.dirname(outputPackagePath), { recursive: true });
fs.writeFileSync(outputPackagePath, `${JSON.stringify(runtimePackage, null, 2)}\n`, "utf8");
