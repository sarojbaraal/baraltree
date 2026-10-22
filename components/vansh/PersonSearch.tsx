"use client";
// Name / relation search box with suggestions: ▾ opens the list, ✕ clears, results are grouped by relation
// ("काका (३)"), typing a relation word ("मामा") lists everybody who is that to you. Arrow keys, Enter and Esc work.
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { baseTerm } from "@/lib/vansh/kinship";
import { dispName, match, np, yr } from "@/lib/vansh/text";
import type { VPerson } from "@/lib/vansh/types";

interface Row { p: VPerson; sub: string }
interface Section { title: string; rows: Row[] }

export default function PersonSearch({
  id, value, onChange, onChoose, people, rel, placeholder, className, summary,
}: {
  id?: string;
  value: string;
  onChange: (text: string) => void;
  onChoose: (personId: string) => void;
  /** Only people the viewer may see. */
  people: VPerson[];
  /** person id → relation term from the viewer's point of view. */
  rel: Record<string, string>;
  placeholder?: string;
  className?: string;
  /** Rendered after the box (e.g. "३ मिल्यो"). */
  summary?: (count: number, q: string) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [dq, setDq] = useState(value);
  const [active, setActive] = useState(-1);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();

  // 300 ms debounce between typing and suggestions
  useEffect(() => {
    const t = setTimeout(() => setDq(value), 300);
    return () => clearTimeout(t);
  }, [value]);

  useEffect(() => {
    const away = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("#dlg, .popover, .suggestions") && !root.current?.contains(t)) return; // other popups keep their own clicks
      if (!root.current?.contains(t as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, []);

  const q = dq.trim().toLowerCase();
  const sections = useMemo<Section[]>(() => {
    const out: Section[] = [];
    const sub = (p: VPerson) => [rel[p.id], yr(p.birth_bs)].filter(Boolean).join(" · ");
    if (!q) {
      // chevron with nothing typed: group everybody by relation
      const by = new Map<string, Row[]>();
      people.forEach((p) => {
        const b = rel[p.id] ? baseTerm(rel[p.id]) : "";
        if (b) (by.get(b) || by.set(b, []).get(b)!).push({ p, sub: sub(p) });
      });
      [...by.entries()].sort((a, b) => b[1].length - a[1].length).forEach(([t, rows]) => out.push({ title: `${t} (${np(rows.length)})`, rows }));
      return out;
    }
    const byRel = new Map<string, Row[]>();
    people.forEach((p) => {
      const t = rel[p.id];
      if (t && baseTerm(t).toLowerCase().includes(q)) (byRel.get(baseTerm(t)) || byRel.set(baseTerm(t), []).get(baseTerm(t))!).push({ p, sub: sub(p) });
    });
    byRel.forEach((rows, t) => out.push({ title: `${t} (${np(rows.length)})`, rows }));
    const shown = new Set(out.flatMap((s) => s.rows.map((r) => r.p.id)));
    const names = people.filter((p) => !shown.has(p.id) && match(p.name, q)).map((p) => ({ p, sub: sub(p) }));
    if (names.length) out.push({ title: `नाम (${np(names.length)})`, rows: names });
    return out;
  }, [people, rel, q]);

  const flat = useMemo(() => sections.flatMap((s) => s.rows).slice(0, 80), [sections]);
  const total = sections.reduce((n, s) => n + s.rows.length, 0);
  useEffect(() => setActive(-1), [q, open]);
  useEffect(() => {
    if (active < 0) return;
    root.current?.querySelector(`[data-ix="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (p: VPerson) => {
    setOpen(false);
    onChoose(p.id);
  };
  const key = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) return setOpen(true);
      setActive((a) => Math.min(flat.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      const row = flat[active >= 0 ? active : 0];
      if (open && row) {
        e.preventDefault();
        choose(row.p);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  let ix = -1;
  return (
    <div className={`qw ${className || ""}`} ref={root}>
      <span className="qi">
        <input
          id={id}
          className="msearch"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          placeholder={placeholder || "🔍 नाम वा साइनो खोज्नुहोस्…"}
          autoComplete="off"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => value && setOpen(true)}
          onKeyDown={key}
        />
        <span className="qbtns">
          {value && (
            <button type="button" className="ghost qclr" aria-label="खोज मेट्ने" onClick={() => { onChange(""); setDq(""); }}>
              ✕
            </button>
          )}
          <button type="button" className="ghost qchev" aria-label="सुझाव खोल्ने" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            ▾
          </button>
        </span>
      </span>
      {summary && value ? summary(total, q) : null}
      <div id={listId} className="qr suggestions popover" role="listbox" hidden={!open}>
        {sections.map((s) => (
          <React.Fragment key={s.title}>
            <div className="qh" role="presentation">{s.title}</div>
            {s.rows.map((r) => {
              ix++;
              if (ix >= 80) return null;
              const i = ix;
              return (
                <div
                  key={s.title + r.p.id}
                  data-ix={i}
                  role="option"
                  aria-selected={active === i}
                  className={active === i ? "act" : ""}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(r.p)}
                >
                  <b>{dispName(r.p)}</b>
                  <small>{r.sub}</small>
                </div>
              );
            })}
          </React.Fragment>
        ))}
        {!sections.length && <div className="none">{q ? "कोही भेटिएन" : "सुझाव छैन"}</div>}
      </div>
    </div>
  );
}
