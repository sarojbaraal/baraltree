// Kinship labels and family grouping (ported from the original app.js: relMap, relsOf, famGroups, genNo).
import type { VPerson, VProfile } from "./types";
import type { Graph, Perms } from "./graph";

const gsel = (p: VPerson, m: string, f: string, o: string) => (p.gender === "M" ? m : p.gender === "F" ? f : o);

/**
 * Relationship of everyone to the signed-in user ("तपाईं"), as Nepali kinship terms.
 * R: id → label; C: ids of the immediate family.
 */
export function relMap(g: Graph, me: VProfile | null): { R: Record<string, string>; C: Set<string> } {
  const { people, byId, spousesOf, kidsOf, downSet, hasParents } = g;
  const base = me?.position_person_id ? byId[me.position_person_id] : undefined;
  const par = me?.position_parent_id ? byId[me.position_parent_id] : undefined;
  const R: Record<string, string> = {};
  const C = new Set<string>();
  const set = (p: VPerson | undefined | null, l: string, core?: number | boolean) => {
    if (p && !R[p.id]) {
      R[p.id] = l;
      if (core) C.add(p.id);
    }
  };
  const sibs = g.sibsOf;
  const older = (a: VPerson, b: VPerson): boolean | null => (a.birth_bs && b.birth_bs ? a.birth_bs < b.birth_bs : null);
  const sp = (id: string) => byId[id];

  let fa: VPerson | undefined;
  let mo: VPerson | undefined;
  let sl: VPerson[] = [];
  if (base) {
    set(base, "तपाईं", 1);
    spousesOf(base).forEach((i) => set(sp(i), gsel(sp(i), "पति", "पत्नी", "श्रीमती"), 1));
    kidsOf(base).forEach((k) => set(k, gsel(k, "छोरा", "छोरी", "सन्तान"), 1));
    fa = base.father_id ? byId[base.father_id] : undefined;
    mo = base.mother_id ? byId[base.mother_id] : undefined;
    sl = sibs(base);
  } else if (par) {
    const spouse = par.spouse_id ? byId[par.spouse_id] : undefined;
    fa = par.gender === "F" ? spouse : par;
    mo = par.gender === "F" ? par : spouse;
    sl = kidsOf(par);
  }
  set(fa, "बुबा", 1);
  set(mo, "आमा", 1);

  sl.forEach((s) => {
    const o = base ? older(s, base) : null;
    set(
      s,
      s.gender === "M"
        ? o === true ? "दाजु" : o === false ? "भाइ" : "दाजुभाइ"
        : s.gender === "F"
        ? o === true ? "दिदी" : o === false ? "बहिनी" : "दिदीबहिनी"
        : "दाजुभाइ/दिदीबहिनी",
      1
    );
    spousesOf(s).forEach((i) =>
      set(
        sp(i),
        s.gender === "F"
          ? o === true ? "भिनाजु" : o === false ? "ज्वाईं" : "भिनाजु/ज्वाईं"
          : o === true ? "भाउजू" : o === false ? "भाइ-बुहारी" : "भाउजू/बुहारी",
        1
      )
    );
    kidsOf(s).forEach((k) =>
      set(
        k,
        s.gender === "F" ? gsel(k, "भान्जा", "भान्जी", "भान्जा/भान्जी") : gsel(k, "भतिजा", "भतिजी", "भतिज/भतिजी"),
        1
      )
    );
  });

  if (base && base.gender === "F") {
    spousesOf(base).forEach((i) => {
      const hs = sp(i);
      if (!hs) return;
      sibs(hs).forEach((s) => {
        const o = older(s, hs);
        const M = s.gender !== "F";
        set(
          s,
          M
            ? o === true ? "जेठाजु" : o === false ? "देवर" : "जेठाजु/देवर"
            : o === true ? "आमाजु" : o === false ? "नन्द" : "आमाजु/नन्द",
          1
        );
        if (M) spousesOf(s).forEach((j) => set(sp(j), o === true ? "जेठानी दिदी" : o === false ? "देउरानी" : "जेठानी/देउरानी", 1));
      });
    });
  }

  ([[fa, 1], [mo, 0]] as [VPerson | undefined, number][]).forEach(([q, pat]) => {
    if (!q) return;
    sibs(q).forEach((u) => {
      const o = older(u, q);
      const M = u.gender === "M";
      set(u, M ? (pat ? (o ? "ठूलोबुबा" : "काका") : "मामा") : pat ? "फुपू" : "सानिमा", pat && M);
      if (M)
        kidsOf(u).forEach((k) => {
          const o2 = base ? older(k, base) : null;
          const Fm = k.gender === "F";
          set(
            k,
            Fm
              ? o2 === true ? "दिदी" : o2 === false ? "बहिनी" : "दिदीबहिनी"
              : o2 === true ? "दाजु" : o2 === false ? "भाइ" : "दाजुभाइ",
            1
          );
          spousesOf(k).forEach((i) =>
            set(
              sp(i),
              Fm ? (R[u.id] || "काका") + "को ज्वाइँ" : o2 === false ? "बुहारी" : o2 === true ? "भाउजू" : "भाउजू/बुहारी",
              1
            )
          );
          kidsOf(k).forEach((c) =>
            set(c, Fm ? gsel(c, "भान्जा", "भान्जी", "भान्जा/भान्जी") : gsel(c, "भतिजा", "भतिजी", "भतिजा/भतिजी"), 1)
          );
        });
      spousesOf(u).forEach((i) =>
        set(sp(i), M ? (pat ? (o ? "ठूलीआमा" : "काकी") : "माइजू") : pat ? "फुपाजु" : "सानाबा", pat && M)
      );
    });
    set(q.father_id ? byId[q.father_id] : undefined, "हजुरबुबा");
    set(q.mother_id ? byId[q.mother_id] : undefined, "हजुरआमा");
  });

  // generation offset relative to `base`
  const gen: Record<string, number> = {};
  if (base) {
    gen[base.id] = 0;
    const q = [base.id];
    while (q.length) {
      const x = q.shift() as string;
      const px = byId[x];
      const d0 = gen[x];
      const go = (i: string | null | undefined, v: number) => {
        if (i && byId[i] && gen[i] === undefined) {
          gen[i] = v;
          q.push(i);
        }
      };
      go(px.father_id, d0 - 1);
      go(px.mother_id, d0 - 1);
      spousesOf(px).forEach((i) => go(i, d0));
      people.forEach((c) => {
        if (c.father_id === x || c.mother_id === x) go(c.id, d0 + 1);
      });
    }
  }

  const fill = () => {
    for (let n = 0; n < 5; n++)
      people.forEach((p) => {
        if (R[p.id]) return;
        const pr = [p.father_id ? byId[p.father_id] : undefined, p.mother_id ? byId[p.mother_id] : undefined].find(
          (x) => x && R[x.id]
        );
        const spId = spousesOf(p).find((i) => R[i]);
        const spp = spId ? byId[spId] : undefined;
        if (pr) {
          const L = R[pr.id];
          R[p.id] = /^(फुपू|फुपाजु)को (छोरा|छोरी)$/.test(L)
            ? "फुपूको " + gsel(p, "नाति", "नातिनी", "नाति/नातिनी")
            : L === "छोरा" || L === "छोरी"
            ? gsel(p, "नाति", "नातिनी", "नाति/नातिनी")
            : L === "ठुलोबा/काका"
            ? gsel(p, "दाजु/भाइ", "दिदी/बहिनी", "दाजुभाइ/दिदीबहिनी")
            : L === "दाजु/भाइ"
            ? gsel(p, "भतिजा", "भतिजी", "भतिजा/भतिजी")
            : L + "को " + gsel(p, "छोरा", "छोरी", "सन्तान");
        } else if (spp) {
          const L = R[spp.id];
          R[p.id] = /^(फुपू|फुपाजु)को छोरा$/.test(L) ? "फुपूको बुहारी" : L + "को " + gsel(p, "पति", "पत्नी", "श्रीमती");
        }
      });
  };

  const matS = new Set<string>();
  if (mo) {
    const own = downSet(mo.id);
    [mo.father_id, mo.mother_id].forEach((i) => {
      if (i && byId[i]) downSet(i).forEach((x) => { if (!own.has(x)) matS.add(x); });
    });
  }
  matS.forEach((id) => {
    const p = byId[id];
    if (!p || R[id] || !hasParents(p)) return;
    const o = base ? older(p, base) : null;
    if (gen[id] === -1 && p.gender === "M") R[id] = "मामा";
    else if (gen[id] === 0) {
      const F = p.gender === "F";
      R[id] = F
        ? o === true ? "दिदी" : o === false ? "बहिनी" : "दिदीबहिनी"
        : o === true ? "दाजु" : o === false ? "भाइ" : "दाजुभाइ";
      spousesOf(p).forEach((i) =>
        set(
          sp(i),
          F
            ? o === true ? "भिनाजु" : o === false ? "ज्वाइँ" : "भिनाजु/ज्वाइँ"
            : o === false ? "बुहारी" : o === true ? "भाउजू" : "भाउजू/बुहारी",
          1
        )
      );
      kidsOf(p).forEach((c) =>
        set(c, F ? gsel(c, "भान्जा", "भान्जी", "भान्जा/भान्जी") : gsel(c, "भतिजा", "भतिजी", "भतिजा/भतिजी"), 1)
      );
    }
  });
  fill();
  people.forEach((p) => {
    if (R[p.id] || p.gender !== "M" || matS.has(p.id)) return;
    if (gen[p.id] === -1) R[p.id] = "ठुलोबा/काका";
    else if (gen[p.id] === 0) R[p.id] = "दाजु/भाइ";
  });
  fill();
  return { R, C };
}

/** Immediate relations of p, in display order. */
export function relsOf(g: Graph, p: VPerson): { q: VPerson; l: string }[] {
  const { byId, spousesOf, kidsOf, byBirth, sibsOf } = g;
  const R: { q: VPerson; l: string }[] = [];
  const add = (q: VPerson | undefined | null, l: string) => {
    if (q) R.push({ q, l });
  };
  add(p.father_id ? byId[p.father_id] : undefined, "बुबा");
  add(p.mother_id ? byId[p.mother_id] : undefined, "आमा");
  spousesOf(p).forEach((i) => add(byId[i], gsel(byId[i], "पति", "पत्नी", "श्रीमान/श्रीमती")));
  sibsOf(p)
    .sort(byBirth)
    .forEach((y) => {
      const o = p.birth_bs && y.birth_bs ? y.birth_bs < p.birth_bs : null;
      add(
        y,
        y.gender === "M"
          ? o === true ? "दाजु" : o === false ? "भाइ" : "दाजुभाइ"
          : y.gender === "F"
          ? o === true ? "दिदी" : o === false ? "बहिनी" : "दिदीबहिनी"
          : "दाजुभाइ/दिदीबहिनी"
      );
    });
  kidsOf(p)
    .sort(byBirth)
    .forEach((k) => add(k, gsel(k, "छोरा", "छोरी", "सन्तान")));
  return R;
}

/** Generation number (1 = root). `depthOf` supplies tree depth when the chart has been laid out. */
export function genNo(g: Graph, id: string, depthOf?: (id: string) => number | undefined, n = 0): number {
  const d = depthOf?.(id);
  if (d !== undefined) return d + 1;
  const p = g.byId[id];
  if (!p || n > 40) return 1;
  const par = (p.father_id && g.byId[p.father_id]) || (p.mother_id && g.byId[p.mother_id]);
  if (par) return genNo(g, par.id, depthOf, n + 1) + 1;
  const s = g.isMarriedIn(p) && p.spouse_id ? g.byId[p.spouse_id] : null;
  return s ? genNo(g, s.id, depthOf, n + 1) : 1;
}

export interface FamGroup {
  title: string;
  members: VPerson[];
}

/** Grouping used on the "परिवार" tab. */
export function famGroups(g: Graph, me: VProfile, perms: Perms, RM: Record<string, string>): FamGroup[] {
  const { people, byId, spousesOf, kidsOf, byBirth, branchOf, downSet, sibsOf } = g;
  const { can } = perms;
  const pos = (id?: string | null) => (id ? byId[id] : undefined);
  const a = pos(me.position_person_id) || pos(me.position_parent_id) || pos(me.position_grand_id);
  const used = new Set<string>();
  const take = (arr: (VPerson | undefined)[]): VPerson[] =>
    arr.filter((p): p is VPerson => !!p && can(p.id) && !used.has(p.id) && !!used.add(p.id));
  const sp = (p: VPerson) => spousesOf(p).map((i) => byId[i]);
  const G: FamGroup[] = [];
  const sibs = (x: VPerson) => sibsOf(x).sort(byBirth);
  const fam = (x: VPerson) => [x, ...sp(x), ...kidsOf(x).sort(byBirth)];
  const marF = (x: VPerson) => x.gender === "F" && spousesOf(x).length > 0;

  if (a) {
    const f = pos(a.father_id);
    const m = pos(a.mother_id);
    const ks = kidsOf(a).sort(byBirth);
    const sons = ks.filter((k) => k.gender !== "F");
    const ds = ks.filter((k) => k.gender === "F");
    const ud = ds.filter((k) => !spousesOf(k).length);
    const gk = sons.flatMap((x) => kidsOf(x).sort(byBirth));
    G.push({
      title: "🏠अहिलेको परिवार",
      members: take([
        pos(f?.father_id), pos(f?.mother_id), f, m, a, ...sp(a), ...sons, ...sons.flatMap(sp), ...ud,
        ...gk.filter((k) => k.gender !== "F"),
        ...gk.filter((k) => k.gender === "F" && !spousesOf(k).length),
      ]),
    });
    const unc = f ? sibs(f).filter((y) => y.gender !== "F") : [];
    const bro = sibs(a).filter((y) => !marF(y));
    G.push({
      title: "💞 विवाहित छोरी-ज्वाइँ र भान्जा-भान्जी",
      members: take(
        [
          ...ds.filter(marF),
          ...gk.filter(marF),
          ...sibs(a).filter(marF),
          ...unc.flatMap((u) => kidsOf(u).filter(marF)),
        ].flatMap(fam)
      ),
    });
    const inl = a.gender === "F" ? sp(a).flatMap((h) => (h ? sibs(h).flatMap(fam) : [])) : [];
    G.push({
      title: "👬 दाजुभाइ, काका-काकी र भतिजा-भतिजी",
      members: take([
        ...bro.flatMap(fam),
        ...unc.flatMap((u) => [u, ...sp(u), ...kidsOf(u).sort(byBirth).flatMap((k) => (marF(k) ? [] : fam(k)))]),
        ...inl,
      ]),
    });
    const rest = people.filter((p) => can(p.id) && !used.has(p.id)).sort(byBirth);
    const side = (r?: VPerson) => {
      const s = new Set<string>();
      if (!r) return s;
      branchOf([r.id]).forEach((i) => s.add(i));
      const gp = pos(r.father_id) || pos(r.mother_id);
      if (gp) downSet(gp.id).forEach((i) => s.add(i));
      return s;
    };
    const P = side(f);
    const M = side(m);
    const bk = (p: VPerson) => (P.has(p.id) ? 0 : M.has(p.id) ? 1 : RM[p.id] ? 2 : p.is_living ? 3 : 4);
    [
      "🌿 बाबुपट्टिका आफन्त",
      "🌸 आमापट्टिका आफन्त (मामाली)",
      "🔗 स्पष्ट साइनो भएका अन्य सदस्य",
      "❔ साइनो स्पष्ट नभएका सदस्य",
      "🕊 साइनो स्पष्ट नभएका दिवंगत सदस्य",
    ].forEach((title, k) => G.push({ title, members: rest.filter((p) => bk(p) === k) }));
  } else {
    G.push({ title: "👥 सबै सदस्य", members: people.filter((p) => can(p.id)).sort(byBirth) });
  }
  return G;
}
