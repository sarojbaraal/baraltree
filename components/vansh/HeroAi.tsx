"use client";
// Family home extras: "तपाईंको कथा" (the signed-in person's AI story) and the occasions strip
// (own birthday countdown, birthdays, श्राद्ध tithi, wedding anniversaries), plus the once-a-day popup.
import React, { useEffect, useMemo, useState } from "react";
import { generateSelfStory } from "@/lib/vansh/aiSummary";
import { neDate, todayBs } from "@/lib/vansh/bs";
import { familyEvents, whenLabel, type FamilyEvent } from "@/lib/vansh/events";
import { MONTHS_NE, np } from "@/lib/vansh/text";
import type { VPerson } from "@/lib/vansh/types";
import { useVansh } from "./VanshContext";
import { Avatar } from "./ui";

const ICON = { birthday: "🎂", shraddha: "🪔", anniversary: "💍" } as const;

/** Occasions for the signed-in user, from what they may see. */
export function useFamilyEvents() {
  const { people, perms, me } = useVansh();
  const [day, setDay] = useState("");
  useEffect(() => setDay(new Date().toDateString()), []);
  return useMemo(
    () => !day ? { own: null, upcoming: [], recent: [] } : familyEvents(people, { can: perms.can, meId: me?.position_person_id || null }),
    // the day changes the answer, so re-evaluate when the date does
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [people, perms, me?.position_person_id, day]
  );
}

function line(e: FamilyEvent): string {
  if (e.kind === "birthday") return e.own ? `तपाईंको जन्मदिन ${whenLabel(e.days)}` : `${e.person.name} · जन्मदिन ${whenLabel(e.days)}`;
  if (e.kind === "shraddha") return `${e.person.name} को श्राद्ध · ${whenLabel(e.days)}`;
  return `${e.person.name}${e.spouse ? " र " + e.spouse.name : ""} · ${e.detail} ${whenLabel(e.days)}`;
}

/** "आज २०८३ कार्तिक १७ गते" (used in the popup and the ⓘ tip, not in the hero). */
export function todayLabel(now?: Date): string {
  const t = todayBs(now || new Date());
  return t ? `${np(t[0])} ${MONTHS_NE[t[1] - 1]} ${np(t[2])} गते` : "";
}

/** Chips under the greeting. */
export function EventChips({ onOpen }: { onOpen: (id: string) => void }) {
  const { own, upcoming } = useFamilyEvents();
  const { openDialog } = useVansh();
  const shown = upcoming.slice(0, 5);
  if (!own && !shown.length) return null;
  const chip = (e: FamilyEvent) => (
    <button key={e.kind + e.person.id} className={`ghost evc ${e.kind} ${e.days === 0 ? "today" : ""}`} onClick={() => onOpen(e.person.id)} title={e.detail}>
      <i>{ICON[e.kind]}</i>
      {line(e)}
    </button>
  );
  return (
    <div className="evs" aria-label="आगामी अवसर">
      {own && (!upcoming.some((u) => u.person.id === own.person.id && u.kind === "birthday")) && chip(own)}
      {shown.map(chip)}
      {upcoming.length > 5 && (
        <button className="ghost evc more" onClick={() => openDialog(<EventsDialog />)}>
          +{np(upcoming.length - 5)} थप
        </button>
      )}
      {upcoming.length > 0 && (
        <button className="ghost evc more" onClick={() => openDialog(<EventsDialog />)}>सबै हेर्ने</button>
      )}
    </div>
  );
}

/** The full list: today and the coming week, then the birthdays of the last week. */
export function EventsDialog({ greeting }: { greeting?: boolean }) {
  const { own, upcoming, recent } = useFamilyEvents();
  const { closeDialog, pick, toast } = useVansh();
  const [perm, setPerm] = useState<NotificationPermission | "none">(typeof Notification === "undefined" ? "none" : Notification.permission);
  const go = (id: string) => {
    closeDialog();
    pick(id);
  };
  const row = (e: FamilyEvent) => (
    <button key={e.kind + e.person.id + e.days} className={`evr ${e.kind}`} onClick={() => go(e.person.id)}>
      <i>{ICON[e.kind]}</i>
      <span>
        <b>{line(e)}</b>
        {e.detail && <small>{e.detail}{e.kind === "shraddha" ? " · अनुमानित (पञ्चाङ्गसँग मिलाउनुहोस्)" : ""}</small>}
      </span>
    </button>
  );
  const askPerm = async () => {
    try {
      const r = await Notification.requestPermission();
      setPerm(r);
      if (r === "granted") toast("🔔 सूचना खोलियो: अब साइट खोल्दा आजका अवसर स्क्रिनमा आउँछन्");
    } catch {
      /* not supported */
    }
  };
  return (
    <>
      <h3>{greeting ? "नमस्ते 🙏 " : ""}आज {todayLabel()}</h3>
      {own && !upcoming.some((u) => u.person.id === own.person.id) && (
        <p className="mut">🎂 तपाईंको जन्मदिन {whenLabel(own.days)} ({neDate(own.person.birth_bs)})</p>
      )}
      {upcoming.length ? <div className="evl">{upcoming.map(row)}</div> : <p className="mut">आगामी ७ दिनमा कुनै अवसर छैन।</p>}
      {recent.length > 0 && (
        <>
          <div className="pp-h" style={{ margin: "1rem 0 .4rem" }}>हालसालै बितेका जन्मदिन</div>
          <div className="evl">{recent.map(row)}</div>
        </>
      )}
      <div className="row">
        {perm === "default" && <button className="ghost" onClick={askPerm}>🔔 फोनमा सूचना देखाउने</button>}
        <button className="ghost" onClick={closeDialog}>बन्द</button>
      </div>
      {perm === "denied" && <p className="mut" style={{ fontSize: ".8rem" }}>सूचना ब्राउजरमा रोकिएको छ; ब्राउजर सेटिङबाट खोल्नुहोस्।</p>}
    </>
  );
}

/** Once a day (per device) when the family home loads: popup + a system notification when allowed. */
export function useDailyEvents(ready: boolean) {
  const { openDialog, me } = useVansh();
  const { own, upcoming } = useFamilyEvents();
  useEffect(() => {
    if (!ready || !me) return;
    const t = todayBs();
    const key = t ? t.join("-") : new Date().toDateString();
    let seen = "";
    try {
      seen = localStorage.getItem("vv_ev_day") || "";
    } catch {
      /* private mode */
    }
    if (seen === key) return;
    const todays = upcoming.filter((e) => e.days <= 1);
    if (!todays.length && !(own && own.days <= 1)) return;
    try {
      localStorage.setItem("vv_ev_day", key);
    } catch {
      /* private mode */
    }
    const id = setTimeout(() => openDialog(<EventsDialog greeting />), 900);
    // an installed app / allowed site also shows it as a notification
    if (typeof Notification !== "undefined" && Notification.permission === "granted" && navigator.serviceWorker) {
      const first = todays[0] || own!;
      const more = todays.length > 1 ? ` (+${np(todays.length - 1)})` : "";
      navigator.serviceWorker.ready
        .then((reg) => reg.showNotification("हाम्रो वंशावली", { body: line(first) + more, icon: "/icon.png", tag: "vv-daily" }))
        .catch(() => {});
    }
    return () => clearTimeout(id);
  }, [ready, me, own, upcoming, openDialog]);
}

/** "तपाईंको कथा": the signed-in person's AI story, set into the hero (no box of its own). */
export function StoryCard({ person }: { person: VPerson }) {
  const { db, reload, toast } = useVansh();
  const [busy, setBusy] = useState(false);
  const make = async () => {
    setBusy(true);
    toast("🤖 AI ले तपाईंको कथा लेख्दैछ...");
    try {
      await generateSelfStory(db, person.id);
      toast("✅ तपाईंको कथा तयार भयो!");
      await reload();
    } catch (err) {
      toast("❌ " + (err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const text = person.ai_summary_self;
  return (
    <figure className="story">
      <svg className="story-orn" viewBox="0 0 120 120" aria-hidden="true">
        {Array.from({ length: 12 }, (_, i) => (
          <ellipse key={i} cx="60" cy="30" rx="9" ry="26" transform={`rotate(${i * 30} 60 60)`} />
        ))}
        <circle cx="60" cy="60" r="9" />
      </svg>
      <div className="story-av">
        <Avatar g={person.gender} photo={person.photo_url} live={person.is_living} />
      </div>
      <div className="story-b">
        <figcaption>तपाईंको कथा</figcaption>
        {text ? (
          <blockquote>{text}</blockquote>
        ) : (
          <blockquote className="story-empty">AI ले तपाईंको परिवार र विवरण हेरेर तपाईंकै बारेमा छोटो कथा लेखिदिन्छ।</blockquote>
        )}
        {!!person.ai_tags?.length && text && (
          <div className="story-t">
            {person.ai_tags.map((t) => (
              <span key={t}>#{t}</span>
            ))}
          </div>
        )}
        <button className="ghost story-go" disabled={busy} onClick={make}>
          {text ? "↻ फेरि लेख्ने" : "✨ मेरो कथा लेख्ने"}
        </button>
      </div>
    </figure>
  );
}

/** Today's Nepali date, filled in after mount (keeps the prerender stable). */
export function useTodayLabel(): string {
  const [l, setL] = useState("");
  useEffect(() => setL(todayLabel()), []);
  return l;
}
