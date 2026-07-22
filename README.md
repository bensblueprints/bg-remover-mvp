# BG Remover

## Demo



https://github.com/user-attachments/assets/ed0dbbd5-c022-48af-a0f6-cfda5a18622e



[![License: MIT](https://img.shields.io/badge/License-MIT-22c55e.svg)](LICENSE)
[![Platform: Windows](https://img.shields.io/badge/Platform-Windows-0ea5e9.svg)](#quick-start)
[![100% Local](https://img.shields.io/badge/Processing-100%25%20Local-8b5cf6.svg)](#how-it-works)

**Remove image backgrounds with local AI. Unlimited images, full resolution, zero uploads.**

Pay once. Own it forever. No subscription.

remove.bg charges $9/month for 40 credits — and every photo you upload goes to their servers. BG Remover runs the same class of AI model **on your own machine**: no credits, no upload, no monthly bill, no resolution cap.

![screenshot](docs/screenshot.png)

## Features

- **Drag & drop** — single images or whole batches (JPG / PNG / WebP)
- **Before / after preview** — checkerboard view of the transparent result, per image
- **Flexible output** — transparent PNG, white/black, or any custom background color
- **Batch export** — pick a folder, hit one button, watch the progress bar
- **Full resolution** — your 6000×4000 photo stays 6000×4000 (remove.bg free tier caps at 0.25 MP)
- **100% private** — the AI model runs locally; your images never leave your computer
- **Memory-safe queue** — images process sequentially in an isolated worker process
- **Magic erase** — click any unwanted object and it's gone, background filled in by local inpainting AI (MobileSAM + LaMa ONNX, bundled in the installer)

Every AI model ships inside the installer, so nothing is ever downloaded — the app works fully offline from the very first launch. (Building from source? The models download once on first use instead.)

## ☕ Skip the setup — get the 1-click installer

Don't want to install Node and build from source? Grab the packaged Windows installer — one download, one click, done:

**→ [Get BG Remover on Whop](https://whop.com/benjisaiempire/cutaway)** — $24, one time, yours forever.

## Quick start (from source)

```bash
git clone https://github.com/bensblueprints/bg-remover.git
cd bg-remover
npm i
npm start
```

Requires Node 18+ (tested on Node 24) and Windows / macOS / Linux.

## BG Remover vs remove.bg

|  | **BG Remover** | remove.bg |
|---|---|---|
| Price | **$24 once** | $9/mo (40 credits) — $108/yr |
| Images | **Unlimited** | 40/month, then buy credits |
| Resolution | **Full, always** | Full res costs 1 credit per image |
| Privacy | **100% local — nothing uploaded** | Every image uploaded to their servers |
| Offline | **Yes** — all models ship in the installer | No |
| Batch processing | **Yes, built in** | Paid API / desktop app w/ credits |
| Source code | **Open (MIT)** | Closed |

$24 pays for itself in under 3 months — then it's free forever.

## How it works

BG Remover uses [`@imgly/background-removal-node`](https://github.com/imgly/background-removal-js), an ONNX segmentation model (U²-Net family) running via `onnxruntime-node` — the same local-inference approach behind modern in-browser editors, but at desktop speed with no canvas limits.

- **Electron main process** owns a sequential job queue (one image at a time = predictable memory).
- **Utility worker process** runs inference, so the UI never freezes — even on a 40-image batch.
- **sharp** handles compositing flat-color backgrounds and preserving full input resolution.

### Magic erase

Open an image, hit **✨ Magic erase**, and click the object you want gone.
A MobileSAM segmentation model turns your click into a precise object mask,
then a LaMa inpainting model fills the region with plausible background —
all on your CPU. Undo and Save are built in. Every AI model ships inside the
installer, so the app works offline from the very first launch. (Building
from source? Models download once on first use instead.)

No telemetry. No analytics. The installer never touches the network at all; source builds only download the models once on first use.

## Tech stack

- [Electron](https://www.electronjs.org/) — main + preload + renderer, utilityProcess worker
- [@imgly/background-removal-node](https://www.npmjs.com/package/@imgly/background-removal-node) — local ONNX background removal
- [sharp](https://sharp.pixelplumbing.com/) — image compositing / validation
- Plain HTML/CSS/JS renderer — dark mode, zero framework overhead

## Development

```bash
npm test                              # full suite: models, bundled models, segment, inpaint, erase, smoke
npx electron test/smoke-electron.js   # same pipeline inside Electron's runtime
npx electron test/dual-ort-electron.js # interleaved batch+magic worker crash regression
npm run dist                          # build Windows NSIS installer (electron-builder)
```

The smoke test generates a fixture with sharp, runs the actual ONNX pipeline, and asserts the output PNG has a working alpha channel (transparent background corners, opaque subject).

## License

[MIT](LICENSE) © 2026 Ben ([bensblueprints](https://github.com/bensblueprints))

## macOS build

See [MAC-BUILD.md](MAC-BUILD.md). Quickest path: GitHub **Actions** tab -> run the **Mac Build** (`mac-build.yml`) workflow to get a downloadable `.dmg` (unsigned - right-click -> Open on first launch).
