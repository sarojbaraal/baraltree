// app/api/search/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();
    if (!query || typeof query !== "string") {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    const supabase = await createClient();

    // If Gemini API Key is available, use vector cosine search
    if (geminiApiKey) {
      const embedUrl = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${geminiApiKey}`;
      const embedRes = await fetch(embedUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "models/text-embedding-004",
          content: { parts: [{ text: query }] },
        }),
      });

      if (embedRes.ok) {
        const embedData = await embedRes.json();
        const queryVector = embedData.embedding?.values;

        if (queryVector) {
          const { data, error } = await supabase.rpc("match_people_by_embedding", {
            query_embedding: queryVector,
            match_threshold: 0.35,
            match_count: 8,
          });

          if (!error && data && data.length > 0) {
            return NextResponse.json(data);
          }
        }
      }
    }

    // Graceful fallback to text search across name, address, notes, and ai_tags
    const { data: fallbackData } = await supabase
      .from("people")
      .select("id, name, gender, birth_bs, death_bs, address, ai_summary, ai_tags, photo_url")
      .or(`name.ilike.%${query}%,address.ilike.%${query}%,notes.ilike.%${query}%`)
      .limit(8);

    const formatted = (fallbackData || []).map((p) => ({
      ...p,
      similarity: 0.88,
    }));

    return NextResponse.json(formatted);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "Vector search failed" },
      { status: 500 }
    );
  }
}
