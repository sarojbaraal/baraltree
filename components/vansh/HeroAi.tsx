"use client";
// Family home hero extras: the signed-in person's AI summary as a "story card", and today's date + birthdays.
import React, { useMemo, useState } from "react";
import { generateAiSummary } from "@/lib/vansh/aiSummary";
import { WEEKDAYS_NE, daysUntilBs, neDate, todayBs } from "@/lib/vansh/bs";
import { MONTHS_NE, dispName, np } from "@/lib/vansh/text";
import type { VPerson } from "@/lib/vansh/types";
import { useVansh } from "./VanshContext";
import { Avatar } from "./ui";

/** Today's Nepali date line: "आज २०८३ कार्तिक १७ गते, सोमबार". */
export function TodayLine() {
  const t = todayBs();
  if (!t) return null;
  const now = new Date();
  return (
    <div className="htoday">
      आज {np(t[0])} {MONTHS_NE[t[1] - 1]} {np(t[2])} गते, {WEEKDAYS_NE[now.getDay()]}
    </div>
  );
}

/** Living, visible people whose birthday (BS month/day) is today or within a week. */
export function Birthdays({ onOpen }: { onOpen: (id: string) => void }) {
  const { people, perms } = useVansh();
  const list = useMemo(() => {
    const out: { p: VPerson; d: number }[] = [];
    people.forEach((p) => {
      if (p.is_living === false || !perms.can(p.id) || p.name_only) return;
      const d = daysUntilBs(p.birth_bs);
      if (d != null && d <= 7) out.push({ p, d });
    });
    return out.sort((a, b) => a.d - b.d).slice(0, 4);
  }, [people, perms]);
  if (!list.length) return null;
  return (
    <div className="hbd" aria-label="जन्मदिन">
      {list.map(({ p, d }) => (
        <button key={p.id} className="ghost hbd1" onClick={() => onOpen(p.id)} title={neDate(p.birth_bs)}>
          🎂 {d === 0 ? "आज" : np(d) + " दिनमा"} · {p.name}
        </button>
      ))}
    </div>
  );
}

/** The signed-in person's AI summary, set like a pull-quote. Admins can (re)generate it. */
export function StoryCard({ person }: { person: VPerson }) {
  const { db, g, perms, toast, reload } = useVansh();
  const [busy, setBusy] = useState(false);
  const make = async () => {
    setBusy(true);
    toast("🤖 AI ले तपाईंको सारांश बनाउँदैछ...");
    try {
      await generateAiSummary(db, g, person);
      toast("✅ AI सारांश सुरक्षित भयो!");
      await reload();
    } catch (err) {
      toast("❌ AI असफल: " + (err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!person.ai_summary && !perms.isAdm) return null;
  return (
    <figure className="story">
      <div className="story-av">
        <Avatar g={person.gender} photo={person.photo_url} live={person.is_living} />
      </div>
      <div className="story-b">
        <figcaption>✨ {dispName(person, true)} को कथा</figcaption>
        {person.ai_summary ? (
          <blockquote>{person.ai_summary}</blockquote>
        ) : (
          <blockquote className="story-empty">तपाईंको AI सारांश अझै बनेको छैन।</blockquote>
        )}
        {!!person.ai_tags?.length && (
          <div className="story-t">
            {person.ai_tags.map((t) => (
              <span key={t}>#{t}</span>
            ))}
          </div>
        )}
        {perms.isAdm && (
          <button className="ghost story-go" disabled={busy} onClick={make}>
            {person.ai_summary ? "↻ फेरि बनाउने" : "✨ सारांश बनाउने"}
          </button>
        )}
      </div>
    </figure>
  );
}
