// Decodes an image Blob into a square data URL (centre crop, like the chart's `object-fit: cover`).
//
// createImageBitmap() cannot decode SVG (Chrome throws InvalidStateError) and the site's default avatars
// (male.svg / female.svg in the `site-assets` bucket) are SVG, so they must go through an <img> element.
// The old code silently fell back to the built-in avatar when this failed, which is why downloads showed
// the old avatar while the chart showed the uploaded one.

interface Decoded {
  img: CanvasImageSource;
  w: number;
  h: number;
  done: () => void;
}

async function decodeBlob(blob: Blob): Promise<Decoded> {
  if (blob.type !== "image/svg+xml") {
    try {
      const bmp = await createImageBitmap(blob);
      return { img: bmp, w: bmp.width, h: bmp.height, done: () => bmp.close() };
    } catch {
      // fall through to <img>
    }
  }
  // a server may label an SVG as text/plain or octet-stream; <img> only accepts it as image/svg+xml
  const typed = /^image\//.test(blob.type) ? blob : new Blob([blob], { type: "image/svg+xml" });
  const url = URL.createObjectURL(typed);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  try {
    await img.decode();
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
  // an SVG with only a viewBox may report 0 in some browsers
  return { img, w: img.naturalWidth || 512, h: img.naturalHeight || 512, done: () => URL.revokeObjectURL(url) };
}

export interface SquareOpts {
  /** PNG keeps transparency (default avatars); JPEG (default) is filled with `bg` first so transparent areas are not black. */
  png?: boolean;
  bg?: string;
}

export async function blobToSquare(blob: Blob, size: number, opts: SquareOpts = {}): Promise<string> {
  const { img, w, h, done } = await decodeBlob(blob);
  try {
    const cv = document.createElement("canvas");
    cv.width = cv.height = size;
    const c = cv.getContext("2d");
    if (!c) return "";
    if (!opts.png) {
      c.fillStyle = opts.bg || "#fff";
      c.fillRect(0, 0, size, size);
    }
    const m = Math.min(w, h);
    c.drawImage(img, (w - m) / 2, (h - m) / 2, m, m, 0, 0, size, size);
    return opts.png ? cv.toDataURL("image/png") : cv.toDataURL("image/jpeg", 0.82);
  } finally {
    done();
  }
}
