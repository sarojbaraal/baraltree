// components/tree/PersonNode.tsx
"use client";
import React, { memo } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Person } from "@/types/database";
import { useTreeStore } from "@/store/useTreeStore";

export interface PersonNodeData {
  person: Person;
  generation: number;
  hasChildren: boolean;
  isCollapsed: boolean;
}

function PersonNodeComponent({ id, data }: NodeProps<PersonNodeData>) {
  const { person, generation, hasChildren, isCollapsed } = data;
  const selectedPersonId = useTreeStore((s) => s.selectedPersonId);
  const setSelectedPersonId = useTreeStore((s) => s.setSelectedPersonId);
  const toggleBranchCollapse = useTreeStore((s) => s.toggleBranchCollapse);

  const isSelected = selectedPersonId === person.id;
  const isFemale =
    person.gender === "female" || person.gender === "F" || person.gender === "महिला";

  return (
    <div className="relative group select-none">
      {/* React Flow Source & Target Connection Handles */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2.5 !h-2.5 !bg-cyan-400 !border-2 !border-slate-900 rounded-full"
      />

      <div
        onClick={() => setSelectedPersonId(person.id)}
        className={`w-64 p-3.5 rounded-2xl backdrop-blur-xl border transition-all duration-300 cursor-pointer shadow-xl relative overflow-hidden ${
          isSelected
            ? "bg-slate-900/90 border-cyan-400 ring-2 ring-cyan-400/40 shadow-cyan-500/20 scale-105 z-20"
            : person.is_branch_locked
            ? "bg-slate-950/60 border-amber-500/30 opacity-75 hover:opacity-100"
            : "bg-slate-900/75 border-slate-700/60 hover:border-slate-500/80 hover:bg-slate-900/90"
        }`}
      >
        {/* Branch Lock Indicator */}
        {person.is_branch_locked && (
          <div className="absolute top-2 right-2 flex items-center gap-1 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded-md text-[10px] text-amber-300 font-medium">
            🔒 सुरक्षित
          </div>
        )}

        <div className="flex items-center gap-3">
          {/* Portrait with Living Pulse */}
          <div className="relative flex-shrink-0">
            <div
              className={`w-12 h-12 rounded-xl overflow-hidden border flex items-center justify-center font-bold text-lg ${
                isFemale
                  ? "border-pink-500/40 bg-pink-950/30 text-pink-300"
                  : "border-cyan-500/40 bg-cyan-950/30 text-cyan-300"
              }`}
            >
              {person.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={person.photo_url}
                  alt={person.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span>{person.name ? person.name.charAt(0) : "व"}</span>
              )}
            </div>

            {/* Living Pulse Status */}
            <span
              title={person.is_living ? "जीवित" : "दिवङ्गत"}
              className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-slate-900 ${
                person.is_living
                  ? "bg-emerald-400 shadow-sm shadow-emerald-400"
                  : "bg-slate-500"
              }`}
            />
          </div>

          {/* Node Meta Details */}
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-cyan-400 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800/40">
                पुस्ता {generation}
              </span>
            </div>

            <h3 className="text-sm font-bold text-slate-100 truncate mt-0.5 group-hover:text-cyan-300 transition-colors">
              {!person.is_living ? "स्व. " : ""}
              {person.name}
            </h3>

            {/* Bikram Sambat Date Span */}
            <p className="text-[11px] text-slate-400 font-mono tracking-tight mt-0.5">
              {person.birth_bs ? `वि.सं. ${person.birth_bs}` : "जन्म: अज्ञात"}
              {person.death_bs && ` - ${person.death_bs}`}
            </p>
          </div>
        </div>

        {/* AI Insight Badges preview */}
        {person.ai_tags && person.ai_tags.length > 0 && (
          <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex flex-wrap gap-1">
            {person.ai_tags.slice(0, 2).map((tag, idx) => (
              <span
                key={idx}
                className="text-[9px] px-1.5 py-0.5 rounded-md bg-indigo-950/50 border border-indigo-700/40 text-indigo-300"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Collapse/Expand Subtree Button */}
      {hasChildren && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleBranchCollapse(person.id);
          }}
          className={`absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full border flex items-center justify-center text-xs font-bold transition-all z-30 shadow-lg cursor-pointer ${
            isCollapsed
              ? "bg-cyan-500 border-cyan-300 text-slate-950 scale-110 shadow-cyan-500/50"
              : "bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white"
          }`}
          title={isCollapsed ? "हाँगा खोल्नुहोस् (Expand)" : "हाँगा समेट्नुहोस् (Collapse)"}
        >
          {isCollapsed ? "+" : "−"}
        </button>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2.5 !h-2.5 !bg-cyan-400 !border-2 !border-slate-900 rounded-full"
      />
    </div>
  );
}

export default memo(PersonNodeComponent);
