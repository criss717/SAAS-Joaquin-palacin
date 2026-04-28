import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  staticPageGenerationTimeout: 300, // Aumentamos el tiempo de espera para que no falle el build en el CT
  experimental: {
    serverActions: {
      allowedOrigins: [
        "localhost:3000",
        process.env.NEXTAUTH_URL?.replace("http://", "") || "", // Extrae la IP/URL del .env
        "q6vq8nnf-3000.uks1.devtunnels.ms"
      ].filter(Boolean),
    },
  },
};

export default nextConfig;
