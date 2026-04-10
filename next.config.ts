import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: [
        "q6vq8nnf-3000.uks1.devtunnels.ms",
        "localhost:3000"
      ],
    },
  },
};

export default nextConfig;
