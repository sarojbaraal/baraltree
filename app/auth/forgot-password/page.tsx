// app/auth/forgot-password/page.tsx
"use client";
import React, { useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import GlassCard from "@/components/auth/GlassCard";

export default function ForgotPasswordPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/login`,
      });

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      setSuccessMsg("पासवर्ड रिसेट लिङ्क तपाईंको इमेलमा पठाइयो। कृपया इनबक्स जाँच गर्नुहोस्।");
    } catch {
      setErrorMsg("अनपेक्षित समस्या आयो। कृपया पुनः प्रयास गर्नुहोस्।");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <GlassCard title="पासवर्ड पुनःप्राप्ति" subtitle="तपाईंको दर्ता गरिएको इमेलमा रिसेट लिङ्क पठाइनेछ">
      {successMsg && (
        <div className="mb-6 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs text-center font-medium">
          {successMsg}
        </div>
      )}

      {errorMsg && (
        <div className="mb-6 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs text-center font-medium">
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleReset} className="space-y-5">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
            इमेल ठेगाना (Email Address)
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@vanshavali.com"
            className="w-full px-4 py-3 rounded-xl bg-slate-950/70 border border-slate-700/80 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-3.5 px-4 rounded-xl font-semibold text-sm text-slate-950 bg-gradient-to-r from-cyan-400 via-teal-300 to-indigo-400 hover:from-cyan-300 hover:to-indigo-300 shadow-lg shadow-cyan-500/25 active:scale-[0.99] transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
        >
          {isLoading ? "पठाउँदै..." : "रिसेट लिङ्क पठाउनुहोस्"}
        </button>
      </form>

      <div className="mt-8 pt-6 border-t border-slate-800 text-center">
        <Link
          href="/auth/login"
          className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold transition-colors"
        >
          ← लगइनमा फर्कनुहोस्
        </Link>
      </div>
    </GlassCard>
  );
}
