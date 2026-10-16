// supabase/functions/generate-ai-insights/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

interface RequestPayload {
  person_id: string;
}

interface PersonRecord {
  id: string;
  name: string;
  gender: string;
  is_living: boolean;
  birth_bs: string | null;
  death_bs: string | null;
  address: string | null;
  notes: string | null;
  father_id: string | null;
  mother_id: string | null;
  spouse_id: string | null;
}

interface RelativeInfo {
  name: string;
  is_living: boolean;
}

interface GeminiTextResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

interface GeminiEmbeddingResponse {
  embedding?: {
    values: number[];
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");

    if (!supabaseUrl || !supabaseServiceRoleKey || !geminiApiKey) {
      throw new Error("Missing server environment variables (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY).");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const body: RequestPayload = await req.json();
    const { person_id } = body;

    if (!person_id) {
      return new Response(JSON.stringify({ error: "person_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Fetch Person Record
    const { data: person, error: personError } = await supabase
      .from("people")
      .select("id, name, gender, is_living, birth_bs, death_bs, address, notes, father_id, mother_id, spouse_id")
      .eq("id", person_id)
      .single();

    if (personError || !person) {
      return new Response(JSON.stringify({ error: `Person not found: ${personError?.message}` }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const currentPerson = person as PersonRecord;

    // 2. Fetch Immediate Family Context
    let fatherName = "अज्ञात";
    let motherName = "अज्ञात";
    let spouseName = "अज्ञात";

    if (currentPerson.father_id) {
      const { data: father } = await supabase
        .from("people")
        .select("name, is_living")
        .eq("id", currentPerson.father_id)
        .single();
      if (father) {
        fatherName = `${(father as RelativeInfo).is_living ? "श्री" : "स्वर्गीय"} ${(father as RelativeInfo).name}`;
      }
    }

    if (currentPerson.mother_id) {
      const { data: mother } = await supabase
        .from("people")
        .select("name, is_living")
        .eq("id", currentPerson.mother_id)
        .single();
      if (mother) {
        motherName = `${(mother as RelativeInfo).is_living ? "श्रीमती" : "स्वर्गीय"} ${(mother as RelativeInfo).name}`;
      }
    }

    if (currentPerson.spouse_id) {
      const { data: spouse } = await supabase
        .from("people")
        .select("name, is_living")
        .eq("id", currentPerson.spouse_id)
        .single();
      if (spouse) {
        spouseName = `${(spouse as RelativeInfo).is_living ? "श्री/श्रीमती" : "स्वर्गीय"} ${(spouse as RelativeInfo).name}`;
      }
    }

    const { data: childrenData } = await supabase
      .from("people")
      .select("name, gender, is_living")
      .or(`father_id.eq.${currentPerson.id},mother_id.eq.${currentPerson.id}`);

    const childrenNames = childrenData && childrenData.length > 0
      ? childrenData.map((c: { name: string }) => c.name).join(", ")
      : "उल्लेख नभएको";

    // 3. Construct Culturally Sensitive Gemini Prompt
    const systemPrompt = `
तपाईं एक प्रतिष्ठित नेपाली वंशावली (Vanshavali) इतिहासकार तथा शोधकर्ता हुनुहुन्छ। 
तपाईंको कार्य प्राप्त पारिवारिक विवरणका आधारमा अत्यन्त शिष्ट, मर्यादित र औपचारिक नेपाली भाषामा संक्षिप्त जीवनी सारांश (summary) र ३ देखि ५ वटा मुख्य वर्गीकरण ट्यागहरू (tags) तयार पार्नु हो।

नियमहरू:
1. व्यक्ति दिवङ्गत (मृतक) भएमा अनिवार्य रूपमा नामको अगाडि 'स्वर्गीय' वा 'वैकुण्ठवासी' उल्लेख गर्नुहोस्।
2. जीवित भएमा सम्मानजनक शब्द (जस्तै: श्री, श्रीमती, आदरणीय) प्रयोग गर्नुहोस्।
3. पारिवारिक नाताहरू (पिता, माता, धर्मपत्नी/पति, सन्तान) को औपचारिक नेपाली शब्दावली प्रयोग गर्नुहोस्।
4. सारांश ठ्याक्कै ३ देखि ४ पूर्ण वाक्यमा हुनुपर्छ।
5. ट्यागहरू नेपालीमा हुनुपर्छ (जस्तै: ["शिक्षक", "काठमाडौं", "ज्येष्ठ नागरिक", "समाजसेवी"])।

आउटपुट मात्र निम्न JSON ढाँचामा हुनुपर्दछ, कुनै अतिरिक्त मार्कडाउन वा ब्याकटिक नराख्नुहोस्:
{
  "summary": "३-४ वाक्यको जीवनी यहाँ",
  "tags": ["ट्याग१", "ट्याग२", "ट्याग३"]
}
`;

    const userContent = `
व्यक्तिगत विवरण:
- नाम: ${currentPerson.name}
- लिङ्ग: ${currentPerson.gender === "male" || currentPerson.gender === "M" ? "पुरुष" : "महिला"}
- अवस्था: ${currentPerson.is_living ? "जीवित" : "दिवङ्गत (मृतक)"}
- जन्म मिति (वि.सं.): ${currentPerson.birth_bs || "उल्लेख नभएको"}
- मृत्यु मिति (वि.सं.): ${currentPerson.death_bs || "उल्लेख नभएको"}
- ठेगाना/मूलथलो: ${currentPerson.address || "उल्लेख नभएको"}
- पिता: ${fatherName}
- माता: ${motherName}
- जीवनसाथी: ${spouseName}
- सन्तानहरू: ${childrenNames}
- अतिरिक्त टिपोटहरू: ${currentPerson.notes || "कुनै थप टिपोट छैन"}
`;

    // 4. Call Google Gemini API
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${geminiApiKey}`;
    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: `${systemPrompt}\n\n${userContent}` }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 600,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      throw new Error(`Gemini Text API error (${geminiResponse.status}): ${errText}`);
    }

    const geminiData: GeminiTextResponse = await geminiResponse.json();
    const rawOutput = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

    let parsed: { summary?: string; tags?: string[] };
    try {
      parsed = JSON.parse(rawOutput);
    } catch {
      const cleanJson = rawOutput.replace(/```json/g, "").replace(/```/g, "").trim();
      parsed = JSON.parse(cleanJson);
    }

    const summary = parsed.summary || `${currentPerson.name}को पारिवारिक विवरण वंशवलीमा सुरक्षित गरिएको छ।`;
    const tags = Array.isArray(parsed.tags) ? parsed.tags : ["पारिवारिक सदस्य"];

    // 5. Generate Semantic Vector Embedding via text-embedding-004 (768-dim)
    const textToEmbed = `
नाम: ${currentPerson.name}
ठेगाना: ${currentPerson.address || ""}
जीवनी सारांश: ${summary}
ट्यागहरू: ${tags.join(", ")}
टिपोट: ${currentPerson.notes || ""}
`.trim();

    const embedUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${geminiApiKey}`;
    const embedResponse = await fetch(embedUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "models/gemini-embedding-001",
        content: {
          parts: [{ text: textToEmbed }],
        },
        outputDimensionality: 768,
      }),
    });

    if (!embedResponse.ok) {
      const errText = await embedResponse.text();
      throw new Error(`Gemini Embedding API error (${embedResponse.status}): ${errText}`);
    }

    const embedData: GeminiEmbeddingResponse = await embedResponse.json();
    const embedding = embedData.embedding?.values;

    if (!embedding || embedding.length !== 768) {
      throw new Error(`Invalid embedding vector generated. Dimension expected: 768, got: ${embedding?.length}`);
    }

    // 6. Update Database Record
    const { error: updateError } = await supabase
      .from("people")
      .update({
        ai_summary: summary,
        ai_tags: tags,
        ai_embedding: embedding,
        updated_at: new Date().toISOString(),
      })
      .eq("id", currentPerson.id);

    if (updateError) {
      throw new Error(`Failed to update people record: ${updateError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        person_id: currentPerson.id,
        ai_summary: summary,
        ai_tags: tags,
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
