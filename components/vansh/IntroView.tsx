"use client";
// "बंश परिचय": the home page. Story of the Baral family's origin and spread, told along a growing spine,
// with the handwritten proofs readable through a magnifier.
import React, { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { BASIS, BROTHERS, DOCS, FIXES, IDENTITY, LADDER, ROUTE, SOURCES, SPREAD, STAGES, type Basis } from "@/lib/vansh/intro";
import { np } from "@/lib/vansh/text";
import { useVansh } from "./VanshContext";

const Tag = ({ b }: { b: Basis }) => (
  <span className={`bs bs-${b}`} title={BASIS[b].t}>
    {BASIS[b].l}
  </span>
);

/** Adds `on` once the element has scrolled into view. */
function useSeen<T extends HTMLElement>(margin = "-12% 0px -12% 0px") {
  const ref = useRef<T>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setOn(true);
          io.disconnect();
        }
      },
      { rootMargin: margin }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [margin]);
  return [ref, on] as const;
}

interface Zoom {
  src: string;
  alt: string;
  w: number;
  h: number;
}

/** Full-screen view of a scan (Esc or tap to close, scroll to pan). */
function Lightbox({ z, onClose }: { z: Zoom; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="lb" role="dialog" aria-modal="true" aria-label={z.alt} onClick={onClose}>
      <button className="ghost lbx" aria-label="बन्द गर्ने" onClick={onClose}>✕</button>
      <div className="lbs" onClick={(e) => e.stopPropagation()}>
        <Image src={z.src} alt={z.alt} width={z.w} height={z.h} unoptimized className="lbi" />
      </div>
    </div>
  );
}

const LENS = 150;
const ZOOM = 2.6;

/** A scan with a mouse magnifier (the handwriting is small). Tap or Enter opens the full-screen view. */
function Scan({ z, onOpen, priority }: { z: Zoom; onOpen: (z: Zoom) => void; priority?: boolean }) {
  const box = useRef<HTMLButtonElement>(null);
  const lens = useRef<HTMLSpanElement>(null);
  const move = useCallback(
    (e: React.PointerEvent) => {
      const b = box.current;
      const l = lens.current;
      if (!b || !l || e.pointerType !== "mouse") return;
      const r = b.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      l.style.opacity = "1";
      l.style.transform = `translate(${x - LENS / 2}px, ${y - LENS / 2}px)`;
      l.style.backgroundSize = `${r.width * ZOOM}px ${r.height * ZOOM}px`;
      l.style.backgroundPosition = `${LENS / 2 - x * ZOOM}px ${LENS / 2 - y * ZOOM}px`;
    },
    []
  );
  return (
    <button
      ref={box}
      className="scan"
      onClick={() => onOpen(z)}
      onPointerMove={move}
      onPointerLeave={() => lens.current && (lens.current.style.opacity = "0")}
      aria-label={`${z.alt} — ठूलो गरी हेर्ने`}
    >
      <Image src={z.src} alt={z.alt} width={z.w} height={z.h} unoptimized priority={priority} />
      <span ref={lens} className="lens" aria-hidden="true" style={{ backgroundImage: `url(${z.src})`, width: LENS, height: LENS }} />
      <em>🔍 ठूलो गर्न थिच्नुहोस्</em>
    </button>
  );
}

function Flame() {
  return (
    <svg className="flame" viewBox="0 0 120 170" aria-hidden="true">
      <defs>
        <radialGradient id="fg" cx="50%" cy="72%" r="60%">
          <stop offset="0" stopColor="#fff3c4" />
          <stop offset=".45" stopColor="#f6b73c" />
          <stop offset="1" stopColor="#d8561f" />
        </radialGradient>
      </defs>
      <path className="fo" d="M60 6C70 44 108 66 108 108c0 33-22 56-48 56S12 141 12 108c0-26 14-38 24-56 4 12 10 20 16 22C48 50 52 28 60 6z" fill="url(#fg)" />
      <path className="fi" d="M60 80c6 22 26 32 26 54 0 17-11 28-26 28s-26-11-26-28c0-14 8-20 14-32 3 8 7 11 10 12-1-12 0-22 2-34z" fill="#fff6d6" opacity=".85" />
    </svg>
  );
}

function Stage({ s, last }: { s: (typeof STAGES)[number]; last: boolean }) {
  const [ref, on] = useSeen<HTMLLIElement>("-25% 0px -25% 0px");
  return (
    <li ref={ref} className={`stage${on ? " on" : ""}${last ? " last" : ""}`}>
      <span className="node" aria-hidden="true" />
      <p className="era">{s.era}</p>
      <h3>{s.h}</h3>
      <p className="body">{s.p}</p>
      <Tag b={s.b} />
    </li>
  );
}

function Route() {
  const [ref, on] = useSeen<HTMLDivElement>("-10% 0px -10% 0px");
  return (
    <div ref={ref} className={`route${on ? " on" : ""}`} role="img" aria-label="पश्चिमबाट पूर्वतर्फ: अछाम, कास्की-लमजुङ, सिन्धुली-ओखलढुङ्गा, ताप्लेजुङ-इलाम, तराई र भारत">
      <div className="rt">
        <svg viewBox="0 0 1000 120" preserveAspectRatio="none" aria-hidden="true">
          <path d="M20 70 C 160 20, 260 110, 400 64 S 640 20, 760 70 S 920 100, 980 56" pathLength="1" />
        </svg>
        {ROUTE.map((r, i) => (
          <div key={r.name} className="stop" style={{ left: `${r.x}%`, transitionDelay: `${0.25 + i * 0.22}s` }}>
            <i />
            <b>{r.name}</b>
            <small>{r.sub}</small>
          </div>
        ))}
        <span className="cmp w">पश्चिम</span>
        <span className="cmp e">पूर्व</span>
      </div>
    </div>
  );
}

export default function IntroView() {
  const { setTab, people } = useVansh();
  const [zoom, setZoom] = useState<Zoom | null>(null);
  const [open, setOpen] = useState("बराल");
  const n = people.length;

  const rootPaper: Zoom = { src: "/vansh/baral-tree-root.jpg", alt: "घृतकौशिक गोत्रीय बरालको मूल आधार — वंशवृक्ष", w: 1200, h: 2046 };
  const cur = BROTHERS.find((b) => b.sur === open) || BROTHERS[2];

  return (
    <div className="intro">
      <section className="hero">
        <Flame />
        <p className="nm">॥ श्री घृतकौशिकाय नमः ॥</p>
        <h2 className="word" aria-label="बराल">बराल</h2>
        <p className="hook">
          चौधौँ शताब्दीका एक दुवेदेखि आजसम्म{n ? <> — यो वंशावलीमा अहिले <b>{np(n)}</b> जना</> : null}। थर कसरी बन्यो, कता-कता फैलियौँ, र हाम्रा बुढापाकाले कागजमा के छोडे — यहीँ पढ्नुहोस्।
        </p>
        <div className="row">
          <a className="cta" href="#katha" onClick={(e) => { e.preventDefault(); document.getElementById("katha")?.scrollIntoView({ behavior: "smooth" }); }}>कथा पढ्न सुरु गर्नुहोस्</a>
          <button className="ghost" onClick={() => setTab("fam")}>आफ्नो परिवार हेर्नुहोस्</button>
        </div>
      </section>

      <section className="sec" aria-labelledby="h-id">
        <h2 id="h-id">परिचय</h2>
        <p className="lede">हामी कहाँबाट आयौँ, कसरी &lsquo;बराल&rsquo; भयौँ र कता-कता फैलियौँ — यहि कुरालाई यहाँ हस्तलिखित कागजसँग जोडेर राख्ने प्रयास गरिएको छ। परम्परा र प्रमाण छुट्टिन सकून् भनेर हरेकमा प्रमाणको आधार पनि लेखिएको छ।</p>
        <dl className="facts">
          {IDENTITY.map((x) => (
            <div key={x.k}>
              <dt>{x.k}</dt>
              <dd>
                <span>{x.v}</span>
                <Tag b={x.b} />
                {x.note && <small>{x.note}</small>}
              </dd>
            </div>
          ))}
        </dl>
        <p className="legend" aria-label="प्रमाणका चिह्न">
          {(Object.keys(BASIS) as Basis[]).map((b) => (
            <span key={b}><Tag b={b} /> <small>{BASIS[b].t}</small></span>
          ))}
        </p>
      </section>

      <section className="sec" id="katha" aria-labelledby="h-st">
        <h2 id="h-st">उत्पत्ति: &lsquo;दुवे&rsquo; देखि &lsquo;बराल&rsquo; सम्म</h2>
        <ol className="spine">
          {STAGES.map((s, i) => (
            <Stage key={s.h} s={s} last={i === STAGES.length - 1} />
          ))}
        </ol>
      </section>

      <section className="sec" aria-labelledby="h-br">
        <h2 id="h-br">एउटै बुबाका चार छोरा</h2>
        <p className="lede">जयविद्याधर पण्डितका चार छोराले चार गाउँको बिर्ता पाए, र गाउँकै नाम थर भयो। कुनै थर थिचेर हेर्नुहोस्।</p>
        <div className="grove" role="tablist" aria-label="चार थर">
          {BROTHERS.map((b) => (
            <button
              key={b.sur}
              role="tab"
              aria-selected={open === b.sur}
              className={`leaf${open === b.sur ? " on" : ""}${b.sur === "बराल" ? " me" : ""}`}
              onClick={() => setOpen(b.sur)}
            >
              <strong>{b.sur}</strong>
              <small>{b.name}</small>
            </button>
          ))}
        </div>
        <div className="leafcard" role="tabpanel" key={cur.sur}>
          <p><b>{cur.sur}</b> — {cur.name}</p>
          <p>📍 {cur.place}</p>
          {cur.note && <p className="mut">{cur.note}</p>}
        </div>
        <p className="mut">
          चारै थरको गोत्र एउटै हो र दाजुभाइको साइनो मानिन्छ। बंगालको सुवर्ण वणिक समुदायमा पनि &lsquo;बराल&rsquo; थर पाइन्छ; त्यो यो वंशसँग सम्बन्धित होइन।
        </p>
      </section>

      <section className="sec paper" aria-labelledby="h-pr">
        <h2 id="h-pr">कागजमा लेखिएको प्रमाण</h2>
        <p className="lede">
          वि.सं. २०३४ मा काशीमा बसेर पं. शिवराज शर्माले हातले बनाएको कुलद्रुम (वंशवृक्ष)। माउस घुमाएर सानो अक्षर पढ्नुहोस्।
        </p>
        <div className="two">
          <Scan z={rootPaper} onOpen={setZoom} priority />
          <div>
            <h3>पुस्ता</h3>
            <ol className="ladder">
              {[...LADDER].reverse().map((x) => (
                <li key={x.n}>
                  <b>{x.n}</b>
                  {x.sub && <small>{x.sub}</small>}
                </li>
              ))}
            </ol>
            <blockquote>
              वेदाग्निशून्यद्वयवैक्रमेऽब्दके काश्यामिषे मासि सिते हरेर्दिने।
              <br />
              निर्माय हस्तेन कुलद्रुमः शुभः पट्टीकृतोऽयं शिवराज शर्मणा॥
              <small>वेद(४) अग्नि(३) शून्य(०) द्वय(२) — दायाँबाट बायाँ पढ्दा वि.सं. २०३४, आश्विन शुक्ल एकादशी।</small>
            </blockquote>
          </div>
        </div>
      </section>

      <section className="sec" aria-labelledby="h-rt">
        <h2 id="h-rt">पश्चिमबाट पूर्वतिर</h2>
        <p className="lede">अछामको बारलाबाट सुरु भएर आजसम्म आइपुग्दा बरालहरू यी ठाउँ हुँदै फैलिए।</p>
        <Route />
        <div className="regions">
          {SPREAD.map((s) => (
            <details key={s.h} open>
              <summary>{s.h}</summary>
              <p>{s.p}</p>
              <p className="chips">
                {s.places.map((p) => (
                  <span key={p} className="chip">{p}</span>
                ))}
              </p>
            </details>
          ))}
        </div>
      </section>

      <section className="sec" aria-labelledby="h-dc">
        <h2 id="h-dc">हाम्रा हस्तलिखित अभिलेख</h2>
        <p className="lede">पुराना कागज स्क्यान गरेर राख्दा आउने पुस्ताले पनि पढ्न पाउँछन्।</p>
        <div className="docs3">
          {DOCS.map((d) => (
            <figure key={d.id} className="doc">
              {d.src ? (
                <Scan z={{ src: d.src, alt: d.title, w: d.w || 1200, h: d.h || 1600 }} onOpen={setZoom} />
              ) : (
                <div className="slot"><span aria-hidden="true">📄</span>फाइल आउन बाँकी</div>
              )}
              <figcaption>
                <b>{d.title}</b>
                <small>{d.desc}</small>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <details className="sec srcs">
        <summary>स्रोत र पुरानो लेखमा के सच्याइयो</summary>
        <h3>सच्याइएका कुरा</h3>
        <ul>
          {FIXES.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
        <h3>स्रोत</h3>
        <ul>
          {SOURCES.map((s) => (
            <li key={s.u}>
              <a href={s.u} target="_blank" rel="noopener noreferrer">{s.t}</a>
            </li>
          ))}
        </ul>
        <p className="mut">यी वेबसाइटले पनि वंशावलीकै आधारमा लेखेका हुन्; निर्णायक प्रमाण होइनन्। मूल पाना र कुल पुरोहितको जानकारी नै अन्तिम आधार हुन्।</p>
      </details>

      <div className="end">
        <p>आफ्नो हाँगा खोज्न तयार हुनुहुन्छ?</p>
        <div className="row">
          <button onClick={() => setTab("fam")}>आफ्नो परिवार हेर्नुहोस्</button>
          <button className="ghost" onClick={() => setTab("tree")}>वंशवृक्ष खोल्नुहोस्</button>
        </div>
      </div>

      {zoom && <Lightbox z={zoom} onClose={() => setZoom(null)} />}
    </div>
  );
}
