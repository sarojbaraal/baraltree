"use client";
// Small shared UI pieces: avatar, password field, searchable person picker, BS date field, dialog host.
import React, { useEffect, useRef, useState } from "react";
import { composeDate, match, MONTHS_NE, na, np } from "@/lib/vansh/text";
import type { VPerson } from "@/lib/vansh/types";
import type { Graph, Perms } from "@/lib/vansh/graph";
import { useVansh } from "./VanshContext";

export function Avatar({ g }: { g?: string | null }) {
  return (
    <svg aria-hidden="true">
      <use href={`#${g === "F" ? "avF" : "avM"}`} width="100%" height="100%" />
    </svg>
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

// ---------- BS date field (YYYY / month / day) ----------
export function DateField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const q = String(value || "").split("-");
  const [y, setY] = useState(np(q[0] || ""));
  const [m, setM] = useState(q[1] && +q[1] ? String(+q[1]) : "");
  const [d, setD] = useState(q[2] && +q[2] ? String(+q[2]) : "");
  const z = (n: number) => np(String(n).padStart(2, "0"));
  const emit = (yy: string, mm: string, dd: string) => onChange(composeDate(yy, mm, dd));
  return (
    <div className="dtr">
      <input
        className="dy"
        inputMode="numeric"
        maxLength={4}
        placeholder="YYYY"
        aria-label="साल"
        value={y}
        onChange={(e) => {
          const v = np(na(e.target.value).replace(/\D/g, "").slice(0, 4));
          setY(v);
          emit(v, m, d);
        }}
      />
      <span className="dsep">-</span>
      <select
        className="dm"
        aria-label="महिना"
        value={m}
        onChange={(e) => {
          setM(e.target.value);
          emit(y, e.target.value, d);
        }}
      >
        <option value="">००</option>
        {MONTHS_NE.map((n, i) => (
          <option key={n} value={String(i + 1)}>
            {z(i + 1)} · {n}
          </option>
        ))}
      </select>
      <span className="dsep">-</span>
      <select
        className="dd"
        aria-label="गते"
        value={d}
        onChange={(e) => {
          setD(e.target.value);
          emit(y, m, e.target.value);
        }}
      >
        <option value="">००</option>
        {Array.from({ length: 32 }, (_, i) => (
          <option key={i} value={String(i + 1)}>
            {z(i + 1)}
          </option>
        ))}
      </select>
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
