import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@interbase/db"],
  serverExternalPackages: ["@electric-sql/pglite"],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals ?? []), "@electric-sql/pglite"];
    }
    return config;
  },
};

export default nextConfig;
