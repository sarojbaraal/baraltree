// app/page.tsx
"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { useTreeStore } from "@/store/useTreeStore";
import FamilyTree from "@/components/tree/FamilyTree";
import ProfileDetailPanel from "@/components/profile/ProfileDetailPanel";
import SemanticSearchBar from "@/components/ui/SemanticSearchBar";
import { Person } from "@/types/database";

export default function HomePage() {
  const supabase = createClient();
  const setPeople = useTreeStore((s) => s.setPeople);
  const peopleMap = useTreeStore((s) => s.people);
  const filterLivingOnly = useTreeStore((s) => s.filterLivingOnly);
  const setFilterLivingOnly = useTreeStore((s) => s.setFilterLivingOnly);
  const filterGender = useTreeStore((s) => s.filterGender);
  const setFilterGender = useTreeStore((s) => s.setFilterGender);

  const [isLoading, setIsLoading] = useState(true);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        // 1. Check Auth User
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setCurrentUserEmail(user.email ?? null);
        }

        // 2. Fetch People
        const { data, error } = await supabase
          .from("people")
          .select("*")
          .order("id", { ascending: true });

        if (!error && data) {
          setPeople(data as Person[]);
        }
      } catch (err) {
        console.error("Failed to load vanshavali data:", err);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [supabase, setPeople]);

  return (
    <main className="w-screen h-screen relative overflow-hidden bg-slate-950 font-sans select-none">
      {/* Floating Futuristic HUD Topbar */}
      <header className="absolute top-4 left-4 right-4 z-40 flex flex-wrap items-center justify-between gap-3 pointer-events-none">
        {/* Left Branding & Counter */}
        <div className="flex items-center gap-3 backdrop-blur-2xl bg-slate-900/80 border border-slate-700/70 p-2 px-4 rounded-2xl shadow-2xl pointer-events-auto">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center font-bold text-white text-base shadow-lg shadow-cyan-500/30">
            व
          </div>
          <div>
            <h1 className="text-sm font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-teal-200 to-white">
              हाम्रो वंशावली
            </h1>
            <p className="text-[10px] text-slate-400 font-mono">
              कुल सदस्य: {peopleMap.size} जना
            </p>
          </div>
        </div>

        {/* Center: Semantic Vector Search */}
        <div className="pointer-events-auto">
          <SemanticSearchBar />
        </div>

        {/* Right: Filters & Quick Actions */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Living Filter Toggle */}
          <button
            onClick={() => setFilterLivingOnly(!filterLivingOnly)}
            className={`px-3 py-2 rounded-xl text-xs font-semibold backdrop-blur-xl border transition-all cursor-pointer ${
              filterLivingOnly
                ? "bg-emerald-950/80 border-emerald-500/60 text-emerald-300 shadow-lg shadow-emerald-950/50"
                : "bg-slate-900/80 border-slate-700/60 text-slate-400 hover:text-white"
            }`}
          >
            🌱 {filterLivingOnly ? "जीवित मात्र" : "सबै सदस्य"}
          </button>

          {/* Gender Filter Buttons */}
          <div className="flex bg-slate-900/80 backdrop-blur-xl border border-slate-700/60 rounded-xl p-1 text-xs">
            <button
              onClick={() => setFilterGender("all")}
              className={`px-2 py-1 rounded-lg transition-all cursor-pointer ${
                filterGender === "all" ? "bg-slate-800 text-white font-bold" : "text-slate-400"
              }`}
            >
              सबै
            </button>
            <button
              onClick={() => setFilterGender("male")}
              className={`px-2 py-1 rounded-lg transition-all cursor-pointer ${
                filterGender === "male" ? "bg-cyan-950 text-cyan-300 font-bold" : "text-slate-400"
              }`}
            >
              पुरुष
            </button>
            <button
              onClick={() => setFilterGender("female")}
              className={`px-2 py-1 rounded-lg transition-all cursor-pointer ${
                filterGender === "female" ? "bg-pink-950 text-pink-300 font-bold" : "text-slate-400"
              }`}
            >
              महिला
            </button>
          </div>

          {/* Analytics Route Button */}
          <Link
            href="/analytics"
            className="px-3.5 py-2 rounded-xl text-xs font-semibold backdrop-blur-xl bg-slate-900/80 border border-slate-700/60 text-slate-200 hover:border-cyan-400 hover:text-cyan-300 transition-all shadow-xl"
          >
            📊 तथ्याङ्क
          </Link>

          {/* Auth Action */}
          {currentUserEmail ? (
            <div className="px-3 py-2 rounded-xl text-xs font-medium backdrop-blur-xl bg-indigo-950/50 border border-indigo-700/50 text-indigo-300">
              👤 {currentUserEmail.split("@")[0]}
            </div>
          ) : (
            <Link
              href="/auth/login"
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-cyan-400 to-indigo-400 text-slate-950 shadow-lg shadow-cyan-500/20 hover:opacity-95 transition-all"
            >
              लगइन
            </Link>
          )}
        </div>
      </header>

      {/* Main Interactive Canvas */}
      {isLoading ? (
        <div className="w-full h-full flex flex-col items-center justify-center gap-3">
          <div className="w-10 h-10 rounded-full border-3 border-cyan-400 border-t-transparent animate-spin" />
          <p className="text-xs text-cyan-400 font-mono tracking-widest uppercase">
            वंशावली अभिलेख लोड हुँदैछ...
          </p>
        </div>
      ) : (
        <FamilyTree />
      )}

      {/* Slide-in Profile Detail Drawer */}
      <ProfileDetailPanel />
    </main>
  );
}
