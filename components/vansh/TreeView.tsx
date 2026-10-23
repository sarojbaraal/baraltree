"use client";
// Interactive family chart: pan / pinch / wheel zoom, fold / unfold branches, search, downloads.
// Ported from the original app.js treeView(), draw(), zoom helpers and export hooks.
import { BranchPrintDialog } from "./PersonDialogs";
import { chartGoto } from "@/lib/vansh/chartGoto";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  CH, CW, GEN, compactCollapsed, computeLayout, initialCollapsed, openUp,
} from "@/lib/vansh/layout";
import { dispName, match, np, yr } from "@/lib/vansh/text";
import { relMap } from "@/lib/vansh/relations";
import type { VPerson } from "@/lib/vansh/types";
import { useVansh } from "./VanshContext";
import { Avatar } from "./ui";
import PersonSearch from "./PersonSearch";
import { PersonForm } from "./PersonDialogs";
import { qText } from "./ListViews";

// folded branches survive tab switches (like the original's module-level state)
const store: { collapsed: Set<string>; init: boolean } = { collapsed: new Set(), init: false };

interface View {
  x: number;
  y: number;
  k: number;
}

export default function TreeView() {
  const { g, me, people, perms, act, sel, pick, unpick, toast, treeApi, openDialog, myPosId } = useVansh();
  const { byId } = g;
  const { can, nm, isAdm } = perms;

  const [collapsed, setCollapsedState] = useState<Set<string>>(() => {
    if (!store.init && people.length) {
      store.init = true;
      store.collapsed = initialCollapsed(g);
    }
    return store.collapsed;
  });
  const setCollapsed = useCallback((s: Set<string>) => {
    store.collapsed = s;
    setCollapsedState(s);
  }, []);

  const layout = useMemo(() => computeLayout(g, collapsed), [g, collapsed]);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const [hlId, setHlId] = useState<string | null>(null);
  const hlRef = useRef<string | null>(null);
  hlRef.current = hlId;
  const hl = useMemo(() => (hlId ? g.branchOf([hlId]) : null), [g, hlId]);
  const [q, setQ] = useState(qText.tree);

  const chartRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const zrRef = useRef<HTMLInputElement>(null);
  const cwRef = useRef<HTMLDivElement>(null);
  const V = useRef<View>({ x: 0, y: 0, k: 1 });
  const afterDraw = useRef<(() => void) | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    timers.current.push(t);
  };

  // ---------- viewport ----------
  const clampV = () => {
    const c = chartRef.current;
    if (!c) return;
    const m = 60;
    const { W, H } = layoutRef.current;
    const v = V.current;
    v.x = Math.min(c.clientWidth - m, Math.max(m - W * v.k, v.x));
    v.y = Math.min(c.clientHeight - m, Math.max(m - H * v.k, v.y));
  };
  const applyV = () => {
    clampV();
    const v = V.current;
    if (stageRef.current) stageRef.current.style.transform = `translate(${v.x}px,${v.y}px) scale(${v.k})`;
    if (zrRef.current) zrRef.current.value = String(Math.round(v.k * 100));
  };
  const zoomAt = (f: number, cx: number, cy: number) => {
    const v = V.current;
    const k = Math.min(2.5, Math.max(0.02, v.k * f));
    const ch = chartRef.current;
    if (ch && v.y >= 0 && v.y < ch.clientHeight - 60) cy = v.y;
    v.x = cx - ((cx - v.x) * k) / v.k;
    v.y = cy - ((cy - v.y) * k) / v.k;
    v.k = k;
    applyV();
  };
  const fit = () => {
    const c = chartRef.current;
    if (!c) return;
    const { W, H } = layoutRef.current;
    const v = V.current;
    v.k = Math.max(0.02, Math.min(1, (c.clientWidth - 40) / W, (c.clientHeight - 40) / H));
    v.x = (c.clientWidth - W * v.k) / 2;
    v.y = 20;
    applyV();
  };
  const home = () => {
    const c = chartRef.current;
    if (!c) return;
    const { W, H, trees } = layoutRef.current;
    const fk = Math.min(1, (c.clientWidth - 40) / W, (c.clientHeight - 40) / H);
    if (fk >= 0.55 || !trees.length) return fit();
    const v = V.current;
    v.k = 0.8;
    v.x = c.clientWidth / 2 - trees[0].ax * 0.8;
    v.y = 24;
    applyV();
  };
  const centerOn = (id: string, k?: number) => {
    const q0 = layoutRef.current.cardPos[id];
    const c = chartRef.current;
    if (!q0 || !c) return null;
    const v = V.current;
    if (k) v.k = k;
    v.x = c.clientWidth / 2 - (q0.x + CW / 2) * v.k;
    v.y = c.clientHeight / 2 - (q0.y + CH / 2) * v.k;
    return q0;
  };
  const focusOn = (id: string, k?: number) => {
    const st = stageRef.current;
    if (!centerOn(id, k) || !st) return;
    st.classList.add("anim");
    applyV();
    later(() => st.classList.remove("anim"), 400);
  };
  const flyTo = (id: string, k = 1) => {
    const q0 = layoutRef.current.cardPos[id];
    const c = chartRef.current;
    const st = stageRef.current;
    if (!q0 || !c || !st) return;
    const v = V.current;
    const go = (kk: number) => {
      v.k = kk;
      v.x = c.clientWidth / 2 - (q0.x + CW / 2) * kk;
      v.y = c.clientHeight / 2 - (q0.y + CH / 2) * kk;
      applyV();
    };
    st.style.transition = "transform 1.2s cubic-bezier(.4,0,.2,1)";
    const mid = Math.max(0.3, Math.min(0.5, k));
    if (v.k > mid + 0.1 && v.k >= k) {
      go(mid);
      later(() => go(k), 1250);
    } else go(k);
    later(() => (st.style.transition = ""), 2600);
  };
  const glide = (id: string, k?: number) => {
    const q0 = layoutRef.current.cardPos[id];
    const c = chartRef.current;
    const st = stageRef.current;
    if (!q0 || !c || !st) return;
    const v = V.current;
    const kk = Math.max(v.k, k || 1);
    st.style.transition = "transform .9s cubic-bezier(.4,0,.2,1)";
    v.k = kk;
    v.x = c.clientWidth / 2 - (q0.x + CW / 2) * kk;
    v.y = (innerWidth > 640 ? c.clientHeight / 2 : c.clientHeight / 4) - (q0.y + CH / 2) * kk;
    applyV();
    later(() => (st.style.transition = ""), 950);
  };

  // run queued viewport work after the layout for the new collapsed-set is in the DOM
  useLayoutEffect(() => {
    const f = afterDraw.current;
    afterDraw.current = null;
    f?.();
  }, [layout]);

  // ---------- selection ----------
  const select = (id: string, delay?: number) => {
    if (!can(id)) return pick(id); // shows the "locked" toast
    setHlId(id);
    if (delay) later(() => hlRef.current === id && pick(id), delay);
    else pick(id);
  };
  const clear = () => {
    setHlId(null);
    unpick();
  };
  useEffect(() => {
    if (sel === null) setHlId(null);
  }, [sel]);
  // keep the selected card visible beside the open profile panel
  useEffect(() => {
    if (!sel || innerWidth <= 640) return;
    const t = setTimeout(() => hlRef.current === sel && focusOn(sel, V.current.k), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel]);

  const reveal = (id: string) => {
    setCollapsed(openUp(g, collapsed, id));
    afterDraw.current = () => glide(id, 1);
  };
  const goMe = (quiet?: boolean) => {
    const id = myPosId;
    if (!id || !byId[id]) {
      if (!quiet) toast("तपाईंको स्थान तोकिएको छैन");
      return;
    }
    setCollapsed(openUp(g, collapsed, id));
    afterDraw.current = () => (quiet ? focusOn(id, 0.7) : flyTo(id, 0.7));
  };

  // ---------- mount: initial view, listeners ----------
  useEffect(() => {
    home();
    goMe(true);
    if (chartGoto.id && byId[chartGoto.id]) {
      const id = chartGoto.id;
      chartGoto.id = null;
      setTimeout(() => reveal(id), 60);
    }
    const ch = chartRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = ch.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.12 : 0.89, e.clientX - r.left, e.clientY - r.top);
    };
    ch.addEventListener("wheel", onWheel, { passive: false });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        clear();
      }
    };
    const onFs = () => setTimeout(fit, 120);
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFs);
    const zr = zrRef.current!;
    const onZr = () => {
      const val = parseFloat(zr.value);
      if (val > 0) zoomAt(Math.min(250, Math.max(2, val)) / 100 / V.current.k, ch.clientWidth / 2, ch.clientHeight / 2);
      else applyV();
    };
    zr.addEventListener("change", onZr);
    return () => {
      ch.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
        document.removeEventListener("fullscreenchange", onFs);
      zr.removeEventListener("change", onZr);
      timers.current.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // pointer drag / pinch
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const moved = useRef(false);
  const pd = useRef(0);
  const dist = () => {
    const [a, b] = [...ptrs.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!ptrs.current.has(e.pointerId)) return;
      ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const ch = chartRef.current;
      if (!ch) return;
      if (ptrs.current.size === 2) {
        const d = dist();
        const [a, b] = [...ptrs.current.values()];
        const r = ch.getBoundingClientRect();
        if (pd.current) zoomAt(d / pd.current, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
        pd.current = d;
        moved.current = true;
        return;
      }
      if (!drag.current) return;
      const dx = e.clientX - drag.current.x;
      const dy = e.clientY - drag.current.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved.current = true;
      V.current.x = drag.current.vx + dx;
      V.current.y = drag.current.vy + dy;
      applyV();
    };
    const onUp = (e: PointerEvent) => {
      ptrs.current.delete(e.pointerId);
      drag.current = null;
      pd.current = 0;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onChartDown = (e: React.PointerEvent) => {
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = false;
    drag.current = ptrs.current.size === 1 ? { x: e.clientX, y: e.clientY, vx: V.current.x, vy: V.current.y } : null;
    if (ptrs.current.size === 2) pd.current = dist();
  };
  const onChartClick = (e: React.MouseEvent) => {
    if (moved.current) return;
    const target = e.target as HTMLElement;
    const tg = target.closest(".tg") as HTMLElement | null;
    if (tg) {
      const k = tg.dataset.t as string;
      const n = new Set(collapsed);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      setCollapsed(n);
      return;
    }
    const t = target.closest("[data-id]") as HTMLElement | null;
    if (t) {
      const id = t.dataset.id as string;
      if (can(id)) {
        glide(id, 1);
        select(id, 750);
      } else select(id);
    } else clear();
  };

  // ---------- search ----------
  const ql = q.trim().toLowerCase();
  const kin = useMemo(() => relMap(g, me).R, [g, me]);
  const visible = useMemo(() => people.filter((p) => can(p.id)), [people, can]);
  const choose = (id: string) => {
    const name = byId[id]?.name || "";
    qText.tree = name;
    setQ(name);
    setCollapsed(openUp(g, collapsed, id));
    afterDraw.current = () => {
      glide(id, 1);
      select(id, 750);
    };
  };

  // ---------- tools ----------
  const mid = (f: number) => {
    const c = chartRef.current!;
    zoomAt(f, c.clientWidth / 2, c.clientHeight / 2);
  };
  const compact = () => {
    const id = myPosId;
    const keep = id && byId[id] ? g.branchOf([id]) : null;
    const c = compactCollapsed(layoutRef.current, keep);
    if (keep && id) {
      setCollapsed(openUp(g, c, id));
      afterDraw.current = () => focusOn(id, 0.8);
    } else {
      setCollapsed(c);
      afterDraw.current = home;
    }
  };
  const printBranch = (id: string) => {
    const p = byId[id];
    if (p) openDialog(<BranchPrintDialog p={p} />);
  };

  useEffect(() => {
    treeApi.current = { reveal, depthOf: (id) => layoutRef.current.cardPos[id]?.d, print: printBranch };
    return () => {
      treeApi.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  const on = (el: boolean | null) => (el === true ? " hl" : el === false ? " dim" : "");

  return (
    <div className="chartwrap" id="cw" ref={cwRef}>
      <div className="tools">
        <PersonSearch
          id="q"
          value={q}
          people={visible}
          rel={kin}
          placeholder="🔍 नाम वा साइनो खोज्नुहोस्…"
          onChange={(t) => {
            qText.tree = t;
            setQ(t);
          }}
          onChoose={choose}
          summary={(n) => <span id="qc" className="mut">{n ? `${np(n)} मिल्यो` : "भेटिएन"}</span>}
        />
        <button className="ghost" aria-label="सानो" onClick={() => mid(0.9)}>−</button>
        <input type="number" id="zr" ref={zrRef} min={2} max={250} step={5} inputMode="numeric" aria-label="जुम प्रतिशत" title="जुम % लेखेर Enter थिच्नुहोस्" />
        <span className="mut">%</span>
        <button className="ghost" aria-label="ठूलो" onClick={() => mid(1.1)}>+</button>
        <button
          className="ghost"
          aria-label="पूरा स्क्रिन"
          onClick={() => (document.fullscreenElement ? document.exitFullscreen() : cwRef.current?.requestFullscreen?.())}
        >
          ⛶
        </button>
        <button className="ghost" title="सबै शाखा खोल्ने" onClick={() => { setCollapsed(new Set()); afterDraw.current = fit; }}>
          सबै शाखा खोल्ने
        </button>
        <button className="ghost" title="शाखा बन्द गर्ने" onClick={compact}>संक्षिप्त</button>
      </div>
      <div id="chart" ref={chartRef} onPointerDown={onChartDown} onClick={onChartClick} onKeyDown={(e) => {
        const id = (e.target as HTMLElement).dataset?.id;
        if (e.key === "Enter" && id) select(id);
      }}>
        <div id="stage" ref={stageRef} style={{ width: layout.W, height: layout.H }}>
          <svg width={layout.W} height={layout.H}>
            {layout.lines.map((l, i) => (
              <path key={i} className={"ln" + (hl ? (hl.has(l.c) ? " on" : " dim") : "")} data-c={l.c} data-m={l.m ? 1 : undefined} d={l.d} />
            ))}
          </svg>
          {layout.cards.map(({ p, x, y, d }) => {
            const ok = can(p.id);
            return (
              <div
                key={p.id}
                className={`cd g${p.gender || "O"} ${p.is_living ? "" : "dead"} ${hlId === p.id ? "sel" : ""} ${ok ? "" : "locked"} ${p.id === me?.position_person_id ? "mine" : ""}${hl ? on(hl.has(p.id)) : ""}`}
                tabIndex={0}
                data-id={p.id}
                style={{ left: x, top: y, width: CW, height: CH, ["--gc" as string]: GEN[d % GEN.length] }}
              >
                <div className="av">{ok ? <Avatar g={p.gender} photo={p.photo_url} live={p.is_living} /> : "🔒"}</div>
                <div className="tx">
                  <small className="gn">Gen {d + 1}</small>
                  <b>{ok ? dispName(p, true) : nm(p)}</b>
                  <span>{ok ? (yr(p.birth_bs) || "?") + (p.is_living ? "" : " – " + (yr(p.death_bs) || "?")) : "लक"}</span>
                </div>
              </div>
            );
          })}
          {layout.units.map((u) => (
            <button key={u.key} className="tg" data-t={u.key} style={{ left: u.px, top: u.y + CH + 3 }} aria-label="शाखा खोल्ने/बन्द गर्ने">
              {u.open ? "−" : "+" + u.n}
            </button>
          ))}
        </div>
        <button className="gmfab" id="gm" title="मेरो स्थानमा जाने" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); goMe(); }}>
          📍 मेरो स्थान
        </button>
        {!people.length && (
          <div className="empty">
            <p>अझै कोही थपिएको छैन।</p>
            {act !== "general" && (
              <button onClick={() => openDialog(<PersonForm action="add" />, true)}>
                {isAdm ? "पहिलो व्यक्ति थप्ने" : "पहिलो व्यक्ति थप्ने अनुरोध"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
