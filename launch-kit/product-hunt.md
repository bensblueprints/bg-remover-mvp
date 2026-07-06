# Product Hunt Launch — BG Remover

## Name
BG Remover

## Tagline (60 chars max)
Local AI background removal. Unlimited. Pay once, own it. (57 chars)

## Description (260 chars max)
BG Remover replaces remove.bg's $9/mo credit treadmill with a $24 one-time desktop app. AI background removal runs 100% on your machine — unlimited images, full resolution, batch export, and total privacy. Your photos never touch a server. (243 chars)

## Full description

remove.bg charges $9/month for 40 credits, caps free downloads at 0.25 megapixels, and uploads every single photo to their cloud. If you cut out product shots, thumbnails, or profile pics regularly, you're renting a feature your own computer can do for free.

BG Remover is a desktop app (Windows-first, open source) that runs an ONNX segmentation model locally:

- **Drag & drop** single images or whole batches (JPG/PNG/WebP)
- **Before/after preview** with a checkerboard behind the transparent result
- **Output options**: transparent PNG, white, black, or any custom background color
- **Batch export** to any folder with a progress bar
- **Full resolution always** — no credits, no caps
- **100% private** — the only network call is a one-time ~80 MB model download, clearly shown in the UI; after that it works fully offline

Built with Electron + @imgly/background-removal-node (U²-Net via onnxruntime). Inference runs in an isolated worker process, so the UI stays smooth even on big batches.

$24 once. No subscription. MIT-licensed source on GitHub — or grab the 1-click Windows installer if you'd rather skip the setup.

## Maker first comment

Hey PH 👋

I got tired of paying $9/mo to remove.bg just to cut out product photos — and honestly more tired of the credit math. 40 credits a month, full resolution costs a credit each, and every image goes to their servers.

Meanwhile the actual AI that does this (U²-Net-class segmentation) is open, small (~80 MB), and runs great on a normal laptop CPU. So I built the tool I wanted: drop images in, get transparent PNGs out, unlimited, offline, full res.

Some honest notes:
- It's CPU inference — a big photo takes a few seconds, not milliseconds. For batches, it queues sequentially and just churns through them.
- Edge quality is on par with remove.bg for most subjects (products, people, animals); extremely fine hair on busy backgrounds is still where cloud giants have an edge.
- The source is MIT on GitHub. The $24 buys you the packaged 1-click installer and supports development.

Would love feedback — especially on what output formats you'd want next (WebP with alpha? PSD layers?).

## Gallery shots (5)

1. **Hero** — app window, dark UI, a product photo mid-preview: original on the left, transparent cutout on checkerboard on the right, green "Remove backgrounds" button visible.
2. **Batch queue** — sidebar loaded with 12 images, mixed statuses (Done ✓ / Processing… / Queued), progress bar showing 7/12.
3. **Background options** — close crop of the controls bar: Transparent / White / Black / Custom segments with the color picker open on a brand green.
4. **Privacy diagram** — simple graphic: "Your image → your CPU → your folder" vs remove.bg's "Your image → their cloud". Caption: "The only upload is no upload."
5. **Pricing math** — side-by-side card: remove.bg $9/mo × 12 = $108/yr vs BG Remover $24 once, "pays for itself in month 3" annotation.
