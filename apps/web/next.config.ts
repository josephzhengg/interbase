import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@interbase/db"],
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
