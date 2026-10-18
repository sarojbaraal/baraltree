// app/auth/signup/page.tsx
"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import GlassCard from "@/components/auth/GlassCard";

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [claimFather, setClaimFather] = useState("");
  const [claimGrand, setClaimGrand] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            claim_father: claimFather,
            claim_grand: claimGrand,
          },
        },
      });

      if (authError || !authData.user) {
        setErrorMsg(authError?.message || "दर्ता गर्न सकिएन।");
        return;
      }

      const { error: profileError } = await supabase.from("profiles").upsert({
        id: authData.user.id,
        email,
        full_name: fullName,
        role: "user",
        roles: ["user"],
        claim_father: claimFather,
        claim_grand: claimGrand,
      });

      if (profileError) {
        setErrorMsg(`प्रोफाइल सुरक्षित गर्न सकिएन: ${profileError.message}`);
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setErrorMsg("दर्ता प्रक्रियामा अप्रत्याशित त्रुटि उत्पन्न भयो।");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <GlassCard title="नयाँ सदस्य दर्ता" subtitle="वंशवृक्षमा आफ्नो पुस्ता र नाता दाबी गर्नुहोस्">
      {errorMsg && (
        <div className="mb-6 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs text-center font-medium">
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleSignup} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
            पूरा नाम (Full Name) *
          </label>
          <input
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="जस्तै: सरोज बराल"
            className="w-full px-4 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700/80 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
            इमेल (Email) *
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="saroj@example.com"
            className="w-full px-4 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700/80 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
            पासवर्ड (Password) *
          </label>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="न्यूनतम ६ अक्षर"
            className="w-full px-4 py-2.5 rounded-xl bg-slate-950/70 border border-slate-700/80 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 text-sm"
          />
        </div>

        {/* Generational Lineage Claim Inputs */}
        <div className="p-3.5 rounded-2xl bg-indigo-950/30 border border-indigo-700/40 space-y-3">
          <p className="text-[11px] font-medium text-cyan-300">
            वंशावली स्थान प्रमाणीकरण (प्रशासकीय रुजुको लागि):
          </p>
          <div>
            <label className="block text-[11px] text-slate-300 mb-1">
              पिताको नाम (Father&apos;s Full Name) *
            </label>
            <input
              type="text"
              required
              value={claimFather}
              onChange={(e) => setClaimFather(e.target.value)}
              placeholder="पिताको नाम लेख्नुहोस्"
              className="w-full px-3 py-2 rounded-lg bg-slate-950/80 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-cyan-400"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-300 mb-1">
              हजुरबुबाको नाम (Grandfather&apos;s Full Name) *
            </label>
            <input
              type="text"
              required
              value={claimGrand}
              onChange={(e) => setClaimGrand(e.target.value)}
              placeholder="हजुरबुबाको नाम लेख्नुहोस्"
              className="w-full px-3 py-2 rounded-lg bg-slate-950/80 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-cyan-400"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-3.5 px-4 rounded-xl font-semibold text-sm text-slate-950 bg-gradient-to-r from-cyan-400 via-teal-300 to-indigo-400 hover:from-cyan-300 hover:to-indigo-300 shadow-lg shadow-cyan-500/25 active:scale-[0.99] transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
        >
          {isLoading ? "दाबी दर्ता हुँदैछ..." : "दर्ता सम्पन्न गर्नुहोस्"}
        </button>
      </form>

      <div className="mt-6 pt-4 border-t border-slate-800 text-center">
        <p className="text-xs text-slate-400">
          पहिले नै खाता छ?{" "}
          <Link
            href="/auth/login"
            className="text-cyan-400 hover:text-cyan-300 font-semibold transition-colors"
          >
            यहाँ लगइन गर्नुहोस्
          </Link>
        </p>
      </div>
    </GlassCard>
  );
}
