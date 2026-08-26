import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * `@sparticuz/chromium` resolves its bundled Chromium binary from a path
   * relative to its own module location at runtime (DIO-11's `browser.ts`).
   * Next's docs list it as auto-externalized, but that didn't hold under
   * Turbopack in production: the build relocated it into a server chunk,
   * severing that path — `chromium.executablePath()` then pointed at a
   * `bin` directory that doesn't exist in the deployed function, and every
   * render (DIO-12/13's preview) 500'd. Listing it explicitly here is the
   * fix the resulting error message itself points to.
   */
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
};

export default nextConfig;
