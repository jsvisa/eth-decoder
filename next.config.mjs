import { execSync } from "node:child_process";

const getAppVersion = () => {
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return `v-${process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)}`;
  }
  try {
    const sha = execSync("git rev-parse HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    return `v-${sha.slice(0, 7)}`;
  } catch {
    return "dev";
  }
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  env: {
    NEXT_PUBLIC_APP_VERSION: getAppVersion(),
  },
};

export default nextConfig;
