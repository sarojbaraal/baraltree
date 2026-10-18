// app/analytics/page.tsx
"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { createClient } from "@/utils/supabase/client";
import { FamilyAnalyticsData } from "@/types/database";

const GENDER_COLORS = ["#38bdf8", "#ec4899", "#a855f7"];
const LIVING_COLORS = ["#10b981", "#64748b"];

export default function AnalyticsPage() {
  const supabase = createClient();
  const [data, setData] = useState<FamilyAnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchAnalytics() {
      try {
        const { data: analyticsData, error } = await supabase.rpc("get_family_analytics");

        if (error) {
          // Never replace real family statistics with illustrative/sample values.
          console.error("Analytics RPC failed:", error.message);
          if (!cancelled) {
            setLoadError("तथ्याङ्क सेवा उपलब्ध छैन वा डेटाबेसमा आवश्यक analytics function तयार छैन।");
          }
          return;
        }

        if (!analyticsData) {
          if (!cancelled) setLoadError("अहिले तथ्याङ्क उपलब्ध छैन।");
          return;
        }

        if (!cancelled) setData(analyticsData as FamilyAnalyticsData);
      } catch {
        console.error("Analytics fetch failed.");
        if (!cancelled) {
          setLoadError("तथ्याङ्क लोड गर्दा समस्या भयो। कृपया केही समयपछि पुनः प्रयास गर्नुहोस्।");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchAnalytics();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-cyan-400 font-mono text-sm">
        वंशावली विश्लेषणात्मक तथ्याङ्क लोड हुँदैछ...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 text-sm gap-4 px-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-300 text-xl" aria-hidden="true">
          !
        </div>
        <h1 className="text-lg font-bold text-slate-100">तथ्याङ्क उपलब्ध छैन</h1>
        <p className="max-w-lg leading-relaxed">{loadError ?? "अहिले तथ्याङ्क उपलब्ध हुन सकेन।"}</p>
        <p className="max-w-lg text-xs text-slate-500 leading-relaxed">
          वास्तविक वंशावली अभिलेखबाट पुष्टि नभएसम्म अनुमानित वा नमुना सङ्ख्या देखाइँदैन।
        </p>
        <Link href="/" className="px-4 py-2 rounded-xl bg-slate-800 text-cyan-300 text-xs">
          ← वंशवृक्षमा फर्कनुहोस्
        </Link>
      </div>
    );
  }

  const genderChartData = [
    { name: "पुरुष (Male)", value: data.overview.male_count },
    { name: "महिला (Female)", value: data.overview.female_count },
    { name: "अन्य (Other)", value: data.overview.other_gender_count },
  ];

  const livingChartData = [
    { name: "जीवित (Living)", value: data.overview.living_members },
    { name: "दिवङ्गत (Deceased)", value: data.overview.deceased_members },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-12 font-sans">
      {/* Top Nav */}
      <div className="max-w-7xl mx-auto flex items-center justify-between mb-10 pb-6 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-teal-200 to-indigo-300">
            वंशावली एनालिटिक्स र जनसांख्यिकी
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            ऐतिहासिक आयु, भौगोलिक फैलावट र पुस्तागत तथ्याङ्क (Bikram Sambat Metrics)
          </p>
        </div>
        <Link
          href="/"
          className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-700 hover:border-cyan-400 text-xs text-slate-300 hover:text-white transition-all shadow-lg"
        >
          ← वंशवृक्ष क्यानभास
        </Link>
      </div>

      <div className="max-w-7xl mx-auto space-y-8">
        {/* Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 shadow-xl">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">कुल सदस्यहरू</span>
            <p className="text-3xl font-extrabold text-cyan-400 mt-2">{data.overview.total_members}</p>
          </div>
          <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 shadow-xl">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">अधिकतम पुस्ता गहिराइ</span>
            <p className="text-3xl font-extrabold text-indigo-400 mt-2">{data.max_generations} पुस्ता</p>
          </div>
          <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 shadow-xl">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">जीवित सदस्यहरू</span>
            <p className="text-3xl font-extrabold text-emerald-400 mt-2">{data.overview.living_members}</p>
          </div>
          <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 shadow-xl">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">दिवङ्गत पुर्खाहरू</span>
            <p className="text-3xl font-extrabold text-slate-400 mt-2">{data.overview.deceased_members}</p>
          </div>
        </div>

        {/* Charts Row 1: Longevity & Geography */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="p-6 rounded-3xl bg-slate-900/50 border border-slate-800/80 shadow-2xl">
            <h2 className="text-sm font-bold text-slate-200 mb-6 flex items-center gap-2">
              📊 पुर्खाहरूको दीर्घायु वितरण (Longevity Brackets)
            </h2>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.longevity}>
                  <XAxis dataKey="age_bracket" stroke="#64748b" fontSize={11} />
                  <YAxis stroke="#64748b" fontSize={11} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#020617", borderColor: "#334155", borderRadius: "12px" }}
                  />
                  <Bar dataKey="count" fill="#38bdf8" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="p-6 rounded-3xl bg-slate-900/50 border border-slate-800/80 shadow-2xl">
            <h2 className="text-sm font-bold text-slate-200 mb-6 flex items-center gap-2">
              📍 प्रमुख बसोबास तथा मूलथलो (Top Locations)
            </h2>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.geography} layout="vertical">
                  <XAxis type="number" stroke="#64748b" fontSize={11} />
                  <YAxis dataKey="location" type="category" stroke="#64748b" fontSize={11} width={80} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#020617", borderColor: "#334155", borderRadius: "12px" }}
                  />
                  <Bar dataKey="count" fill="#818cf8" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Charts Row 2: Gender & Status Donut Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="p-6 rounded-3xl bg-slate-900/50 border border-slate-800/80 shadow-2xl">
            <h2 className="text-sm font-bold text-slate-200 mb-6">
              ⚧ लिङ्गगत अनुपात (Gender Breakdown)
            </h2>
            <div className="h-64 w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={genderChartData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90}>
                    {genderChartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={GENDER_COLORS[index % GENDER_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: "#020617", borderColor: "#334155", borderRadius: "12px" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="p-6 rounded-3xl bg-slate-900/50 border border-slate-800/80 shadow-2xl">
            <h2 className="text-sm font-bold text-slate-200 mb-6">
              🌱 वर्तमान जीवन स्थिति (Living vs Deceased)
            </h2>
            <div className="h-64 w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={livingChartData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90}>
                    {livingChartData.map((_, index) => (
                      <Cell key={`cell-living-${index}`} fill={LIVING_COLORS[index % LIVING_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: "#020617", borderColor: "#334155", borderRadius: "12px" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
