import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker uchun: sayt ishlashiga kerak faqat zarur fayllar bilan yig'iladi.
  output: "standalone",
};

export default nextConfig;
