"use client";
// "बंश परिचय": origin and spread of the Baral family, with the handwritten proofs.
import React, { useEffect, useState } from "react";
import Image from "next/image";
import { BASIS, BROTHERS, DOCS, FIXES, IDENTITY, LADDER, SOURCES, SPREAD, STAGES, type Basis } from "@/lib/vansh/intro";
import { useVansh } from "./VanshContext";

const Tag = ({ b }: { b: Basis }) => (
  <span className={`bs bs-${b}`} title={BASIS[b].t}>
    {BASIS[b].l}
  </span>
);

/** Full-screen zoomable view of a scan (tap to close, scroll to pan). */
function Lightbox({ src, alt, w, h, onClose }: { src: string; alt: string; w: number; h: number; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="lb" role="dialog" aria-modal="true" aria-label={alt} onClick={onClose}>
      <button className="ghost lbx" aria-label="बन्द गर्ने" onClick={onClose}>✕</button>
      <div className="lbs" onClick={(e) => e.stopPropagation()}>
        <Image src={src} alt={alt} width={w} height={h} unoptimized className="lbi" />
      </div>
    </div>
  );
}

export default function IntroView() {
  const { setTab } = useVansh();
  const [zoom, setZoom] = useState<{ src: string; alt: string; w: number; h: number } | null>(null);

  return (
    <div className="intro">
      <section className="hero">
        <p className="nm">॥ श्री घृतकौशिकाय नमः ॥</p>
        <h2>घृतकौशिक गोत्रीय बराल वंश</h2>
        <p className="lead">
          हामी कहाँबाट आयौँ, कसरी &lsquo;बराल&rsquo; भयौँ र कता-कता फैलियौँ —  यहि कुरालाई यहाँ हस्तलिखित कागजसँग जोडेर राख्ने प्रयास गरिएको छ।
          परम्परा र प्रमाण छुट्टिन सकून् भनेर हरेकमा प्रमाणको आधार पनि लेखिएको छ।
        </p>
        <div className="row">
          <button onClick={() => setTab("fam")}>आफ्नो परिवार हेर्नुहोस्</button>
          <button className="ghost" onClick={() => setTab("tree")}>वंशवृक्ष खोल्नुहोस्</button>
        </div>
        <p className="legend">
          {(Object.keys(BASIS) as Basis[]).map((b) => (
            <Tag key={b} b={b} />
          ))}
        </p>
      </section>

      <section className="card">
        <h2>एक नजरमा</h2>
        <dl className="facts">
          {IDENTITY.map((x) => (
            <div key={x.k}>
              <dt>{x.k}</dt>
              <dd>
                {x.v} <Tag b={x.b} />
                {x.note && <small>{x.note}</small>}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="card">
        <h2>लिखित प्रमाण: &ldquo;बरालको मूल आधार&rdquo;</h2>
        <p className="mut">
          वि.सं. २०३४ मा काशीमा बसेर पं. शिवराज शर्माले हातले बनाएको कुलद्रुम (वंशवृक्ष)।
        </p>
        <div className="two">
          <button className="scan" onClick={() => setZoom({ src: "/vansh/baral-tree-root.jpg", alt: "घृतकौशिक गोत्रीय बरालको मूल आधार — वंशवृक्ष", w: 1200, h: 2046 })} aria-label="वंशवृक्ष ठूलो गरी हेर्ने">
            <Image src="/vansh/baral-tree-root.jpg" alt="घृतकौशिक गोत्रीय बरालको मूल आधार — वंशवृक्ष" width={1200} height={2046} unoptimized />
            <span>🔍 ठूलो गरेर हेर्नुहोस्</span>
          </button>
          <div>
            <h3>पुस्ता (तलबाट माथि)</h3>
            <ol className="ladder">
              {[...LADDER].reverse().map((x) => (
                <li key={x.n}>
                  <b>{x.n}</b>
                  {x.sub && <small>{x.sub}</small>}
                </li>
              ))}
            </ol>
            <p className="mut">
              <b>श्लोक:</b> <i>&ldquo;वेदाग्निशून्यद्वयवैक्रमेऽब्दके काश्यामिषे मासि सिते हरेर्दिने। निर्माय हस्तेन कुलद्रुमः शुभः पट्टीकृतोऽयं शिवराज शर्मणा॥&rdquo;</i>
              {" "}— वेद(४) अग्नि(३) शून्य(०) द्वय(२) दायाँबाट बायाँ पढ्दा वि.सं. २०३४, आश्विन शुक्ल एकादशी।
            </p>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>उत्पत्ति: 'दुवे' देखि 'बराल' सम्म</h2>
        <ol className="steps">
          {STAGES.map((s) => (
            <li key={s.t}>
              <i>{s.t}</i>
              <div>
                <h3>{s.h} <Tag b={s.b} /></h3>
                <p>{s.p}</p>
              </div>
            </li>
          ))}
        </ol>
        <h3>चार दाजुभाइ, चार थर</h3>
        <div className="grid4">
          {BROTHERS.map((b) => (
            <div key={b.sur} className={`bro${b.sur === "बराल" ? " me" : ""}`}>
              <small>{b.name}</small>
              <strong>{b.sur}</strong>
              <span>📍 {b.place}</span>
              {b.note && <em>{b.note}</em>}
            </div>
          ))}
        </div>
        <p className="mut">
          नेपाल, सुतार कार्की, बराल र खनालबीच दाजुभाइको साइनो र गोत्र एउटै रहेको कुरा बाहिरी वंशावली स्रोतले पनि भन्छ। यो वंश बंगालको सुवर्ण वणिक समुदायमा पाइने &lsquo;बराल&rsquo; थरसँग सम्बन्धित होइन; थर मिल्छ, तर समूह फरक हो।
        </p>
      </section>

      <section className="card">
        <h2>बसाइँसराइ र फैलावट</h2>
        <div className="grid2">
          {SPREAD.map((s) => (
            <div key={s.h} className="reg">
              <h3>{s.h}</h3>
              <p>{s.p}</p>
              <p className="chips">
                {s.places.map((p) => (
                  <span key={p} className="chip">{p}</span>
                ))}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>हाम्रा हस्तलिखित अभिलेख</h2>
        <p className="mut">पुराना कागजहरू स्क्यान गरेर राख्दा आउने पुस्ताले पनि हेर्न पाउँछन्।</p>
        <div className="grid3">
          {DOCS.map((d) => (
            <figure key={d.id} className="doc">
              {d.src ? (
                <button className="scan" onClick={() => setZoom({ src: d.src!, alt: d.title, w: d.w || 1200, h: d.h || 1600 })} aria-label={`${d.title} ठूलो गरी हेर्ने`}>
                  <Image src={d.src} alt={d.title} width={d.w || 1200} height={d.h || 1600} unoptimized />
                  <span>🔍 ठूलो गरेर हेर्नुहोस्</span>
                </button>
              ) : (
                <div className="slot" aria-label="फाइल आउन बाँकी">📄<span>फाइल आउन बाँकी</span></div>
              )}
              <figcaption>
                <b>{d.title}</b>
                <small>{d.desc}</small>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <details className="card srcs">
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
        <p className="mut">यी वेबसाइटहरूले पनि वंशावलीकै आधारमा लेखेका हुन्; निर्णायक प्रमाण होइनन्। मूल पाना र कुल पुरोहितको जानकारी नै अन्तिम आधार हुन्।</p>
      </details>

      {zoom && <Lightbox {...zoom} onClose={() => setZoom(null)} />}
    </div>
  );
}
