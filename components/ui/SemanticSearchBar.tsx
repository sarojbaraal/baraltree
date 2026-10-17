// components/ui/SemanticSearchBar.tsx
"use client";
import React, { useState, useEffect, useRef } from "react";
import { useReactFlow } from "reactflow";
import { useTreeStore } from "@/store/useTreeStore";

interface MatchResult {
  id: string;
  name: string;
  gender: string;
  birth_bs: string | null;
  death_bs: string | null;
  address: string | null;
  ai_summary: string | null;
  ai_tags: string[];
  photo_url: string | null;
  similarity: number;
}

export default function SemanticSearchBar() {
  const { setCenter, getNode } = useReactFlow();
  const setSelectedPersonId = useTreeStore((s) => s.setSelectedPersonId);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MatchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    // Hide stale suggestions in the render when the query is too short.
    // Avoid synchronous state updates inside this effect.
    if (query.trim().length < 2) return;

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
        });

        if (res.ok) {
          const data: MatchResult[] = await res.json();
          setResults(data);
          setIsOpen(data.length > 0);
        }
      } catch (err) {
        console.error("Vector search failed:", err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelectPerson = (personId: string) => {
    setSelectedPersonId(personId);
    setIsOpen(false);

    const node = getNode(personId);
    if (node) {
      setCenter(node.position.x + 135, node.position.y + 60, {
        zoom: 1.2,
        duration: 800,
      });
    }
  };

  return (
    <div ref={containerRef} className="relative w-72 md:w-96">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="प्राकृतिक भाषा खोज (जस्तै: काठमाडौंका शिक्षक)..."
          className="w-full pl-9 pr-9 py-2.5 rounded-2xl bg-slate-900/85 backdrop-blur-xl border border-slate-700/70 text-slate-100 placeholder-slate-400 text-xs focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 shadow-xl transition-all"
        />
        <span className="absolute left-3 top-2.5 text-slate-400 text-xs">🔍</span>
        {isSearching && (
          <span className="absolute right-3 top-2.5 w-3.5 h-3.5 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
        )}
      </div>

      {/* Auto-suggest Results Modal */}
      {isOpen && query.trim().length >= 2 && (
        <div className="absolute top-12 left-0 w-full rounded-2xl bg-slate-950/95 backdrop-blur-2xl border border-slate-800 shadow-2xl p-2 z-50 max-h-80 overflow-y-auto space-y-1">
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => handleSelectPerson(r.id)}
              className="w-full text-left p-2.5 rounded-xl hover:bg-slate-900/90 border border-transparent hover:border-slate-800 flex items-center justify-between group transition-all cursor-pointer"
            >
              <div className="min-w-0 pr-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-200 group-hover:text-cyan-300 truncate">
                    {r.name}
                  </span>
                  <span className="text-[10px] text-cyan-400 bg-cyan-950/80 px-1.5 py-0.2 rounded border border-cyan-800/40">
                    {Math.round(r.similarity * 100)}% समानता
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 truncate mt-0.5">
                  {r.address || "ठेगाना नखुलेको"} {r.birth_bs ? `• वि.सं. ${r.birth_bs}` : ""}
                </p>
              </div>
              <span className="text-xs text-slate-600 group-hover:text-slate-400">→</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
