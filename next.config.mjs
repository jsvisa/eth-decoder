import { execSync } from "node:child_process";

const getCommitSha = () => {
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA;
  }
  try {
    return execSync("git rev-parse HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "dev";
  }
};

const commitSha = getCommitSha();
const appVersion = commitSha === "dev" ? "dev" : `v-${commitSha.slice(0, 7)}`;

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
    NEXT_PUBLIC_APP_COMMIT_SHA: commitSha,
    NEXT_PUBLIC_APP_BUILD_DATE: new Date().toISOString(),
  },
};

export default nextConfig;
