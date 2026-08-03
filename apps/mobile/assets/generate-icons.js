/**
 * Run this once to create placeholder app icons:
 *   node assets/generate-icons.js
 *
 * Requires: npm install -g sharp-cli   OR   pnpm add -D sharp
 * For production, replace with your real branded PNG files.
 *
 * Required files:
 *   icon.png          — 1024×1024 (App Store / Play Store icon)
 *   splash.png        — 1284×2778 (iPhone 14 Pro Max, or any tall ratio)
 *   adaptive-icon.png — 1024×1024 (Android adaptive icon foreground, with padding)
 */

const { createCanvas } = require("canvas"); // npm install canvas
const fs = require("fs");
const path = require("path");

function makeIcon(size, filename) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#0d1117";
  ctx.fillRect(0, 0, size, size);

  // Rounded accent square
  const pad = size * 0.15;
  const r = size * 0.2;
  ctx.fillStyle = "#f59e0b";
  ctx.beginPath();
  ctx.roundRect(pad, pad, size - pad * 2, size - pad * 2, r);
  ctx.fill();

  // "POS" text
  ctx.fillStyle = "#000";
  ctx.font = `bold ${Math.round(size * 0.25)}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("POS", size / 2, size / 2);

  fs.writeFileSync(path.join(__dirname, filename), canvas.toBuffer("image/png"));
  console.log(`✓ ${filename} (${size}×${size})`);
}

function makeSplash() {
  const w = 1284, h = 2778;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#0d1117";
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "#f59e0b";
  ctx.font = `bold 80px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Restaurant POS", w / 2, h / 2 - 30);
  ctx.font = `40px Arial`;
  ctx.fillStyle = "#8b949e";
  ctx.fillText("Waiter App", w / 2, h / 2 + 50);

  fs.writeFileSync(path.join(__dirname, "splash.png"), canvas.toBuffer("image/png"));
  console.log("✓ splash.png (1284×2778)");
}

makeIcon(1024, "icon.png");
makeIcon(1024, "adaptive-icon.png");
makeSplash();
console.log("\nDone! Replace these with your real branded assets before submitting to app stores.");
