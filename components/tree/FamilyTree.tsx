// components/tree/FamilyTree.tsx
"use client";
import React, { useMemo, useCallback } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  ConnectionLineType,
  ReactFlowProvider,
} from "reactflow";
import "reactflow/dist/style.css";
import dagre from "dagre";
import PersonNodeComponent, { PersonNodeData } from "./PersonNode";
import { useTreeStore } from "@/store/useTreeStore";

const nodeTypes = {
  personNode: PersonNodeComponent,
};

// Dagre Layout Computations for Tree Hierarchies
function getLayoutedElements(
  nodes: Node<PersonNodeData>[],
  edges: Edge[],
  direction = "TB"
) {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: direction, nodesep: 70, ranksep: 100 });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: 270, height: 120 });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - 135,
        y: nodeWithPosition.y - 60,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

function TreeCanvas() {
  const peopleMap = useTreeStore((s) => s.people);
  const collapsedBranchIds = useTreeStore((s) => s.collapsedBranchIds);
  const filterLivingOnly = useTreeStore((s) => s.filterLivingOnly);
  const filterGender = useTreeStore((s) => s.filterGender);

  // Compute Generational Depths and Children Graph
  const { nodes, edges } = useMemo(() => {
    const peopleList = Array.from(peopleMap.values());
    const childMap = new Map<string, string[]>();
    const parentMap = new Map<string, string>();

    // Index relationships
    peopleList.forEach((p) => {
      if (p.father_id) {
        parentMap.set(p.id, p.father_id);
        const current = childMap.get(p.father_id) || [];
        current.push(p.id);
        childMap.set(p.father_id, current);
      }
    });

    // Helper: Compute patriarchal generation depth
    const getGeneration = (personId: string, visited = new Set<string>()): number => {
      if (visited.has(personId)) return 1;
      visited.add(personId);
      const fatherId = parentMap.get(personId);
      if (!fatherId || !peopleMap.has(fatherId)) return 1;
      return 1 + getGeneration(fatherId, visited);
    };

    // Filter Out Hidden Nodes if an ancestor branch is collapsed
    const isNodeVisible = (personId: string): boolean => {
      let currentParentId = parentMap.get(personId);
      while (currentParentId) {
        if (collapsedBranchIds.has(currentParentId)) {
          return false;
        }
        currentParentId = parentMap.get(currentParentId);
      }
      return true;
    };

    const rawNodes: Node<PersonNodeData>[] = [];
    const rawEdges: Edge[] = [];

    peopleList.forEach((person) => {
      // Apply search / living / gender filters
      if (filterLivingOnly && !person.is_living) return;
      if (filterGender !== "all") {
        const isF = person.gender === "female" || person.gender === "F" || person.gender === "महिला";
        if (filterGender === "female" && !isF) return;
        if (filterGender === "male" && isF) return;
      }
      if (!isNodeVisible(person.id)) return;

      const children = childMap.get(person.id) || [];
      const generation = getGeneration(person.id);

      rawNodes.push({
        id: person.id,
        type: "personNode",
        position: { x: 0, y: 0 },
        data: {
          person,
          generation,
          hasChildren: children.length > 0,
          isCollapsed: collapsedBranchIds.has(person.id),
        },
      });

      // Lineage edge (Father -> Child)
      if (person.father_id && peopleMap.has(person.father_id) && isNodeVisible(person.father_id)) {
        rawEdges.push({
          id: `edge-${person.father_id}-${person.id}`,
          source: person.father_id,
          target: person.id,
          type: ConnectionLineType.SmoothStep,
          animated: false,
          style: { stroke: "#38bdf8", strokeWidth: 1.5, opacity: 0.6 },
        });
      }
    });

    return getLayoutedElements(rawNodes, rawEdges);
  }, [peopleMap, collapsedBranchIds, filterLivingOnly, filterGender]);

  return (
    <div className="w-full h-full relative bg-slate-950">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.08}
        maxZoom={2.5}
        attributionPosition="bottom-left"
        defaultEdgeOptions={{
          type: ConnectionLineType.SmoothStep,
        }}
      >
        <Background color="#1e293b" gap={28} size={1} />
        <Controls className="!bg-slate-900/90 !border !border-slate-700 !text-slate-300 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-md" />
        <MiniMap
          nodeColor="#38bdf8"
          maskColor="rgba(2, 6, 23, 0.8)"
          className="!bg-slate-900/90 !border !border-slate-800 rounded-2xl overflow-hidden shadow-2xl"
        />
      </ReactFlow>
    </div>
  );
}

export default function FamilyTree() {
  return <TreeCanvas />;
}
