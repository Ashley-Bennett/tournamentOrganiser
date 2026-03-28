/**
 * Converts all PNG screenshots to WebP at max 900px wide.
 * Runs automatically as a prebuild step — do not delete.
 *
 * To add a new screenshot: drop the .png into public/screenshots/
 * and add width/height to the ScreenshotFrame call in Landing.tsx.
 * The .webp will be generated on the next build.
 */

import sharp from "sharp";
import { readdir, stat } from "fs/promises";
import { join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const screenshotsDir = resolve(__dirname, "../public/screenshots");
const MAX_WIDTH = 900;

const files = await readdir(screenshotsDir);
const pngs = files.filter((f) => f.endsWith(".png"));

for (const file of pngs) {
  const pngPath = join(screenshotsDir, file);
  const webpPath = join(screenshotsDir, file.replace(/\.png$/, ".webp"));

  // Skip if webp is newer than png
  try {
    const [pngStat, webpStat] = await Promise.all([stat(pngPath), stat(webpPath)]);
    if (webpStat.mtimeMs >= pngStat.mtimeMs) {
      console.log(`  skip  ${file} (webp up to date)`);
      continue;
    }
  } catch {
    // webp doesn't exist yet — proceed
  }

  await sharp(pngPath)
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: 85 })
    .toFile(webpPath);

  console.log(`  built ${file.replace(".png", ".webp")}`);
}
