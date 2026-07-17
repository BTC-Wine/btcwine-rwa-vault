import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // 55 : hero plein ecran voile par un degrade, la compression ne se voit pas
    qualities: [55, 75],
  },
};

export default nextConfig;
