/**
 * Chromium launcher for server-side PDF rendering (DIO-11).
 *
 * Production (Vercel serverless) uses `@sparticuz/chromium`'s bundled Linux
 * binary — a brotli-compressed Chromium built for exactly this kind of
 * function runtime. Dev and CI reuse whatever Chrome is already on the
 * machine (a developer's laptop has one; GitHub's `ubuntu-latest` runners
 * ship one too) instead of pulling down a second copy — that's what the
 * full `puppeteer` package's install step would do, and there's no reason to
 * pay that cost twice.
 *
 * `@sparticuz/chromium` is imported statically but its Chromium binary is
 * only inflated (and its path resolved) inside `resolveLaunchOptions`, never
 * at module load — so this stays safe to import during `next build`, which
 * runs with `NODE_ENV=production` but no deploy runtime underneath it.
 */

import { existsSync } from "node:fs";
import chromium from "@sparticuz/chromium";
import puppeteer, { type Browser, type LaunchOptions } from "puppeteer-core";

const LOCAL_CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];

function findLocalChrome(): string | undefined {
  return LOCAL_CHROME_PATHS.find((path) => existsSync(path));
}

async function resolveLaunchOptions(): Promise<LaunchOptions> {
  if (process.env.NODE_ENV === "production") {
    return {
      executablePath: await chromium.executablePath(),
      args: chromium.args,
      headless: true,
    };
  }

  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH ?? findLocalChrome();
  if (!executablePath) {
    throw new Error(
      "No local Chrome/Chromium found for PDF rendering. Install Google Chrome, " +
        "or set PUPPETEER_EXECUTABLE_PATH to a Chromium executable.",
    );
  }
  return { executablePath, headless: true };
}

export async function launchBrowser(): Promise<Browser> {
  return puppeteer.launch(await resolveLaunchOptions());
}
