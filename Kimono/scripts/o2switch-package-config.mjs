const BASE_RUNTIME_DEPENDENCIES = [
  "@simplewebauthn/browser",
  "@simplewebauthn/server",
  "bcryptjs",
  "class-variance-authority",
  "clsx",
  "ffmpeg-static",
  "fluent-ffmpeg",
  "lucide-react",
  "mysql2",
  "next",
  "next-auth",
  "otplib",
  "qrcode",
  "radix-ui",
  "react",
  "react-dom",
  "tailwind-merge",
];

export const ARTIFACT_NAME = "kimono-o2switch-linux-prebuilt.zip";

export const RUNTIME_INCLUDE_PATHS = [
  ".next",
  "app",
  "auth.ts",
  "components",
  "contexts",
  "deploy/o2switch-init.sql",
  "hooks",
  "lib",
  "next.config.mjs",
  "package-lock.json",
  "package.json",
  "proxy.ts",
  "public",
  "server.js",
];

export const EXCLUDED_SOURCE_PATHS = [
  ".env",
  ".env.local",
  ".env.production",
  ".git",
  ".next",
  ".npm-cache",
  "debug.log",
  "deploy-package",
  "dev.db",
  "init-error.log",
  "next_error.log",
  "node_modules",
  "prisma/dev.db",
  "test_*.js",
  "test_*.json",
  "test_*.log",
  "test_*.ts",
  "tests",
  "tsconfig.tsbuildinfo",
];

export const LOCAL_ONLY_DEPENDENCIES = [
  "@prisma/adapter-better-sqlite3",
  "@prisma/client",
  "better-sqlite3",
  "dotenv",
  "prisma",
  "shadcn",
];

export const RUNTIME_DEPENDENCY_NAMES = [...BASE_RUNTIME_DEPENDENCIES];

function getLockPackages(sourceLock) {
  return sourceLock && typeof sourceLock === "object" && sourceLock.packages && typeof sourceLock.packages === "object"
    ? sourceLock.packages
    : null;
}

function getLockedVersion(sourceLock, name) {
  const lockPackages = getLockPackages(sourceLock);
  if (!lockPackages) {
    return null;
  }

  const packageEntry = lockPackages[`node_modules/${name}`];
  if (packageEntry && typeof packageEntry.version === "string") {
    return packageEntry.version;
  }

  return null;
}

export function createRuntimePackageManifest(sourcePackage, sourceLock = null) {
  const sourceDependencies = sourcePackage.dependencies ?? {};
  const sourceOptionalDependencies = sourcePackage.optionalDependencies ?? {};
  const runtimeDependencies = Object.fromEntries(
    RUNTIME_DEPENDENCY_NAMES.flatMap((name) => {
      const lockedVersion = getLockedVersion(sourceLock, name);
      const version = lockedVersion ?? sourceDependencies[name] ?? sourceOptionalDependencies[name];
      return version ? [[name, version]] : [];
    })
  );

  return {
    name: sourcePackage.name,
    version: sourcePackage.version,
    private: sourcePackage.private ?? true,
    scripts: {
      start: "node server.js",
    },
    dependencies: runtimeDependencies,
  };
}

