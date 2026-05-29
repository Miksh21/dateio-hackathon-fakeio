"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  ConnectionMode,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  MarkerType,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { createClient } from "@/lib/supabase/client";
import type { RelationshipType } from "@/lib/types";

type Emp = {
  id: string;
  first_name: string;
  last_name: string;
  division: string | null;
  role: string;
};
type Rel = {
  id: string;
  from_employee_id: string;
  to_employee_id: string;
  relationship_type: RelationshipType;
};
type Props = { cycleId: string; employees: Emp[]; relationships: Rel[] };

// Custom node: 4 handles. Top/bottom carry the vertical "manages" edges; left/right
// carry the horizontal "peer" edges so peers connect mid-to-mid in a straight line.
function PersonNode({ data, selected }: NodeProps) {
  const label = (data as { label?: string }).label ?? "";
  const role = (data as { role?: string }).role ?? "ic";
  const border =
    role === "ceo"
      ? "2px solid #b91c1c"
      : role === "manager"
        ? "2px solid #2563eb"
        : "1px solid #d1d5db";
  return (
    <div
      style={{
        fontSize: 11,
        width: 200,
        padding: "6px 8px",
        borderRadius: 8,
        background: "white",
        border,
        boxShadow: selected ? "0 0 0 3px rgba(37,99,235,0.45)" : undefined,
      }}
    >
      <Handle type="target" id="t" position={Position.Top} style={{ background: "#2563eb" }} />
      <Handle type="source" id="b" position={Position.Bottom} style={{ background: "#2563eb" }} />
      <Handle type="target" id="l" position={Position.Left} style={{ background: "#6b7280" }} />
      <Handle type="source" id="r" position={Position.Right} style={{ background: "#6b7280" }} />
      {label}
    </div>
  );
}

const nodeTypes = { person: PersonNode };

function relToEdge(r: Rel): Edge {
  const peer = r.relationship_type === "peer";
  return {
    id: r.id,
    source: r.from_employee_id,
    target: r.to_employee_id,
    // manages: bottom -> top (vertical); peer: right -> left (horizontal, mid-to-mid)
    sourceHandle: peer ? "r" : "b",
    targetHandle: peer ? "l" : "t",
    type: peer ? "straight" : "smoothstep",
    animated: !peer,
    style: peer ? { stroke: "#6b7280", strokeDasharray: "6 4" } : { stroke: "#2563eb" },
    markerEnd: peer ? undefined : { type: MarkerType.ArrowClosed, color: "#2563eb" },
    label: r.relationship_type,
    labelStyle: { fontSize: 9, fill: "#6b7280" },
  };
}

function Flow({ cycleId, employees, relationships }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const { setCenter } = useReactFlow();
  const [edgeType, setEdgeType] = useState<RelationshipType>("manages");
  const [msg, setMsg] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const initialNodes: Node[] = useMemo(() => {
    const divs = Array.from(new Set(employees.map((e) => e.division ?? "—")));
    const rowByDiv: Record<string, number> = {};
    return employees.map((e) => {
      const d = e.division ?? "—";
      const col = divs.indexOf(d);
      const row = (rowByDiv[d] = (rowByDiv[d] ?? 0) + 1) - 1;
      return {
        id: e.id,
        type: "person",
        position: { x: col * 280, y: row * 84 },
        data: {
          label: `${e.last_name}, ${e.first_name}${e.role !== "ic" ? ` · ${e.role}` : ""}`,
          role: e.role,
        },
      } satisfies Node;
    });
  }, [employees]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
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

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return employees
      .filter((e) =>
        `${e.first_name} ${e.last_name} ${e.division ?? ""}`.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [query, employees]);

  const focusPerson = useCallback(
    (id: string) => {
      const n = nodes.find((x) => x.id === id);
      if (!n) return;
      setCenter(n.position.x + 100, n.position.y + 18, { zoom: 1.4, duration: 600 });
      setNodes((nds) => nds.map((x) => ({ ...x, selected: x.id === id })));
      setQuery("");
    },
    [nodes, setCenter, setNodes],
  );

  return (
    <div className="flex h-screen flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 bg-white px-4 py-2 text-sm">
        <a href="/admin" className="text-gray-500 hover:text-gray-900">
          ← Admin
        </a>
        <span className="font-medium">Feedback graph</span>

        <div className="relative">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people…"
            className="w-52 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none"
          />
          {matches.length > 0 && (
            <ul className="absolute z-20 mt-1 max-h-72 w-64 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
              {matches.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => focusPerson(e.id)}
                    className="block w-full px-3 py-1.5 text-left text-xs hover:bg-gray-100"
                  >
                    <span className="text-gray-900">
                      {e.last_name}, {e.first_name}
                    </span>
                    <span className="text-gray-400">
                      {" · "}
                      {e.division ?? "—"}
                      {e.role !== "ic" ? ` · ${e.role}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <span className="hidden text-xs text-gray-400 lg:inline">
          peers connect side-to-side · manages connects top→bottom · select an edge + Backspace to remove
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
          nodeTypes={nodeTypes}
          connectionMode={ConnectionMode.Loose}
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

export default function GraphEditor(props: Props) {
  return (
    <ReactFlowProvider>
      <Flow {...props} />
    </ReactFlowProvider>
  );
}
