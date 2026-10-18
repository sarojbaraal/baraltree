// components/profile/ProfileDetailPanel.tsx
"use client";
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTreeStore } from "@/store/useTreeStore";
import { resolveNepaliKinship } from "@/utils/kinship";
import { createClient } from "@/utils/supabase/client";

export default function ProfileDetailPanel() {
  const supabase = createClient();
  const peopleMap = useTreeStore((s) => s.people);
  const selectedPersonId = useTreeStore((s) => s.selectedPersonId);
  const isSidebarOpen = useTreeStore((s) => s.isSidebarOpen);
  const setSelectedPersonId = useTreeStore((s) => s.setSelectedPersonId);
  const upsertPerson = useTreeStore((s) => s.upsertPerson);

  const [isRegenerating, setIsRegenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isSidebarOpen || !selectedPersonId) return null;

  const person = peopleMap.get(selectedPersonId);
  if (!person) return null;

  // Immediate Family Relatives
  const father = person.father_id ? peopleMap.get(person.father_id) : null;
  const mother = person.mother_id ? peopleMap.get(person.mother_id) : null;
  const spouse = person.spouse_id ? peopleMap.get(person.spouse_id) : null;
  const children = Array.from(peopleMap.values()).filter(
    (p) => p.father_id === person.id || p.mother_id === person.id
  );

  // Cultural Kinship computation
  const kinship = father
    ? resolveNepaliKinship(person, father, peopleMap)
    : { term_ne: "मूल पुर्खा (Root Ancestor)", term_en: "Progenitor" };

  // Trigger Supabase Edge Function to Regenerate AI Insights
  const handleRegenerateAI = async () => {
    setIsRegenerating(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke("generate-ai-insights", {
        body: { person_id: person.id },
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data?.success) {
        upsertPerson({
          ...person,
          ai_summary: data.ai_summary,
          ai_tags: data.ai_tags,
        });
      }
    } catch (err) {
      setErrorMsg((err as Error).message || "AI विश्लेषण उत्पन्न गर्न असफल।");
    } finally {
      setIsRegenerating(false);
    }
  };

  const handlePrintBranch = () => {
    window.print();
  };

  return (
    <>
      <AnimatePresence>
        <motion.div
          initial={{ x: "100%", opacity: 0.5 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: "100%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="fixed top-0 right-0 h-screen w-full max-w-md bg-slate-950/90 backdrop-blur-2xl border-l border-slate-800 z-50 flex flex-col shadow-2xl font-sans"
        >
          {/* Header */}
          <div className="p-5 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
              <h2 className="text-sm font-bold text-slate-100 tracking-wide">
                पारिवारिक तथा व्यक्तिगत विवरण
              </h2>
            </div>
            <button
              onClick={() => setSelectedPersonId(null)}
              className="w-8 h-8 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors text-sm cursor-pointer"
            >
              ✕
            </button>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Person Banner Card */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900/90 to-indigo-950/40 border border-slate-800 flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center text-xl font-bold text-cyan-400 flex-shrink-0">
                {person.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={person.photo_url} alt={person.name} className="w-full h-full object-cover" />
                ) : (
                  person.name.charAt(0)
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-base font-extrabold text-white truncate">
                  {!person.is_living ? "स्वर्गीय " : ""}
                  {person.name}
                </h1>
                <p className="text-xs text-cyan-300 font-medium mt-0.5">
                  नाता: {kinship.term_ne}
                </p>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                  वि.सं. {person.birth_bs || "अज्ञात"} — {person.death_bs || (person.is_living ? "हाल जीवित" : "अज्ञात")}
                </p>
              </div>
            </div>

            {/* AI Generational Insights Section */}
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-indigo-500/30 relative overflow-hidden">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-xs font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-indigo-300 flex items-center gap-1.5">
                  ✨ जेमिनी एआई जीवनी सारांश (AI Insights)
                </span>
                <button
                  onClick={handleRegenerateAI}
                  disabled={isRegenerating}
                  className="px-2.5 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-[10px] font-semibold text-indigo-200 transition-all disabled:opacity-50 flex items-center gap-1 cursor-pointer"
                >
                  {isRegenerating ? "विश्लेषण हुँदै..." : "✨ Regenerate"}
                </button>
              </div>

              {errorMsg && (
                <p className="text-xs text-red-400 mb-2">{errorMsg}</p>
              )}

              <p className="text-xs text-slate-300 leading-relaxed font-serif">
                {person.ai_summary || "यस सदस्यको लागि AI सारांश तयार गरिएको छैन। 'Regenerate' मा थिच्नुहोस्।"}
              </p>

              {person.ai_tags && person.ai_tags.length > 0 && (
                <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex flex-wrap gap-1.5">
                  {person.ai_tags.map((tag, idx) => (
                    <span
                      key={idx}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950/60 border border-cyan-800/40 text-cyan-300"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Immediate Relatives */}
            <div className="space-y-2.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                पारिवारिक सम्बन्धहरू
              </h3>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">पिता (Father)</span>
                  <span className="text-slate-200 font-semibold">{father?.name || "उल्लेख नभएको"}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">माता (Mother)</span>
                  <span className="text-slate-200 font-semibold">{mother?.name || "उल्लेख नभएको"}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 col-span-2">
                  <span className="text-slate-500 block text-[10px]">जीवनसाथी (Spouse)</span>
                  <span className="text-slate-200 font-semibold">{spouse?.name || "उल्लेख नभएको"}</span>
                </div>
              </div>

              {/* Children List */}
              {children.length > 0 && (
                <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                  <span className="text-slate-500 block text-[10px] mb-1.5">
                    सन्तानहरू ({children.length})
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {children.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setSelectedPersonId(c.id)}
                        className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-cyan-950 hover:text-cyan-300 border border-slate-700 transition-colors cursor-pointer"
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Contact & Location */}
            <div className="space-y-2 text-xs">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                सम्पर्क तथा मूलथलो
              </h3>
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                <p className="text-slate-300">
                  <span className="text-slate-500">ठेगाना: </span>
                  {person.address || "उल्लेख नभएको"}
                </p>
                <p className="text-slate-300">
                  <span className="text-slate-500">फोन: </span>
                  {person.phone || "गोप्य वा उल्लेख नभएको"}
                </p>
              </div>
            </div>
          </div>

          {/* Footer with Print Action */}
          <div className="p-4 border-t border-slate-800 bg-slate-950/90 flex gap-3">
            <button
              onClick={handlePrintBranch}
              className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
            >
              🖨️ A3 शाखा प्रिन्ट गर्नुहोस् (Print Branch)
            </button>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* A3 Optimized Grayscale Print Stylesheet */}
      <style jsx global>{`
        @media print {
          @page {
            size: A3 landscape;
            margin: 15mm;
          }
          body * {
            visibility: hidden;
          }
          .react-flow__viewport,
          .react-flow__viewport * {
            visibility: visible;
          }
          body {
            background: #ffffff !important;
            color: #000000 !important;
          }
          .react-flow__node {
            filter: grayscale(100%) contrast(150%);
            border: 1px solid #000 !important;
            background: #fff !important;
            box-shadow: none !important;
          }
        }
      `}</style>
    </>
  );
}
