// Generates and saves the AI summary of one person (shared by the profile panel and the family home).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Graph } from "./graph";
import type { VPerson } from "./types";

export async function generateAiSummary(db: SupabaseClient, g: Pick<Graph, "byId" | "kidsOf">, p: VPerson): Promise<void> {
  const { data, error } = await db.functions.invoke("generate-ai-insights", {
    body: {
      action: "summarize",
      person: { name: p.name, gender: p.gender, birth_bs: p.birth_bs, death_bs: p.death_bs, is_living: p.is_living, birth_place: p.birth_place, notes: p.notes },
      family_context: {
        father: (p.father_id && g.byId[p.father_id]?.name) || "अज्ञात",
        mother: (p.mother_id && g.byId[p.mother_id]?.name) || "अज्ञात",
        spouse: p.spouse_id ? g.byId[p.spouse_id]?.name : "अज्ञात",
        children: g.kidsOf(p).map((k) => k.name).join(", ") || "उल्लेख नभएको",
      },
    },
  });
  if (error) throw error;
  const { error: e2 } = await db.rpc("set_ai_summary", { pid: p.id, summary: data.summary, tags: data.tags || [] });
  if (e2) throw e2;
}
