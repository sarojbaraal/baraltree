"use client";
// Small shared UI pieces: avatar, password field, searchable person picker, BS date field, dialog host.
import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getSiteAvatars, subscribeSiteAvatars } from "@/lib/vansh/avatars";
import { composeDate, match, MONTHS_NE, na, np } from "@/lib/vansh/text";
import type { VPerson } from "@/lib/vansh/types";
import type { Graph, Perms } from "@/lib/vansh/graph";
import { useVansh } from "./VanshContext";

/** photo_url (when set) overrides the default avatar everywhere. */
export function Avatar({ g, photo }: { g?: string | null; photo?: string | null }) {
  const site = useSyncExternalStore(subscribeSiteAvatars, getSiteAvatars, () => ({}) as ReturnType<typeof getSiteAvatars>);
  const [broken, setBroken] = useState<string | null>(null);
  const url = (photo && photo !== broken ? photo : null) || (g === "F" ? site.F : site.M);
  if (url)
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="avimg" src={url} alt="" draggable={false} onError={() => photo && setBroken(photo)} />;
  return (
    <svg aria-hidden="true">
      <use href={`#${g === "F" ? "avF" : "avM"}`} width="100%" height="100%" />
    </svg>
  );
}

/** A person's children as coloured counts: ♂ 2 ♀ 1 (nothing when there are none). */
export function KidCount({ kids }: { kids: VPerson[] }) {
  if (!kids.length) return null;
  const sons = kids.filter((k) => k.gender !== "F").length;
  const dau = kids.length - sons;
  return (
    <span className="kc" title="सन्तान">
      {sons ? <em className="m">♂ {np(sons)}</em> : null}
      {dau ? <em className="f">♀ {np(dau)}</em> : null}
    </span>
  );
}

const EYE = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const EYE_OFF = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
    <circle cx="12" cy="12" r="3" />
    <path d="M3 3l18 18" />
  </svg>
);

export function PasswordField({
  label, value, onChange, autoComplete, onEnter,
}: { label: string; value: string; onChange: (v: string) => void; autoComplete: string; onEnter?: () => void }) {
  const [show, setShow] = useState(false);
  return (
    <label>
      {label}
      <span className="pw">
        <input
          type={show ? "text" : "password"}
          value={value}
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        />
        <button
          type="button"
          className="eye"
          aria-label={show ? "पासवर्ड लुकाउनुहोस्" : "पासवर्ड देखाउनुहोस्"}
          onClick={() => setShow((s) => !s)}
        >
          {show ? EYE_OFF : EYE}
        </button>
      </span>
    </label>
  );
}

// ---------- searchable person picker ----------
export const SXMSG = "टाइप गरेको नाम सूचीबाट छान्नुहोस् वा '➕ नयाँ थप्नुहोस्' थिच्नुहोस्।";

export interface SxState {
  value: string;
  newName: string;
  text: string;
  setText: (t: string) => void;
  pickValue: (v: string, label: string) => void;
  pickNew: () => void;
  /** Typed text that is neither a chosen person nor a confirmed new name. */
  pending: boolean;
}

export function useSx(initial: { value?: string | null; name?: string; label?: string }): SxState {
  const [value, setValue] = useState(initial.value || "");
  const [newName, setNewName] = useState(initial.name || "");
  const [text, setTextRaw] = useState(initial.value ? initial.label || "" : initial.name ? initial.name + " (नयाँ)" : "");
  return {
    value,
    newName,
    text,
    setText: (t) => {
      setTextRaw(t);
      setValue("");
      setNewName("");
    },
    pickValue: (v, label) => {
      setValue(v);
      setNewName("");
      setTextRaw(label);
    },
    pickNew: () => {
      const n = text.trim();
      setValue("");
      setNewName(n);
      setTextRaw(n + " (नयाँ)");
    },
    pending: !!text.trim() && !value && !newName,
  };
}

export function personOptions(g: Graph, perms: Perms, extra?: (p: VPerson) => string): { v: string; t: string }[] {
  return g.people.filter((p) => perms.can(p.id)).map((p) => ({ v: p.id, t: p.name + (extra ? extra(p) : "") }));
}

export function Sx({
  st, options, allowNew,
}: { st: SxState; options: { v: string; t: string }[]; allowNew?: boolean }) {
  const [open, setOpen] = useState(false);
  const raw = st.text.trim();
  const q = raw.toLowerCase();
  const shown = options.filter((i) => !q || match(i.t, q)).slice(0, 40);
  return (
    <div className="sx">
      <input
        type="search"
        placeholder="🔍 नाम टाइप गरेर खोज्नुहोस्…"
        autoComplete="off"
        value={st.text}
        onChange={(e) => {
          st.setText(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
      />
      <div className="sxl" hidden={!open}>
        {allowNew && raw && (
          <div
            className="addn"
            onMouseDown={(e) => {
              e.preventDefault();
              st.pickNew();
              setOpen(false);
            }}
          >
            ➕ &quot;{raw}&quot; नयाँ थप्नुहोस्
          </div>
        )}
        {shown.map((i) => (
          <div
            key={i.v}
            onMouseDown={(e) => {
              e.preventDefault();
              st.pickValue(i.v, i.t);
              setOpen(false);
            }}
          >
            {i.t}
          </div>
        ))}
        {!shown.length && !(allowNew && raw) && <div className="none">भेटिएन</div>}
      </div>
    </div>
  );
}

// ---------- BS date field: one box, auto "YYYY-MM-DD" in Nepali digits ----------
/** digits → "YYYY", "YYYY-MM" or "YYYY-MM-DD"; a month/day that can only be one digit long gets its leading 0. */
function fmtDate(digits: string): string {
  let y = digits.slice(0, 4);
  let rest = digits.slice(4);
  let m = "";
  let d = "";
  if (rest) {
    if (+rest[0] > 1) rest = "0" + rest;
    m = rest.slice(0, 2);
    rest = rest.slice(2);
  }
  if (rest) {
    if (+rest[0] > 3) rest = "0" + rest;
    d = rest.slice(0, 2);
  }
  y = y.slice(0, 4);
  return [y, m, d].filter((x, i) => x || i === 0).join("-");
}

export function DateField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const initial = String(value || "").replace(/(-00)+$/, "");
  const [text, setText] = useState(np(initial));
  const plain = na(text);
  const [y, m = "", d = ""] = plain.split("-");
  const bad =
    (m.length === 2 && +m > 12 ? "महिना ०० (थाहा छैन) वा ०१ देखि १२ सम्म हुनुपर्छ" : "") ||
    (d.length === 2 && +d > 32 ? "गते ०० (थाहा छैन) वा ०१ देखि ३२ सम्म हुनुपर्छ" : "");
  const change = (raw: string) => {
    let digits = na(raw).replace(/\D/g, "").slice(0, 8);
    // a backspace over an auto-inserted hyphen must still delete a digit
    if (raw.length < text.length && digits === plain.replace(/\D/g, "")) digits = digits.slice(0, -1);
    const f = fmtDate(digits);
    setText(np(f));
    const [yy, mm, dd] = f.split("-");
    onChange(composeDate(yy || "", mm && +mm >= 1 && +mm <= 12 ? mm : "", dd && +dd >= 1 && +dd <= 32 ? dd : ""));
    // "2050-00-00" is a valid "only the year is known" date — keep it as typed
  };
  return (
    <div className="dtr1">
      <input
        className="dsingle"
        inputMode="numeric"
        autoComplete="off"
        maxLength={10}
        placeholder="बर्ष-महिना-गते (जस्तै २०४५-०५-१२)"
        aria-label="मिति (वि.सं.)"
        aria-invalid={bad ? true : undefined}
        value={text}
        onChange={(e) => change(e.target.value)}
      />
      {y.length === 4 && m.length === 2 && +m === 0 && !bad && <small className="mut">{np(y)} साल (महिना/गते थाहा छैन)</small>}
      {m.length === 2 && +m >= 1 && +m <= 12 && !bad && <small className="mut">{MONTHS_NE[+m - 1]}{d.length === 2 ? ` ${np(+d)} गते` : ""}, {np(y)}</small>}
      {bad && <small className="dterr">{bad}</small>}
    </div>
  );
}

// ---------- dialog host (native <dialog>, same look as the original) ----------
export function DialogHost() {
  const { dialog, closeDialog } = useVansh();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (dialog && !d.open) d.showModal();
    if (!dialog && d.open) d.close();
  }, [dialog]);
  return (
    <dialog
      id="dlg"
      ref={ref}
      className={dialog?.ed ? "ed" : ""}
      onClose={closeDialog}
      onCancel={closeDialog}
    >
      {dialog?.node}
    </dialog>
  );
}

export function Toast() {
  const { toastMsg } = useVansh();
  return (
    <div id="toast" className={toastMsg ? "show" : ""}>
      {toastMsg}
    </div>
  );
}
