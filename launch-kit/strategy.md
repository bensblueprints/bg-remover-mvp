# Launch Strategy — BG Remover

## Suggested price & competitor math

**$24 one-time.**

- remove.bg Personal: **$9/mo (40 credits)** → $108/year.
- BG Remover pays for itself in **under 3 months** (2.7 months), then it's free forever.
- Heavier users burn credits faster: remove.bg's pay-as-you-go is ~$1.99/image (1-credit pack) down to ~$0.20/image in bulk — a 200-image catalog shoot alone costs more than BG Remover does, once.
- $24 sits comfortably under the "no-thought purchase" line while signalling it's a real tool, not shovelware.

## Target communities (rules-aware angles)

- **r/ecommerce** and **r/EtsySellers** — angle: "how I stopped paying per-image for listing photos". No naked self-promo (both subs remove it); post as a cost-breakdown/workflow write-up with the GitHub link, mention the paid installer only when asked.
- **r/Entrepreneur** — allowed in "share your project" contexts; frame as build-in-public story: replaced a $108/yr sub with a weekend Electron app.
- **r/selfhosted** — angle: "local-first replacement for remove.bg". This community is explicitly anti-cloud; lead with privacy + offline, link the MIT repo (open source is required for a warm reception here — we have it).
- **r/photography** / **r/photoshop** — answer existing "how do I remove backgrounds in bulk?" threads with genuine help; mention the tool as one option among others (both subs are strict on spam).
- **r/opensource** — straight repo share; MIT license and "paid installer funds development" model is a well-liked pattern (post the repo, not the Whop link).
- **Hacker News** — Show HN (draft below).
- **Indie Hackers** — product page + milestone posts ("first 10 sales of a $24 one-time tool").

## Show HN draft

**Title:** Show HN: BG Remover – local, unlimited alternative to remove.bg (Electron + ONNX)

**Post:**
I kept paying remove.bg $9/month for 40 credits to cut out product photos, while knowing U²-Net-class models run fine on a laptop CPU.

BG Remover is an Electron app that runs @imgly/background-removal-node (ONNX Runtime) in a utilityProcess worker: drag-drop batches of JPG/PNG/WebP, get transparent PNGs (or any flat background color) at full resolution. The queue is sequential on purpose — predictable memory beats parallel inference OOMing on a 40-image batch.

Everything is local. The only network call the app ever makes is the one-time ~80 MB model download, surfaced explicitly in the UI. After that it's fully offline.

Source is MIT: https://github.com/bensblueprints/bg-remover
There's also a $24 packaged Windows installer for people who don't want to npm install.

Honest limitations: CPU inference takes a few seconds per photo; extremely fine hair on busy backgrounds is still better on the big cloud services. Curious what HN thinks of the "open core, paid installer" model for small desktop tools.

## SEO keywords (10)

1. remove.bg alternative
2. background remover no subscription
3. offline background remover
4. local AI background removal
5. batch background remover windows
6. remove background from image free unlimited
7. transparent PNG maker desktop
8. product photo background remover
9. background eraser one time purchase
10. private background removal tool

## AppSumo / PitchGround pitch

BG Remover turns a $108/year subscription into a $24 lifetime deal your audience actually keeps. It's a polished Electron desktop app that does AI background removal 100% locally — unlimited images, full resolution, batch export, transparent or custom-color backgrounds — with zero cloud dependency, zero recurring cost, and zero privacy exposure (images never leave the machine). The comparison sell writes itself: remove.bg charges $9/month for 40 credits; we charge once for infinity. MIT-licensed source on GitHub builds trust, the packaged installer is the product, and there are no server costs on our side — so deep LTD discounts stay profitable at any volume.
