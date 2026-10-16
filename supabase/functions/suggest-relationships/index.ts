// supabase/functions/suggest-relationships/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

interface PersonNode {
  id: string;
  name: string;
  gender: string;
  birth_bs: string | null;
  death_bs: string | null;
  address: string | null;
  father_id: string | null;
  mother_id: string | null;
  spouse_id: string | null;
}

interface SuggestionCandidate {
  source_person_id: string;
  target_person_id: string;
  suggestion_type: "potential_father" | "potential_mother" | "potential_sibling" | "potential_spouse";
  confidence_score: number;
  reasoning_ne: string;
}

function parseBsYear(bsDate: string | null): number | null {
  if (!bsDate) return null;
  const match = bsDate.match(/^(\d{4})/);
  return match ? parseInt(match[1], 10) : null;
}

function extractSurname(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

function isSameLocality(addr1: string | null, addr2: string | null): boolean {
  if (!addr1 || !addr2) return false;
  const clean1 = addr1.toLowerCase().trim().split(",")[0];
  const clean2 = addr2.toLowerCase().trim().split(",")[0];
  return clean1.length > 2 && (clean1.includes(clean2) || clean2.includes(clean1));
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error("Missing Supabase environment variables.");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // 1. Fetch genealogy candidate nodes
    const { data: allPeople, error: fetchError } = await supabase
      .from("people")
      .select("id, name, gender, birth_bs, death_bs, address, father_id, mother_id, spouse_id")
      .limit(1000);

    if (fetchError || !allPeople) {
      throw new Error(`Error fetching genealogy graph: ${fetchError?.message}`);
    }

    const people: PersonNode[] = allPeople as PersonNode[];
    const suggestions: SuggestionCandidate[] = [];

    // 2. Heuristic Cross-Referencing & Relational Inference
    for (let i = 0; i < people.length; i++) {
      const p1 = people[i];
      const y1 = parseBsYear(p1.birth_bs);
      const s1 = extractSurname(p1.name);

      for (let j = 0; j < people.length; j++) {
        if (i === j) continue;
        const p2 = people[j];
        const y2 = parseBsYear(p2.birth_bs);
        const s2 = extractSurname(p2.name);

        // Potential Father Suggestion
        const p2IsMale = p2.gender === "male" || p2.gender === "M";
        if (!p1.father_id && p2IsMale && y1 && y2) {
          const ageDiff = y1 - y2;
          if (ageDiff >= 18 && ageDiff <= 55) {
            const sameSurname = s1 && s2 && s1 === s2;
            const samePlace = isSameLocality(p1.address, p2.address);

            if (sameSurname || samePlace) {
              let score = 0.65;
              if (sameSurname) score += 0.20;
              if (samePlace) score += 0.10;
              if (ageDiff >= 22 && ageDiff <= 40) score += 0.04;

              const finalScore = Math.min(Number(score.toFixed(3)), 0.95);
              const reasoning = `${p2.name} ${p1.name} भन्दा ${ageDiff} वर्ष जेष्ठ हुनुहुन्छ। दुवैको थर '${p1.name.split(" ").pop()}' ${samePlace ? "र ठेगाना (" + (p1.address || "") + ") " : ""}मिलेकाले पिता हुने सम्भावना देखिन्छ।`;

              suggestions.push({
                source_person_id: p1.id,
                target_person_id: p2.id,
                suggestion_type: "potential_father",
                confidence_score: finalScore,
                reasoning_ne: reasoning,
              });
            }
          }
        }

        // Potential Sibling Suggestion
        if (!p1.father_id && !p2.father_id && y1 && y2) {
          const ageDiff = Math.abs(y1 - y2);
          if (ageDiff <= 12 && s1 && s2 && s1 === s2) {
            const samePlace = isSameLocality(p1.address, p2.address);
            if (samePlace) {
              const score = Number((0.70 + (12 - ageDiff) * 0.02).toFixed(3));
              const reasoning = `${p1.name} र ${p2.name} को जन्म अन्तर ${ageDiff} वर्ष मात्र रहेको र दुवैको मूल थलो (${p1.address || ""}) समान भएकाले सहोदर दाजुभाइ/दिदीबहिनी हुने उच्च सम्भावना छ।`;

              suggestions.push({
                source_person_id: p1.id,
                target_person_id: p2.id,
                suggestion_type: "potential_sibling",
                confidence_score: Math.min(score, 0.94),
                reasoning_ne: reasoning,
              });
            }
          }
        }
      }
    }

    // 3. Batch upsert into ai_suggestions table
    let insertedCount = 0;
    for (const sug of suggestions) {
      const { error: insertError } = await supabase
        .from("ai_suggestions")
        .upsert(
          {
            source_person_id: sug.source_person_id,
            target_person_id: sug.target_person_id,
            suggestion_type: sug.suggestion_type,
            confidence_score: sug.confidence_score,
            reasoning_ne: sug.reasoning_ne,
            status: "pending",
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "source_person_id,target_person_id,suggestion_type",
            ignoreDuplicates: true,
          }
        );

      if (!insertError) {
        insertedCount++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        evaluated_nodes: people.length,
        suggestions_generated: suggestions.length,
        suggestions_staged: insertedCount,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
