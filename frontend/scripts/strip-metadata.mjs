#!/usr/bin/env node
// strip-metadata.mjs : remove ALL metadata from media files, losslessly & idempotently.
//
// Strips EXIF/GPS, IPTC, XMP, ICC, author/software/dates, embedded thumbnails, ID3, etc.
// No re-encoding (stream copy / tag wipe) so there is no quality loss.
//
//   - images / pdf  -> exiftool-vendored   (npm i -D exiftool-vendored)
//   - audio / video -> ffmpeg-static        (npm i -D ffmpeg-static)
// Both are loaded lazily: a project that has only images needs only exiftool-vendored.
//
// Usage:
//   node strip-metadata.mjs                 # scan cwd (minus build/vendor dirs)
//   node strip-metadata.mjs public static   # scan specific dirs
//   node strip-metadata.mjs a.jpg b.mp4     # clean specific files (used by git hook)

import { readdir, rename, unlink, open, copyFile, stat } from "node:fs/promises";
import { join, extname, dirname, basename, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const run = promisify(execFile);
// Resolve dependencies from the PROJECT (cwd), not from wherever this script lives,
// so it works whether it sits in scripts/ or is run from elsewhere.
const requireFromCwd = createRequire(pathToFileURL(join(process.cwd(), "_.js")));
async function importFromCwd(name) {
  return import(pathToFileURL(requireFromCwd.resolve(name)).href);
}

const IMAGE = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".tiff", ".tif", ".heic", ".heif", ".avif", ".pdf"]);
const AV = new Set([".mp4", ".mov", ".webm", ".m4v", ".avi", ".mkv", ".mp3", ".wav", ".m4a", ".flac", ".aac", ".ogg", ".opus"]);
const IGNORE = new Set([
  "node_modules", ".git", ".svn", "dist", "build", "out", ".next", ".nuxt", ".astro",
  ".svelte-kit", ".cache", ".output", "vendor", "coverage", ".vercel", ".netlify", "tmp",
]);

let exiftool = null;   // lazy singleton
let ffmpegPath = null; // lazy singleton

async function getExiftool() {
  if (exiftool) return exiftool;
  try {
    ({ exiftool } = await importFromCwd("exiftool-vendored"));
    return exiftool;
  } catch {
    throw new Error("exiftool-vendored is not installed. Run: npm i -D exiftool-vendored");
  }
}
async function getFfmpeg() {
  if (ffmpegPath) return ffmpegPath;
  try {
    ffmpegPath = (await importFromCwd("ffmpeg-static")).default;
    if (!ffmpegPath) throw new Error("no binary");
    return ffmpegPath;
  } catch {
    throw new Error("ffmpeg-static is not installed. Run: npm i -D ffmpeg-static");
  }
}

async function walk(dir, out) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!IGNORE.has(entry.name) && !entry.name.startsWith(".")) await walk(join(dir, entry.name), out);
    } else {
      out.push(join(dir, entry.name));
    }
  }
}

// Detect true format from magic bytes so a mislabeled file (JPEG named .png) is fixed.
async function realExt(file) {
  const fd = await open(file, "r");
  try {
    const { buffer: b } = await fd.read(Buffer.alloc(12), 0, 12, 0);
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return ".jpg";
    if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return ".png";
    if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return ".gif";
    if (b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP") return ".webp";
    if (b.subarray(0, 4).toString() === "%PDF") return ".pdf";
    return null;
  } finally {
    await fd.close();
  }
}

async function cleanImage(file) {
  const et = await getExiftool();
  const ext = extname(file).toLowerCase();
  const actual = await realExt(file);
  if (actual && actual !== ext && !(actual === ".jpg" && ext === ".jpeg")) {
    const tmp = join(dirname(file), `.clean-${basename(file, ext)}${actual}`);
    await copyFile(file, tmp);
    await et.write(tmp, {}, { writeArgs: ["-all=", "-overwrite_original"] });
    await rename(tmp, file);
    return;
  }
  await et.write(file, {}, { writeArgs: ["-all=", "-overwrite_original", "-m"] });
}

async function cleanAV(file) {
  const ff = await getFfmpeg();
  const tmp = join(dirname(file), `.clean-${basename(file)}`);
  await run(ff, ["-y", "-i", file, "-map_metadata", "-1", "-map", "0", "-c", "copy",
    "-id3v2_version", "0", "-write_id3v1", "0", tmp]);
  await rename(tmp, file);
}

async function collectTargets(args) {
  const roots = args.length ? args : ["."];
  const files = [];
  for (const a of roots) {
    const p = resolve(a);
    const s = await stat(p).catch(() => null);
    if (!s) { console.error(`  skip (not found) ${a}`); continue; }
    if (s.isDirectory()) await walk(p, files);
    else files.push(p);
  }
  return files;
}

async function main() {
  const files = await collectTargets(process.argv.slice(2));
  let cleaned = 0, skipped = 0;

  for (const file of files) {
    const ext = extname(file).toLowerCase();
    const isImg = IMAGE.has(ext), isAV = AV.has(ext);
    if (!isImg && !isAV) { skipped++; continue; }
    try {
      if (isImg) await cleanImage(file); else await cleanAV(file);
      cleaned++;
      console.log(`  cleaned  ${file}`);
    } catch (err) {
      console.error(`  FAILED   ${file}: ${err.message}`);
      process.exitCode = 1;
      await unlink(join(dirname(file), `.clean-${basename(file)}`)).catch(() => {});
    }
  }

  console.log(`\nMetadata stripped from ${cleaned} media file(s)${skipped ? `, ${skipped} non-media skipped` : ""}.`);
  if (exiftool) await exiftool.end();
}

main().catch(async (err) => {
  console.error(err.message || err);
  if (exiftool) await exiftool.end().catch(() => {});
  process.exit(1);
});
