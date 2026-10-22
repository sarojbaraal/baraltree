"use client";
// Profile photo picker: choose → crop to a square (drag, wheel, pinch, slider) → compress to WebP ≤ 512 KB.
import React, { useEffect, useRef, useState } from "react";

const V = 280; // crop viewport (px)
const OUT = 640; // first output size (px)
const MAX_BYTES = 512 * 1024;
const MAX_INPUT = 25 * 1024 * 1024;

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

function toWebp(canvas: HTMLCanvasElement, q: number): Promise<Blob | null> {
  return new Promise((res) => canvas.toBlob(res, "image/webp", q));
}

/** Renders the chosen square to WebP and shrinks quality, then size, until it fits in 512 KB. */
async function compress(img: HTMLImageElement, sx: number, sy: number, sw: number): Promise<Blob> {
  let size = OUT;
  for (let round = 0; round < 5; round++) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("ब्राउजरले फोटो प्रशोधन गर्न सकेन");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, sw, sw, 0, 0, size, size);
    for (const q of [0.88, 0.78, 0.68, 0.56, 0.45]) {
      const b = await toWebp(c, q);
      if (!b) throw new Error("तपाईंको ब्राउजरले WebP बनाउन सकेन");
      if (b.type !== "image/webp") throw new Error("तपाईंको ब्राउजरले WebP बनाउन सकेन");
      if (b.size <= MAX_BYTES) return b;
    }
    size = Math.round(size * 0.8);
  }
  throw new Error("फोटो ५१२KB भित्र सानो बनाउन सकिएन — अर्को फोटो छान्नुहोस्");
}

export default function PhotoCrop({
  onChange, current,
}: { onChange: (f: File | null) => void; current?: string | null }) {
  const [src, setSrc] = useState<string | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [z, setZ] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [info, setInfo] = useState("");
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; z: number } | null>(null);

  useEffect(() => () => { if (src) URL.revokeObjectURL(src); }, [src]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const base = img ? V / Math.min(img.naturalWidth, img.naturalHeight) : 1;
  const s = base * z;
  const limit = (zz: number, o: { x: number; y: number }) => {
    if (!img) return o;
    const ss = base * zz;
    const mx = Math.max(0, (img.naturalWidth * ss - V) / 2);
    const my = Math.max(0, (img.naturalHeight * ss - V) / 2);
    return { x: clamp(o.x, -mx, mx), y: clamp(o.y, -my, my) };
  };
  const setZoom = (zz: number) => {
    const n = clamp(zz, 1, 5);
    setZ(n);
    setOff((o) => limit(n, o));
  };

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    setErr("");
    if (!f) return;
    if (!f.type.startsWith("image/")) return setErr("यो फाइल फोटो होइन। JPG, PNG वा WebP फोटो छान्नुहोस्।");
    if (f.size > MAX_INPUT) return setErr(`फोटो धेरै ठूलो छ (${(f.size / 1048576).toFixed(1)} MB)। २५ MB भन्दा सानो फोटो छान्नुहोस्।`);
    const url = URL.createObjectURL(f);
    const im = new Image();
    im.onload = () => {
      setSrc(url);
      setImg(im);
      setZ(1);
      setOff({ x: 0, y: 0 });
    };
    im.onerror = () => {
      URL.revokeObjectURL(url);
      setErr("यो फोटो खोल्न सकिएन (HEIC जस्ता ढाँचा समर्थित छैनन्)। JPG वा PNG प्रयोग गर्नुहोस्।");
    };
    im.src = url;
  };

  const down = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), z };
    }
  };
  const move = (e: React.PointerEvent) => {
    const p = ptrs.current.get(e.pointerId);
    if (!p) return;
    if (ptrs.current.size === 2 && pinch.current) {
      ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [a, b] = [...ptrs.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      setZoom((pinch.current.z * d) / (pinch.current.d || 1));
      return;
    }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setOff((o) => limit(z, { x: o.x + dx, y: o.y + dy }));
  };
  const up = (e: React.PointerEvent) => {
    ptrs.current.delete(e.pointerId);
    pinch.current = null;
  };

  const apply = async () => {
    if (!img) return;
    setBusy(true);
    setErr("");
    try {
      const sw = V / s;
      const sx = clamp(img.naturalWidth / 2 - (V / 2 + off.x) / s, 0, img.naturalWidth - sw);
      const sy = clamp(img.naturalHeight / 2 - (V / 2 + off.y) / s, 0, img.naturalHeight - sw);
      const blob = await compress(img, sx, sy, sw);
      const file = new File([blob], `photo-${Date.now()}.webp`, { type: "image/webp" });
      onChange(file);
      setPreview(URL.createObjectURL(blob));
      setInfo(`${Math.round(blob.size / 1024)} KB · WebP`);
      setSrc(null);
      setImg(null);
    } catch (er) {
      setErr("❌ " + (er as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    setSrc(null);
    setImg(null);
    setErr("");
  };
  const clear = () => {
    onChange(null);
    setPreview(null);
    setInfo("");
  };

  return (
    <div className="pcrop">
      <label className="filebtn">
        <input type="file" accept="image/*" hidden onChange={pick} />
        📷 {preview || current ? "फोटो फेर्ने" : "फोटो छान्ने"}
      </label>
      {(preview || current) && !img && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="pc-prev" src={preview || current!} alt="" />
      )}
      {info && !img && <small className="mut"> {info} <button type="button" className="ghost" onClick={clear}>हटाउने</button></small>}
      {img && src && (
        <div className="pc-box">
          <div
            className="pc-view"
            style={{ width: V, height: V }}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onWheel={(e) => setZoom(z * (e.deltaY < 0 ? 1.08 : 0.92))}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt=""
              draggable={false}
              style={{
                width: img.naturalWidth * s,
                height: img.naturalHeight * s,
                transform: `translate(${V / 2 + off.x - (img.naturalWidth * s) / 2}px, ${V / 2 + off.y - (img.naturalHeight * s) / 2}px)`,
              }}
            />
            <i className="pc-ring" />
          </div>
          <input type="range" min={1} max={5} step={0.01} value={z} aria-label="जुम" onChange={(e) => setZoom(+e.target.value)} />
          <small className="mut">तान्नुहोस्, दुई औंलाले जुम गर्नुहोस्। वर्गाकार (१:१) काटिन्छ।</small>
          <div className="row">
            <button type="button" disabled={busy} onClick={apply}>{busy ? "सानो बनाउँदै…" : "✓ काट्ने"}</button>
            <button type="button" className="ghost" disabled={busy} onClick={cancel}>रद्द</button>
          </div>
        </div>
      )}
      {err && <div className="pc-err" role="alert">{err}</div>}
    </div>
  );
}
