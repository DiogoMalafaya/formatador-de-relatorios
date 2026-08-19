import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Standalone output produces a self-contained server bundle for the container
   * image. See the Dockerfile and the hosting note in CLAUDE.md: the PDF
   * renderer (DIO-11) needs a real Node process with headless Chromium, which
   * rules out a purely serverless deployment.
   */
  output: "standalone",
};

export default nextConfig;
