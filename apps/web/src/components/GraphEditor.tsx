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
  is_super_admin: boolean;
};
type Origin = "original" | "updated";
type Rel = {
  id: string;
  from_employee_id: string;
  to_employee_id: string;
  relationship_type: RelationshipType;
  origin?: Origin;
};
type Props = { cycleId: string; employees: Emp[]; relationships: Rel[] };

const NODE_W = 200;
const COL_W = 250; // gap between hierarchy levels (left → right)
const ROW_H = 46; // gap between stacked siblings / leaves (top → bottom)

// Tidy top-down layout from the "manages" edges only: managers above their reports,
// parents centered over children, siblings (incl. peers) side-by-side — never stacked.
// People with no manager and no reports drop into a grid below the tree(s).
function computeLayout(emps: Emp[], manages: { from: string; to: string }[]): Map<string, { x: number; y: number }> {
  const ids = new Set(emps.map((e) => e.id));
  const childrenOf = new Map<string, string[]>();
  const parentOf = new Map<string, string>();
  for (const m of manages) {
    if (!ids.has(m.from) || !ids.has(m.to)) continue;
    (childrenOf.get(m.from) ?? childrenOf.set(m.from, []).get(m.from)!).push(m.to);
    parentOf.set(m.to, m.from);
  }
  const pos = new Map<string, { x: number; y: number }>();
  const visited = new Set<string>();
  let leaf = 0;
  // Left-to-right tree: depth -> x (a handful of columns), siblings stacked on y.
  // Keeps the chart narrow + tall instead of thousands of px wide.
  const place = (id: string, depth: number): number => {
    visited.add(id);
    const kids = (childrenOf.get(id) ?? []).filter((k) => ids.has(k) && !visited.has(k));
    let y: number;
    if (kids.length === 0) {
      y = leaf * ROW_H;
      leaf++;
    } else {
      const ys = kids.map((k) => place(k, depth + 1));
      y = (ys[0] + ys[ys.length - 1]) / 2;
    }
    pos.set(id, { x: depth * COL_W, y });
    return y;
  };
  // tree roots: a manager/CEO with no manager of their own
  emps
    .filter((e) => !parentOf.has(e.id) && (childrenOf.get(e.id)?.length ?? 0) > 0)
    .forEach((e) => place(e.id, 0));
  // everyone left over (unconnected, or peer-only) → compact grid below the tree
  let maxY = 0;
  pos.forEach((p) => (maxY = Math.max(maxY, p.y)));
  const top = pos.size ? maxY + ROW_H * 2 : 0;
  const perRow = Math.max(6, Math.ceil(Math.sqrt(emps.length)));
  let i = 0;
  for (const e of emps) {
    if (pos.has(e.id)) continue;
    pos.set(e.id, { x: (i % perRow) * (NODE_W + 24), y: top + Math.floor(i / perRow) * ROW_H });
    i++;
  }
  return pos;
}

// Custom node: 4 handles. Top/bottom carry vertical "manages" edges; left/right carry
// horizontal "peer" edges so peers connect mid-to-mid. Admins get a yellow border.
function PersonNode({ data, selected }: NodeProps) {
  const d = data as { label?: string; role?: string; admin?: boolean };
  const role = d.role ?? "ic";
  const border = d.admin
    ? "2px solid #f3d152"
    : role === "ceo"
      ? "2px solid #3e4955"
      : role === "manager"
        ? "2px solid #3f7178"
        : "1px solid #cbd5d5";
  return (
    <div
      style={{
        fontSize: 11,
        width: NODE_W,
        padding: "6px 8px",
        borderRadius: 8,
        background: d.admin ? "#fdf8e3" : "white",
        border,
        boxShadow: selected ? "0 0 0 3px rgba(63,113,120,0.40)" : undefined,
      }}
    >
      <Handle type="target" id="t" position={Position.Top} style={{ background: "#2563eb" }} />
      <Handle type="source" id="b" position={Position.Bottom} style={{ background: "#2563eb" }} />
      <Handle type="target" id="l" position={Position.Left} style={{ background: "#6b7280" }} />
      <Handle type="source" id="r" position={Position.Right} style={{ background: "#6b7280" }} />
      {d.label}
    </div>
  );
}

const nodeTypes = { person: PersonNode };

function relToEdge(r: Rel): Edge {
  const peer = r.relationship_type === "peer";
  const updated = (r.origin ?? "updated") === "updated";
  const color = updated ? "#3f7178" : "#94a3b8"; // aqua = your edit, slate = original line
  return {
    id: r.id,
    source: r.from_employee_id,
    target: r.to_employee_id,
    // manages flows left → right (manager's right → report's left); peers link vertically
    sourceHandle: peer ? "b" : "r",
    targetHandle: peer ? "t" : "l",
    type: peer ? "straight" : "smoothstep",
    animated: !peer,
    data: { rel: r.relationship_type, origin: r.origin ?? "updated" },
    style: peer
      ? { stroke: color, strokeDasharray: "6 4" }
      : { stroke: color, strokeWidth: updated ? 2 : 1 },
    markerEnd: peer ? undefined : { type: MarkerType.ArrowClosed, color },
    label: r.relationship_type,
    labelStyle: { fontSize: 9, fill: "#6b7280" },
  };
}

const edgeRel = (e: Edge): string | undefined => (e.data as { rel?: string } | undefined)?.rel;

// Autocomplete person picker used by the relationship builder.
function PersonPicker({
  employees,
  onPick,
  placeholder,
  excludeId,
}: {
  employees: Emp[];
  onPick: (id: string | null) => void;
  placeholder: string;
  excludeId?: string | null;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    return employees
      .filter((e) => e.id !== excludeId)
      .filter((e) => !s || `${e.first_name} ${e.last_name} ${e.division ?? ""}`.toLowerCase().includes(s))
      .slice(0, 8);
  }, [q, employees, excludeId]);
  return (
    <div className="relative">
      <input
        value={q}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setQ(e.target.value);
          onPick(null);
          setOpen(true);
        }}
        className="w-44 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none"
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-64 w-56 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {matches.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onMouseDown={() => {
                  setQ(`${e.last_name}, ${e.first_name}`);
                  onPick(e.id);
                  setOpen(false);
                }}
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
  );
}

function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-semibold text-gray-900">How to build the feedback graph</h2>
        <p className="mb-4 text-sm text-gray-500">Define who gives feedback to whom for this cycle.</p>
        <ol className="space-y-3 text-sm text-gray-700">
          <li>
            <span className="font-medium">Use the builder (easiest).</span> Pick a person, choose{" "}
            <span className="rounded bg-blue-100 px-1 text-blue-700">manages</span> or{" "}
            <span className="rounded bg-gray-200 px-1">is a peer with</span>, pick the second person, then{" "}
            <span className="font-medium">Add</span>.
            <div className="mt-1 text-xs text-gray-500">
              e.g. “Nováková, Anna <em>manages</em> Svoboda, Petr” · “Dvořák, Eva <em>is a peer with</em> Jan, Mikeš”.
            </div>
          </li>
          <li>
            <span className="font-medium">Or draw on the canvas.</span> Drag from one node to another — it uses the
            relationship currently selected in the builder.
          </li>
          <li>
            <span className="font-medium">manages</span> = arrow from manager → report (left to right).{" "}
            <span className="font-medium">peer</span> = dashed link (one per pair).{" "}
            <span className="font-medium text-slate-500">Grey</span> = an{" "}
            <span className="font-medium">original</span> reporting line;{" "}
            <span className="font-medium text-aqua">aqua</span> = an{" "}
            <span className="font-medium">edit you made</span> (updated).
          </li>
          <li>
            <span className="font-medium">Peers are automatic.</span> Everyone reporting to the same{" "}
            <em>original</em> manager reviews each other — you don’t draw those lines. Feedback is mixed:{" "}
            <span className="font-medium">upward/downward follow your edits</span>, while{" "}
            <span className="font-medium">peer groups stay anchored to the original manager</span>. After editing,
            click <span className="font-medium">Open + generate</span> in Admin to apply.
          </li>
          <li>
            Click a line and press <span className="font-medium">Backspace / Delete</span> to remove it.
          </li>
          <li>
            <span className="font-medium">Find person</span> jumps to someone. <span className="font-medium">Tidy
            layout</span> re-arranges everyone into a clean hierarchy.
          </li>
        </ol>
        <div className="mt-4 space-y-2 rounded-lg bg-canvas px-3 py-2 text-xs text-ink-600">
          <div className="flex flex-wrap gap-3">
            <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded border-2 border-ink" /> CEO</span>
            <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded border-2 border-aqua" /> Manager</span>
            <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded border-2 border-sun bg-sun/10" /> Admin</span>
            <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded border border-gray-300" /> Team member</span>
          </div>
          <div className="flex flex-wrap gap-3">
            <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-5 bg-slate-400" /> original line</span>
            <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-5 bg-aqua" /> your edit (updated)</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-xl bg-aqua py-2 text-sm font-medium text-white hover:bg-aqua-700"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

function Flow({ cycleId, employees, relationships }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const { setCenter, fitView } = useReactFlow();
  const [edgeType, setEdgeType] = useState<RelationshipType>("manages");
  const [msg, setMsg] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [aId, setAId] = useState<string | null>(null);
  const [bId, setBId] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [showHelp, setShowHelp] = useState(relationships.length === 0);

  const initialNodes: Node[] = useMemo(() => {
    const manages = relationships
      .filter((r) => r.relationship_type === "manages")
      .map((r) => ({ from: r.from_employee_id, to: r.to_employee_id }));
    const pos = computeLayout(employees, manages);
    return employees.map((e) => ({
      id: e.id,
      type: "person",
      position: pos.get(e.id) ?? { x: 0, y: 0 },
      data: {
        label: `${e.last_name}, ${e.first_name}${e.role !== "ic" ? ` · ${e.role}` : ""}${e.is_super_admin ? " · admin" : ""}`,
        role: e.role,
        admin: e.is_super_admin,
      },
    } satisfies Node));
  }, [employees, relationships]);

  // de-dupe peers to a single link per pair when loading existing relationships
  const initialEdges: Edge[] = useMemo(() => {
    const seen = new Set<string>();
    const out: Edge[] = [];
    for (const r of relationships) {
      if (r.relationship_type === "peer") {
        const key = [r.from_employee_id, r.to_employee_id].sort().join("|");
        if (seen.has(key)) continue;
        seen.add(key);
      }
      out.push(relToEdge(r));
    }
    return out;
  }, [relationships]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const createEdge = useCallback(
    async (source: string, target: string, type: RelationshipType) => {
      if (!source || !target || source === target) return;
      setMsg(null);
      if (type === "peer") {
        const dup = edges.some(
          (e) =>
            edgeRel(e) === "peer" &&
            ((e.source === source && e.target === target) || (e.source === target && e.target === source)),
        );
        if (dup) {
          setMsg("Those two are already peers — a peer link exists once per pair.");
          return;
        }
      } else {
        const dup = edges.some((e) => edgeRel(e) === "manages" && e.source === source && e.target === target);
        if (dup) {
          setMsg('That "manages" link already exists.');
          return;
        }
      }
      const { data, error } = await supabase
        .from("cycle_relationships")
        .insert({
          cycle_id: cycleId,
          from_employee_id: source,
          to_employee_id: target,
          relationship_type: type,
          origin: "updated",
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
            from_employee_id: source,
            to_employee_id: target,
            relationship_type: type,
            origin: "updated",
          }),
          eds,
        ),
      );
    },
    [edges, supabase, cycleId, setEdges],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (c.source && c.target) void createEdge(c.source, c.target, edgeType);
    },
    [createEdge, edgeType],
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

  const addRelationship = useCallback(async () => {
    if (!aId || !bId) {
      setMsg("Pick both people.");
      return;
    }
    if (aId === bId) {
      setMsg("Pick two different people.");
      return;
    }
    await createEdge(aId, bId, edgeType);
    setAId(null);
    setBId(null);
    setResetKey((k) => k + 1);
  }, [aId, bId, edgeType, createEdge]);

  const relayout = useCallback(() => {
    const manages = edges
      .filter((e) => edgeRel(e) === "manages")
      .map((e) => ({ from: e.source, to: e.target }));
    const pos = computeLayout(employees, manages);
    setNodes((nds) => nds.map((n) => ({ ...n, position: pos.get(n.id) ?? n.position })));
    requestAnimationFrame(() => fitView({ duration: 600 }));
  }, [edges, employees, setNodes, fitView]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return employees
      .filter((e) => `${e.first_name} ${e.last_name} ${e.division ?? ""}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, employees]);

  const focusPerson = useCallback(
    (id: string) => {
      const n = nodes.find((x) => x.id === id);
      if (!n) return;
      setCenter(n.position.x + NODE_W / 2, n.position.y + 18, { zoom: 1.4, duration: 600 });
      setNodes((nds) => nds.map((x) => ({ ...x, selected: x.id === id })));
      setQuery("");
    },
    [nodes, setCenter, setNodes],
  );

  return (
    <div className="flex h-screen flex-col">
      {/* Row 1: nav, find, help, tidy, legend */}
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 bg-white px-4 py-2 text-sm">
        <a href="/admin" className="text-gray-500 hover:text-gray-900">
          ← Admin
        </a>
        <span className="font-medium">Feedback graph</span>

        <div className="relative">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find person…"
            className="w-44 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none"
          />
          {matches.length > 0 && (
            <ul className="absolute z-30 mt-1 max-h-72 w-64 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
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

        <button
          type="button"
          onClick={() => setShowHelp(true)}
          className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
        >
          ? How to use
        </button>
        <button
          type="button"
          onClick={relayout}
          className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
        >
          Tidy layout
        </button>

        <div className="ml-auto hidden flex-wrap items-center gap-3 text-xs text-ink-600 lg:flex">
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded border-2 border-ink" /> CEO</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded border-2 border-aqua" /> Manager</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded border-2 border-sun bg-sun/10" /> Admin</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded border border-gray-300" /> Team</span>
          <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-slate-400" /> original</span>
          <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-aqua" /> edit</span>
        </div>
      </div>

      {/* Row 2: sentence-style relationship builder */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2 text-sm">
        <span className="text-xs font-medium text-gray-500">Add relationship:</span>
        <PersonPicker key={`a${resetKey}`} employees={employees} onPick={setAId} placeholder="Search person…" excludeId={bId} />
        <div className="flex overflow-hidden rounded-md border border-gray-300">
          <button
            type="button"
            onClick={() => setEdgeType("manages")}
            className={`px-2 py-1 text-xs ${edgeType === "manages" ? "bg-aqua text-white" : "bg-white text-ink-600 hover:bg-black/[0.04]"}`}
          >
            manages
          </button>
          <button
            type="button"
            onClick={() => setEdgeType("peer")}
            className={`px-2 py-1 text-xs ${edgeType === "peer" ? "bg-ink text-white" : "bg-white text-ink-600 hover:bg-black/[0.04]"}`}
          >
            is a peer with
          </button>
        </div>
        <PersonPicker key={`b${resetKey}`} employees={employees} onPick={setBId} placeholder="Search person…" excludeId={aId} />
        <button
          type="button"
          onClick={addRelationship}
          className="rounded-lg bg-aqua px-3 py-1.5 text-xs font-medium text-white hover:bg-aqua-700"
        >
          Add
        </button>
        <span className="text-xs text-gray-400">Letters = people. The selected verb applies to canvas drags too.</span>
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

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
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
