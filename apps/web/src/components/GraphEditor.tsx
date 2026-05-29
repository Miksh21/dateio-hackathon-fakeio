"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  MarkerType,
  type Node,
  type Edge,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { createClient } from "@/lib/supabase/client";
import type { RelationshipType } from "@/lib/types";

type Emp = { id: string; first_name: string; last_name: string; division: string | null; role: string };
type Rel = { id: string; from_employee_id: string; to_employee_id: string; relationship_type: RelationshipType };

function relToEdge(r: Rel): Edge {
  const peer = r.relationship_type === "peer";
  return {
    id: r.id,
    source: r.from_employee_id,
    target: r.to_employee_id,
    animated: !peer,
    style: peer ? { stroke: "#6b7280", strokeDasharray: "6 4" } : { stroke: "#2563eb" },
    markerEnd: peer ? undefined : { type: MarkerType.ArrowClosed, color: "#2563eb" },
    label: r.relationship_type,
    labelStyle: { fontSize: 9, fill: "#6b7280" },
  };
}

export default function GraphEditor({
  cycleId,
  employees,
  relationships,
}: {
  cycleId: string;
  employees: Emp[];
  relationships: Rel[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [edgeType, setEdgeType] = useState<RelationshipType>("manages");
  const [msg, setMsg] = useState<string | null>(null);

  const initialNodes: Node[] = useMemo(() => {
    const divs = Array.from(new Set(employees.map((e) => e.division ?? "—")));
    const rowByDiv: Record<string, number> = {};
    return employees.map((e) => {
      const d = e.division ?? "—";
      const col = divs.indexOf(d);
      const row = (rowByDiv[d] = (rowByDiv[d] ?? 0) + 1) - 1;
      return {
        id: e.id,
        position: { x: col * 250, y: row * 70 },
        data: { label: `${e.last_name}, ${e.first_name}${e.role !== "ic" ? ` · ${e.role}` : ""}` },
        style: {
          fontSize: 11,
          width: 200,
          padding: 4,
          borderRadius: 8,
          background: "white",
          border:
            e.role === "ceo"
              ? "2px solid #b91c1c"
              : e.role === "manager"
                ? "2px solid #2563eb"
                : "1px solid #d1d5db",
        },
      } satisfies Node;
    });
  }, [employees]);

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(relationships.map(relToEdge));

  const onConnect = useCallback(
    async (c: Connection) => {
      if (!c.source || !c.target || c.source === c.target) return;
      setMsg(null);
      const { data, error } = await supabase
        .from("cycle_relationships")
        .insert({
          cycle_id: cycleId,
          from_employee_id: c.source,
          to_employee_id: c.target,
          relationship_type: edgeType,
        })
        .select("id")
        .single();
      if (error) {
        setMsg(error.message);
        return;
      }
      setEdges((eds) =>
        addEdge(
          relToEdge({
            id: (data as { id: string }).id,
            from_employee_id: c.source!,
            to_employee_id: c.target!,
            relationship_type: edgeType,
          }),
          eds,
        ),
      );
    },
    [supabase, cycleId, edgeType, setEdges],
  );

  const onEdgesDelete = useCallback(
    async (deleted: Edge[]) => {
      for (const e of deleted) {
        const { error } = await supabase.from("cycle_relationships").delete().eq("id", e.id);
        if (error) setMsg(error.message);
      }
    },
    [supabase],
  );

  return (
    <div className="flex h-screen flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 bg-white px-4 py-2 text-sm">
        <a href="/admin" className="text-gray-500 hover:text-gray-900">← Admin</a>
        <span className="font-medium">Feedback graph</span>
        <span className="text-xs text-gray-400">
          drag from a node’s handle to another to connect · select an edge + Backspace to remove
        </span>
        <div className="ml-auto flex items-center gap-1">
          <span className="text-xs text-gray-500">New edge:</span>
          <button
            type="button"
            onClick={() => setEdgeType("manages")}
            className={`rounded px-2 py-1 text-xs ${edgeType === "manages" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"}`}
          >
            manages
          </button>
          <button
            type="button"
            onClick={() => setEdgeType("peer")}
            className={`rounded px-2 py-1 text-xs ${edgeType === "peer" ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-700"}`}
          >
            peer
          </button>
        </div>
      </div>
      {msg && <div className="bg-red-50 px-4 py-1 text-xs text-red-700">{msg}</div>}
      <div className="min-h-0 flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgesDelete={onEdgesDelete}
          fitView
          minZoom={0.1}
        >
          <Background />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>
    </div>
  );
}
