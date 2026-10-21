// components/auth/GlassCard.tsx
"use client";
import React from "react";
import { motion } from "framer-motion";
import Image from "next/image";

interface GlassCardProps {
  children: React.ReactNode;
  title: string;
  subtitle: string;
}

export default function GlassCard({ children, title, subtitle }: GlassCardProps) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-slate-950 relative overflow-hidden font-sans">
      {/* Decorative Cybernetic Glow Orbs */}
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-cyan-500/15 rounded-full blur-[128px] pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-purple-500/15 rounded-full blur-[128px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-md backdrop-blur-2xl bg-slate-900/75 border border-slate-700/60 rounded-3xl p-8 shadow-2xl shadow-indigo-950/50 relative z-10"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-cyan-500 to-indigo-600 shadow-lg shadow-cyan-500/30 mb-4 overflow-hidden">
            <Image 
              src="/icon.png" 
              alt="BaralTree Logo" 
              width={56} 
              height={56} 
              className="object-cover"
            />
          </div>
          <h1 className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-teal-200 to-indigo-300">
            {title}
          </h1>
          <p className="text-xs text-slate-400 mt-1 font-medium">{subtitle}</p>
        </div>
        {children}
      </motion.div>
    </div>
  );
}
