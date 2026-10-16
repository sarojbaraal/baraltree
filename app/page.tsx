// app/page.tsx
"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ReactFlowProvider } from "reactflow";
import { createClient } from "@/utils/supabase/client";
import { useTreeStore } from "@/store/useTreeStore";
import FamilyTree from "@/components/tree/FamilyTree";
import ProfileDetailPanel from "@/components/profile/ProfileDetailPanel";
import SemanticSearchBar from "@/components/ui/SemanticSearchBar";
import { Person } from "@/types/database";

function MainDashboard() {
  const supabase = createClient();
  const setPeople = useTreeStore((s) => s.setPeople);
  const peopleMap = useTreeStore((s) => s.people);
  const filterLivingOnly = useTreeStore((s) => s.filterLivingOnly);
  const setFilterLivingOnly = useTreeStore((s) => s.setFilterLivingOnly);
  const filterGender = useTreeStore((s) => s.filterGender);
  const setFilterGender = useTreeStore((s) => s.setFilterGender);

  const [isLoading, setIsLoading] = useState(true);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setCurrentUserEmail(user.email ?? null);
        }

        // Try querying people table directly
        let { data, error } = await supabase
          .from("people")
          .select("*")
          .order("id", { ascending: true });

        // Fallback: If direct SELECT on people returned error, attempt get_people RPC
        if (error) {
          const rpcRes = await supabase.rpc("get_people");
          if (!rpcRes.error && rpcRes.data) {
            data = rpcRes.data;
            error = null;
          }
        }

        if (error) {
          console.warn("Supabase fetch notice:", error);
          if (error.code === "42501" || error.message?.includes("permission denied")) {
            setPermissionError(error.message);
          }
        } else if (data) {
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

      {/* Main Interactive Canvas / Auth Wall */}
      {isLoading ? (
        <div className="w-full h-full flex flex-col items-center justify-center gap-3">
          <div className="w-10 h-10 rounded-full border-3 border-cyan-400 border-t-transparent animate-spin" />
          <p className="text-xs text-cyan-400 font-mono tracking-widest uppercase">
            वंशावली अभिलेख लोड हुँदैछ...
          </p>
        </div>
      ) : permissionError && !currentUserEmail ? (
        <div className="w-full h-full flex items-center justify-center p-6 bg-slate-950 relative">
          {/* Subtle Ambient Glow */}
          <div className="absolute w-96 h-96 bg-cyan-500/10 rounded-full blur-[128px] pointer-events-none" />

          <div className="max-w-md w-full backdrop-blur-2xl bg-slate-900/80 border border-slate-700/70 rounded-3xl p-8 shadow-2xl text-center relative z-10 space-y-5">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-2xl text-amber-400 shadow-lg shadow-amber-500/10">
              🔒
            </div>

            <div>
              <h2 className="text-lg font-bold text-slate-100">
                वंशावली अभिलेख सुरक्षित छ
              </h2>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                पारिवारिक गोपनीयता नीति अनुसार वंशावली हेर्नको लागि तपाईंको प्रयोगकर्ता खाता प्रमाणीकरण (लगइन) हुन आवश्यक छ।
              </p>
            </div>

            <div className="flex flex-col gap-2.5 pt-2">
              <Link
                href="/auth/login"
                className="w-full py-3 rounded-xl font-bold text-xs bg-gradient-to-r from-cyan-400 to-indigo-400 text-slate-950 shadow-lg shadow-cyan-500/25 hover:opacity-95 transition-all text-center"
              >
                🔑 खातामा लगइन गर्नुहोस् (Sign In)
              </Link>
              <Link
                href="/auth/signup"
                className="w-full py-3 rounded-xl font-semibold text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all text-center"
              >
                नयाँ सदस्यता दाबी गर्नुहोस् (Register)
              </Link>
            </div>

            <div className="pt-4 border-t border-slate-800 text-[11px] text-slate-400 leading-normal bg-slate-950/50 p-3 rounded-xl border border-slate-800/80 text-left">
              <span className="font-semibold text-cyan-300 block mb-1">
                💡 प्रशासकका लागि जानकारी:
              </span>
              यदि तपाईं लगइन बिना नै जो-कोहीलाई सार्वजनिक रूपमा वंशावली देखाउन चाहनुहुन्छ भने, Supabase SQL Editor मा निम्न SQL चलाउनुहोस्:
              <code className="block mt-1 font-mono text-[10px] text-emerald-400 bg-slate-900 p-1.5 rounded border border-slate-800">
                GRANT SELECT ON public.people TO anon;
              </code>
            </div>
          </div>
        </div>
      ) : (
        <FamilyTree />
      )}

      {/* Slide-in Profile Detail Drawer */}
      <ProfileDetailPanel />
    </main>
  );
}

export default function HomePage() {
  return (
    <ReactFlowProvider>
      <MainDashboard />
    </ReactFlowProvider>
  );
}
