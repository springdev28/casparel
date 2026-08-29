/**
 * @fileOverview Web screen role: renders the Canvas Page route and coordinates its page-level data and interactions.
 * System connection: mounted from App.tsx; composes generated API hooks, local helpers, and reusable UI components.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation, useParams, useSearch } from "wouter";
import {
  BaseEdge,
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  addEdge,
  getSmoothStepPath,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useDocumentVisibility } from "../lib/use-document-visibility";
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  FileText,
  Heading,
  Link2,
  Loader2,
  Minus,
  MoreHorizontal,
  Plus,
  Save,
  Send,
  Share2,
  StickyNote,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  useListResources,
  useSearchUsers,
  type Resource,
} from "@workspace/api-client-react";
import { Button } from "@workspace/edu-ds/components/ui/button";
import { Badge } from "@workspace/edu-ds/components/ui/badge";
import { Input } from "@workspace/edu-ds/components/ui/input";
import { Label } from "@workspace/edu-ds/components/ui/label";
import { Textarea } from "@workspace/edu-ds/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/edu-ds/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/edu-ds/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/edu-ds/components/ui/select";
import { toast } from "@workspace/edu-ds/hooks/use-toast";
import { LoadFailure } from "@/components/LoadFailure";
import {
  canvasRequest,
  type CanvasCollaborator,
  type CanvasDocument,
  type SchoolarCanvas,
  type StudyNodeData,
} from "../lib/canvas-api";

type StudyFlowNode = Node<StudyNodeData, "study">;
type EdgeDirection = "one-way" | "two-way" | "line";
type HandleSide = "top" | "right" | "bottom" | "left";
type StudyFlowEdge = Edge<{ direction: EdgeDirection }, "study">;

type NodeActions = {
  editable: boolean;
  update: (id: string, changes: Partial<StudyNodeData>) => void;
  remove: (id: string) => void;
};

const NodeActionsContext = createContext<NodeActions>({
  editable: false,
  update: () => undefined,
  remove: () => undefined,
});

type EdgeActions = {
  editable: boolean;
  updateDirection: (id: string, direction: EdgeDirection) => void;
  remove: (id: string) => void;
};

const EdgeActionsContext = createContext<EdgeActions>({
  editable: false,
  updateDirection: () => undefined,
  remove: () => undefined,
});

const NODE_COLORS = [
  { value: "cyan", className: "border-cyan-300 bg-cyan-50 text-slate-950" },
  { value: "yellow", className: "border-amber-300 bg-amber-50 text-slate-950" },
  { value: "green", className: "border-emerald-300 bg-emerald-50 text-slate-950" },
  { value: "rose", className: "border-rose-300 bg-rose-50 text-slate-950" },
  { value: "white", className: "border-slate-300 bg-white text-slate-950" },
] as const;

function StudyNodeCard({ id, data, selected }: NodeProps<StudyFlowNode>) {
  const actions = useContext(NodeActionsContext);
  const color = NODE_COLORS.find((item) => item.value === data.color) ?? NODE_COLORS[0];
  const Icon = data.kind === "heading" ? Heading : data.kind === "link" ? Link2 : data.kind === "resource" ? BookOpen : StickyNote;
  const isHeading = data.kind === "heading";

  return (
    <article
      className={`group relative w-[260px] border shadow-sm ${color.className} ${selected ? "ring-2 ring-primary" : ""}`}
      style={{ borderRadius: 8 }}
    >
      {([
        ["top", Position.Top],
        ["right", Position.Right],
        ["bottom", Position.Bottom],
        ["left", Position.Left],
      ] as const).map(([side, position]) => (
        <Handle
          key={side}
          id={side}
          type="source"
          position={position}
          isConnectable={actions.editable}
          isConnectableStart={actions.editable}
          isConnectableEnd={actions.editable}
          className="!size-3 !border-2 !border-slate-50 !bg-primary transition-transform hover:!scale-125"
        />
      ))}
      {actions.editable ? (
        <button
          type="button"
          className={`nodrag absolute -right-2 -top-2 z-10 flex size-5 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 shadow-sm transition-opacity hover:bg-red-50 hover:text-red-600 ${selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
          aria-label="Delete card"
          title="Delete card"
          onClick={(event) => {
            event.stopPropagation();
            actions.remove(id);
          }}
        >
          <X className="size-3" />
        </button>
      ) : null}
      <header className="flex items-start gap-3 border-b border-black/10 px-4 py-3">
        <Icon className="mt-0.5 size-4 shrink-0" />
        {actions.editable ? (
          <Input
            className={`nodrag h-auto min-w-0 border-0 !bg-transparent px-1 py-0 !text-slate-950 shadow-none focus-visible:ring-0 ${isHeading ? "!text-xl font-bold leading-tight" : "text-sm font-semibold"}`}
            value={data.title}
            maxLength={240}
            aria-label="Card title"
            onChange={(event) => actions.update(id, { title: event.target.value })}
          />
        ) : (
          <h3 translate="no" className={`${isHeading ? "text-xl leading-tight" : "text-sm"} min-w-0 flex-1 break-words font-bold`}>{data.title}</h3>
        )}
        {actions.editable ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="nodrag shrink-0 p-0.5 opacity-70 hover:opacity-100" aria-label="Card options"><MoreHorizontal className="size-4" /></button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {NODE_COLORS.map((item) => <DropdownMenuItem key={item.value} onClick={() => actions.update(id, { color: item.value })}><span className={`mr-2 size-3 border ${item.className}`} />{item.value}</DropdownMenuItem>)}
              <DropdownMenuItem className="text-destructive-text" onClick={() => actions.remove(id)}><Trash2 className="mr-2 size-4" />Delete card</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </header>
      <div className="p-4">
        {data.kind === "link" ? (
          actions.editable ? <Input className="nodrag h-8 bg-white/70 text-xs" value={data.url ?? ""} placeholder="https://..." aria-label="Card link" onChange={(event) => actions.update(id, { url: event.target.value })} /> : data.url ? <a translate="no" className="nodrag flex items-center gap-1 break-all text-xs underline" href={data.url} target="_blank" rel="noreferrer">{data.url}<ExternalLink className="size-3 shrink-0" /></a> : null
        ) : data.kind === "resource" ? (
          <div className="space-y-2">
            <p className="line-clamp-3 text-xs leading-relaxed">{data.text ? <span translate="no">{data.text}</span> : "Casparel library resource"}</p>
            {data.resourceId ? <a className="nodrag inline-flex items-center gap-1 text-xs font-semibold underline" href={`${import.meta.env.BASE_URL}resources/${data.resourceId}`}>Open resource <ExternalLink className="size-3" /></a> : null}
          </div>
        ) : actions.editable ? (
          <Textarea className={`nodrag min-h-24 resize-none border-0 !bg-transparent px-1 py-1 text-sm !text-slate-950 shadow-none placeholder:!text-slate-500 focus-visible:ring-0 ${isHeading ? "min-h-12 font-medium" : ""}`} value={data.text ?? ""} placeholder={isHeading ? "Add context..." : "Write a note..."} aria-label={isHeading ? "Card context" : "Card note"} maxLength={10_000} onChange={(event) => actions.update(id, { text: event.target.value })} />
        ) : data.text ? <p translate="no" className="whitespace-pre-wrap break-words text-sm leading-relaxed">{data.text}</p> : null}
      </div>
    </article>
  );
}

const nodeTypes = { study: StudyNodeCard };

function StudyEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerStart,
  markerEnd,
  selected,
  style,
  data,
}: EdgeProps<StudyFlowEdge>) {
  const actions = useContext(EdgeActionsContext);
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 12,
  });
  const direction = data?.direction ?? "one-way";

  return (
    <>
      <BaseEdge
        path={path}
        markerStart={markerStart}
        markerEnd={markerEnd}
        interactionWidth={24}
        style={{ strokeWidth: selected ? 3 : 2, ...style }}
      />
      {selected && actions.editable ? (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan flex items-center gap-0.5 border border-white/20 bg-slate-950 p-1 text-white shadow-xl"
            style={{
              borderRadius: 8,
              pointerEvents: "all",
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {([
              ["one-way", ArrowRight, "One-way arrow"],
              ["two-way", ArrowLeftRight, "Two-way arrow"],
              ["line", Minus, "Line without arrows"],
            ] as const).map(([value, Icon, label]) => (
              <button
                key={value}
                type="button"
                className={`flex size-7 items-center justify-center rounded-md hover:bg-white/15 ${direction === value ? "bg-white/20" : ""}`}
                aria-label={label}
                title={label}
                onClick={() => actions.updateDirection(id, value)}
              >
                <Icon className="size-3.5" />
              </button>
            ))}
            <span className="mx-0.5 h-5 w-px bg-white/20" />
            <button
              type="button"
              className="flex size-7 items-center justify-center rounded-md text-red-300 hover:bg-red-500/15 hover:text-red-200"
              aria-label="Delete connection"
              title="Delete connection"
              onClick={() => actions.remove(id)}
            >
              <X className="size-3.5" />
            </button>
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

const edgeTypes = { study: StudyEdge };

function edgeMarkers(direction: EdgeDirection) {
  const arrow = { type: MarkerType.ArrowClosed } as const;
  return {
    markerStart: direction === "two-way" ? arrow : undefined,
    markerEnd: direction === "line" ? undefined : arrow,
  };
}

function routeEdge(edge: StudyFlowEdge, nodes: StudyFlowNode[]): StudyFlowEdge {
  const source = nodes.find((node) => node.id === edge.source);
  const target = nodes.find((node) => node.id === edge.target);
  if (!source || !target) return edge;
  const sourceWidth = source.measured?.width ?? source.width ?? 260;
  const sourceHeight = source.measured?.height ?? source.height ?? 160;
  const targetWidth = target.measured?.width ?? target.width ?? 260;
  const targetHeight = target.measured?.height ?? target.height ?? 160;
  const sourceCenter = {
    x: source.position.x + sourceWidth / 2,
    y: source.position.y + sourceHeight / 2,
  };
  const targetCenter = {
    x: target.position.x + targetWidth / 2,
    y: target.position.y + targetHeight / 2,
  };
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;
  let sourceHandle: HandleSide;
  let targetHandle: HandleSide;
  if (Math.abs(dx) >= Math.abs(dy)) {
    sourceHandle = dx >= 0 ? "right" : "left";
    targetHandle = dx >= 0 ? "left" : "right";
  } else {
    sourceHandle = dy >= 0 ? "bottom" : "top";
    targetHandle = dy >= 0 ? "top" : "bottom";
  }
  if (edge.sourceHandle === sourceHandle && edge.targetHandle === targetHandle) return edge;
  return { ...edge, sourceHandle, targetHandle };
}

function flowEdges(document: CanvasDocument): StudyFlowEdge[] {
  const titleOf = new Map(document.nodes.map((node) => [node.id, node.data.title]));
  return document.edges.map((edge) => {
    const direction = edge.direction ?? "one-way";
    return {
      ...edge,
      type: "study",
      data: { direction },
      /*
       * What a screen reader says about a connector.
       *
       * React Flow's default is "Edge from n1 to n2" -- two internal ids, in
       * English whatever language the reader chose, and the only thing said
       * about the line at all. A connector means "this card leads to that
       * one", so the cards' own titles are what belongs here. The shape is a
       * SHAPE_RULE in ui-translations, because the titles in the middle are
       * somebody's own words and no dictionary key could ever match.
       */
      ariaLabel: `Connection from "${titleOf.get(edge.source) ?? edge.source}" to "${
        titleOf.get(edge.target) ?? edge.target
      }"`,
      ...edgeMarkers(direction),
    };
  });
}

function cleanDocument(nodes: StudyFlowNode[], edges: StudyFlowEdge[], viewport: Viewport): CanvasDocument {
  return {
    nodes: nodes.map(({ id, position, data }) => ({ id, type: "study", position, data })),
    edges: edges.map(({ id, source, target, sourceHandle, targetHandle, label, data }) => ({
      id,
      source,
      target,
      ...(sourceHandle ? { sourceHandle: sourceHandle as HandleSide } : {}),
      ...(targetHandle ? { targetHandle: targetHandle as HandleSide } : {}),
      direction: data?.direction ?? "one-way",
      ...(typeof label === "string" ? { label } : {}),
    })),
    viewport,
  };
}

function flowNodes(document: CanvasDocument): StudyFlowNode[] {
  return document.nodes.map((node) => ({ ...node, type: "study" }));
}

function saveLabel(status: "saved" | "saving" | "unsaved" | "conflict") {
  if (status === "saving") return "Saving";
  if (status === "unsaved") return "Unsaved";
  if (status === "conflict") return "Updated by collaborator";
  return "Saved";
}

export default function CanvasPage({ shared = false }: { shared?: boolean }) {
  const documentVisible = useDocumentVisibility();
  const params = useParams<{ id?: string; token?: string }>();
  const routeSearch = useSearch();
  const [, setLocation] = useLocation();
  const [canvas, setCanvas] = useState<SchoolarCanvas | null>(null);
  const [loading, setLoading] = useState(true);
  /*
   * Why the board could not be loaded, as the error rather than as its
   * message.
   *
   * The page printed `error.message` under a heading of its own -- so a
   * reader whose network had dropped got "Canvas unavailable" over "Failed to
   * fetch", which is a developer's sentence, and a button back to the list
   * rather than a way to try again. The rest of the app tells offline apart
   * from broken and offers a retry; this now says the same things.
   */
  const [loadError, setLoadError] = useState<unknown>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<StudyFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<StudyFlowEdge>([]);
  const [viewport, setViewportState] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [flow, setFlow] = useState<ReactFlowInstance<StudyFlowNode, StudyFlowEdge> | null>(null);
  const [status, setStatus] = useState<"saved" | "saving" | "unsaved" | "conflict">("saved");
  const [resourceOpen, setResourceOpen] = useState(false);
  const [resourceQuery, setResourceQuery] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [publishing, setPublishing] = useState<"catalog" | "forum" | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [collaborators, setCollaborators] = useState<CanvasCollaborator[]>([]);
  const [personQuery, setPersonQuery] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const versionRef = useRef(1);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const viewportRef = useRef(viewport);
  const lastSavedRef = useRef("");
  const savingRef = useRef(false);
  const queuedSaveRef = useRef(false);
  const newerCanvasToastShownRef = useRef(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canEdit = canvas?.permissions.canEdit === true && !shared;
  const canManage = canvas?.permissions.canManage === true && !shared;
  const [copying, setCopying] = useState(false);

  /**
   * Take your own copy of a canvas you can only view.
   *
   * A shared board is loaded through the public token route, which needs no
   * session, but copying does: it writes into your account. Sending an
   * unauthenticated visitor to sign in is better than a 401 they cannot read.
   */
  async function copyToMyAccount() {
    if (!canvas) return;
    setCopying(true);
    try {
      const copy = await canvasRequest<SchoolarCanvas>(
        `/canvases/${canvas.id}/copy`,
        { method: "POST" },
      );
      toast({
        title: "Saved to your canvases",
        description: `"${copy.title}" is yours now. Editing it will not change the original.`,
      });
      setLocation(`/canvas/${copy.id}`);
    } catch (error: unknown) {
      toast({
        title: "Could not save a copy",
        description:
          error instanceof Error
            ? error.message
            : "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setCopying(false);
    }
  }
  const pageHeight = shared ? "h-[calc(100dvh-3.5625rem)]" : "h-[calc(100dvh-3rem)]";

  nodesRef.current = nodes;
  edgesRef.current = edges;
  viewportRef.current = viewport;

  const { data: resources, isFetching: resourcesLoading } = useListResources(
    { q: resourceQuery || undefined, limit: 50, sortBy: "newest" },
    { query: { enabled: resourceOpen, queryKey: ["canvas-resources", resourceQuery] } },
  );
  const { data: people, isFetching: peopleLoading } = useSearchUsers(
    { q: personQuery, scope: "all", limit: 12 },
    { query: { enabled: shareOpen && personQuery.trim().length >= 2, queryKey: ["canvas-people", personQuery] } },
  );

  const applyCanvas = useCallback((next: SchoolarCanvas) => {
    setCanvas(next);
    setNewTitle(next.title);
    setNewDescription(next.description ?? "");
    versionRef.current = next.version;
    const nextNodes = flowNodes(next.document);
    const nextEdges = flowEdges(next.document).map((edge) => routeEdge(edge, nextNodes));
    const nextViewport = next.document.viewport ?? { x: 0, y: 0, zoom: 1 };
    setNodes(nextNodes);
    setEdges(nextEdges);
    setViewportState(nextViewport);
    lastSavedRef.current = JSON.stringify(cleanDocument(nextNodes, nextEdges, nextViewport));
    setStatus("saved");
  }, [setEdges, setNodes]);

  useEffect(() => {
    if (!flow || !canvas) return;
    const frame = requestAnimationFrame(() => {
      if (window.innerWidth < 640) {
        void flow.fitView({ padding: 0.15, duration: 0 });
      } else if (canvas.document.viewport) {
        void flow.setViewport(canvas.document.viewport);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [canvas?.id, flow]);

  const loadCanvas = useCallback(async () => {
    try {
      const path = shared ? `/canvases/shared/${params.token}` : `/canvases/${params.id}`;
      const next = await canvasRequest<SchoolarCanvas>(path, {}, !shared);
      applyCanvas(next);
      setLoadError(null);
    } catch (error) {
      setLoadError(error ?? new Error("Canvas could not be loaded"));
    } finally {
      setLoading(false);
    }
  }, [applyCanvas, params.id, params.token, shared]);

  useEffect(() => { void loadCanvas(); }, [loadCanvas]);

  const saveNow = useCallback(async () => {
    if (!canEdit || !canvas) return;
    const document = cleanDocument(nodesRef.current, edgesRef.current, viewportRef.current);
    const serialized = JSON.stringify(document);
    if (serialized === lastSavedRef.current) {
      setStatus("saved");
      return;
    }
    if (savingRef.current) {
      queuedSaveRef.current = true;
      return;
    }
    savingRef.current = true;
    setStatus("saving");
    try {
      const updated = await canvasRequest<SchoolarCanvas>(`/canvases/${canvas.id}`, {
        method: "PATCH",
        body: JSON.stringify({ document, expectedVersion: versionRef.current }),
      });
      versionRef.current = updated.version;
      lastSavedRef.current = serialized;
      setCanvas(updated);
      setStatus(JSON.stringify(cleanDocument(nodesRef.current, edgesRef.current, viewportRef.current)) === serialized ? "saved" : "unsaved");
    } catch (error) {
      const current = (error as Error & { current?: SchoolarCanvas }).current;
      if (current) {
        applyCanvas(current);
        setStatus("conflict");
        if (!newerCanvasToastShownRef.current) {
          newerCanvasToastShownRef.current = true;
          toast({ title: "A newer canvas was loaded", description: "Another collaborator saved first, so their latest version replaced this unsaved view." });
        }
      } else {
        setStatus("unsaved");
        toast({ title: "Canvas was not saved", description: error instanceof Error ? error.message : "Try again", variant: "destructive" });
      }
    } finally {
      savingRef.current = false;
      if (queuedSaveRef.current) {
        queuedSaveRef.current = false;
        void saveNow();
      }
    }
  }, [applyCanvas, canEdit, canvas]);

  useEffect(() => {
    if (!canEdit || !canvas) return;
    const serialized = JSON.stringify(cleanDocument(nodes, edges, viewport));
    if (serialized === lastSavedRef.current) return;
    setStatus("unsaved");
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => void saveNow(), 850);
    return () => { if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current); };
  }, [canEdit, canvas, edges, nodes, saveNow, viewport]);

  useEffect(() => {
    if (shared || !canvas || !documentVisible) return;
    const interval = window.setInterval(() => {
      if (savingRef.current || status === "unsaved") return;
      void canvasRequest<SchoolarCanvas>(`/canvases/${canvas.id}`).then((remote) => {
        if (remote.version > versionRef.current) applyCanvas(remote);
      }).catch(() => undefined);
    }, 5_000);
    return () => window.clearInterval(interval);
  }, [applyCanvas, canvas, documentVisible, shared, status]);

  const updateNode = useCallback((id: string, changes: Partial<StudyNodeData>) => {
    setNodes((current) => current.map((node) => node.id === id ? { ...node, data: { ...node.data, ...changes } } : node));
  }, [setNodes]);
  const removeNode = useCallback((id: string) => {
    setNodes((current) => current.filter((node) => node.id !== id));
    setEdges((current) => current.filter((edge) => edge.source !== id && edge.target !== id));
  }, [setEdges, setNodes]);
  const nodeActions = useMemo(() => ({ editable: canEdit, update: updateNode, remove: removeNode }), [canEdit, removeNode, updateNode]);
  const updateEdgeDirection = useCallback((id: string, direction: EdgeDirection) => {
    setEdges((current) => current.map((edge) => edge.id === id ? {
      ...edge,
      data: { direction },
      ...edgeMarkers(direction),
    } : edge));
  }, [setEdges]);
  const removeEdge = useCallback((id: string) => {
    setEdges((current) => current.filter((edge) => edge.id !== id));
  }, [setEdges]);
  const edgeActions = useMemo(() => ({
    editable: canEdit,
    updateDirection: updateEdgeDirection,
    remove: removeEdge,
  }), [canEdit, removeEdge, updateEdgeDirection]);

  useEffect(() => {
    if (!nodes.length || !edges.length) return;
    setEdges((current) => {
      let changed = false;
      const routed = current.map((edge) => {
        const next = routeEdge(edge, nodes);
        if (next !== edge) changed = true;
        return next;
      });
      return changed ? routed : current;
    });
  }, [edges.length, nodes, setEdges]);

  function addNode(kind: StudyNodeData["kind"], resource?: Resource) {
    if (!canEdit) return;
    const offset = nodesRef.current.length * 18;
    const position = flow?.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }) ?? { x: 180, y: 160 };
    const data: StudyNodeData = resource ? {
      kind: "resource",
      title: resource.title,
      text: resource.description ?? `${resource.subject} · ${resource.gradeLevel}`,
      url: resource.url,
      resourceId: resource.id,
      color: "green",
    } : {
      kind,
      title: kind === "heading" ? "New heading" : kind === "link" ? "New link" : "New note",
      text: "",
      url: kind === "link" ? "https://" : undefined,
      color: kind === "heading" ? "yellow" : kind === "link" ? "rose" : "cyan",
    };
    setNodes((current) => [...current, { id: crypto.randomUUID(), type: "study", position: { x: position.x + offset, y: position.y + offset }, data }]);
    setResourceOpen(false);
  }

  const connect = useCallback((connection: Connection) => {
    if (!canEdit) return;
    const direction: EdgeDirection = "one-way";
    setEdges((current) => addEdge({
      ...connection,
      id: crypto.randomUUID(),
      type: "study",
      data: { direction },
      ...edgeMarkers(direction),
    }, current));
  }, [canEdit, setEdges]);

  async function patchCanvas(changes: Partial<Pick<SchoolarCanvas, "title" | "description" | "visibility" | "classAccess">>) {
    if (!canvas) return;
    await saveNow();
    const updated = await canvasRequest<SchoolarCanvas>(`/canvases/${canvas.id}`, { method: "PATCH", body: JSON.stringify(changes) });
    versionRef.current = updated.version;
    setCanvas(updated);
    setNewTitle(updated.title);
    setNewDescription(updated.description ?? "");
    toast({ title: "Canvas settings updated" });
  }

  async function publishCanvas(destination: "catalog" | "forum") {
    if (!canvas) return;
    setPublishing(destination);
    try {
      await canvasRequest(`/canvases/${canvas.id}/publish`, {
        method: "POST",
        body: JSON.stringify({ destination }),
      });
      await loadCanvas();
      toast({ title: destination === "forum" ? "Posted to forum and catalog" : "Added to catalog" });
    } catch (error) {
      toast({
        title: "Could not publish canvas",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setPublishing(null);
    }
  }

  async function openSharing() {
    setShareOpen(true);
    if (!canvas?.permissions.canView || shared) return;
    try { setCollaborators(await canvasRequest<CanvasCollaborator[]>(`/canvases/${canvas.id}/collaborators`)); } catch { setCollaborators([]); }
  }

  async function addCollaborator(userId: number) {
    if (!canvas) return;
    await canvasRequest(`/canvases/${canvas.id}/collaborators/${userId}`, { method: "PUT", body: JSON.stringify({ role: "editor" }) });
    setCollaborators(await canvasRequest<CanvasCollaborator[]>(`/canvases/${canvas.id}/collaborators`));
    setPersonQuery("");
  }

  async function changeCollaborator(userId: number, role: "viewer" | "editor") {
    if (!canvas) return;
    await canvasRequest(`/canvases/${canvas.id}/collaborators/${userId}`, { method: "PUT", body: JSON.stringify({ role }) });
    setCollaborators((current) => current.map((item) => item.userId === userId ? { ...item, role } : item));
  }

  async function removeCollaborator(userId: number) {
    if (!canvas) return;
    await canvasRequest(`/canvases/${canvas.id}/collaborators/${userId}`, { method: "DELETE" });
    setCollaborators((current) => current.filter((item) => item.userId !== userId));
  }

  async function deleteCanvas() {
    if (!canvas || !window.confirm(`Delete “${canvas.title}”? This cannot be undone.`)) return;
    await canvasRequest(`/canvases/${canvas.id}`, { method: "DELETE" });
    setLocation("/canvases");
  }

  useEffect(() => {
    if (!canvas || shared) return;
    const panel = new URLSearchParams(routeSearch).get("panel");
    if (panel === "details" && canManage) setDetailsOpen(true);
    if (panel === "share" && canManage) void openSharing();
  }, [canvas?.id, canManage, routeSearch, shared]);

  if (loading) return <div className={`flex ${pageHeight} items-center justify-center`}><Loader2 className="size-7 animate-spin text-primary-text" /></div>;
  if (!canvas || loadError) return <div className={`flex ${pageHeight} flex-col items-center justify-center gap-3 p-6 text-center`}><LoadFailure error={loadError} retrying={loading} onRetry={() => void loadCanvas()} />{!shared ? <Button variant="outline" onClick={() => setLocation("/canvases")}><ArrowLeft className="mr-2 size-4" />Back to canvases</Button> : null}</div>;

  const shareUrl = canvas.shareToken ? `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/canvas/shared/${canvas.shareToken}` : "";

  return (
    <NodeActionsContext.Provider value={nodeActions}>
      <EdgeActionsContext.Provider value={edgeActions}>
      <div className={`relative ${pageHeight} min-h-[560px] overflow-hidden bg-slate-950`}>
        <ReactFlow<StudyFlowNode, StudyFlowEdge>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={canEdit ? onNodesChange : undefined}
          onEdgesChange={canEdit ? onEdgesChange : undefined}
          onConnect={connect}
          onInit={setFlow}
          onViewportChange={setViewportState}
          nodesDraggable={canEdit}
          nodesConnectable={canEdit}
          elementsSelectable={canEdit}
          deleteKeyCode={canEdit ? ["Backspace", "Delete"] : null}
          connectionMode={ConnectionMode.Loose}
          connectionRadius={28}
          defaultEdgeOptions={{ type: "study", markerEnd: { type: MarkerType.ArrowClosed }, style: { strokeWidth: 2 } }}
          fitView={!canvas.document.viewport}
          minZoom={0.2}
          maxZoom={2.5}
          colorMode="dark"
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="#53606f" />
          <Controls position="bottom-right" showInteractive={false} />
          <MiniMap className="!hidden sm:!block" position="bottom-left" pannable zoomable nodeColor="#22d3ee" maskColor="rgba(2,6,23,.72)" />
        </ReactFlow>

        <header className="absolute inset-x-3 top-3 z-20 flex items-start justify-between gap-3 sm:inset-x-5">
          <div className="flex min-w-0 items-center gap-2 border border-white/15 bg-slate-950/90 p-2 text-white shadow-lg backdrop-blur" style={{ borderRadius: 8 }}>
            {!shared ? <Button size="icon" variant="ghost" className="shrink-0 text-white hover:bg-white/10 hover:text-white" onClick={() => setLocation("/canvases")} title="Back to canvases"><ArrowLeft className="size-4" /></Button> : null}
            {canManage ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-2 px-1 text-left">
                    <span className="min-w-0 flex-1">
                      {/* A canvas title, and the name under it, are written
                          by a person, so neither is the bridge's to rewrite.
                          The fallback used to build `${owner} canvas` as one
                          string, which protects this product's own word along
                          with the name; "Canvas by" is product wording and
                          translates, the name does not. */}
                      <span translate="no" className="block truncate text-sm font-semibold">{canvas.title}</span>
                      <span className="block truncate text-[11px] text-slate-400">{canvas.class?.name ? <span translate="no">{canvas.class.name}</span> : <>Canvas by <span translate="no">{canvas.owner?.name ?? "Casparel"}</span></>}</span>
                    </span>
                    <ChevronDown className="size-3.5 shrink-0 text-slate-400" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                  <DropdownMenuItem onClick={() => setDetailsOpen(true)}><FileText className="mr-2 size-4" />Edit canvas details</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void openSharing()}><Share2 className="mr-2 size-4" />Sharing and access</DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive-text focus:text-destructive-text" onClick={() => void deleteCanvas()}><Trash2 className="mr-2 size-4" />Delete canvas</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="min-w-0 px-1 text-left">
                <span translate="no" className="block truncate text-sm font-semibold">{canvas.title}</span>
                <span className="block truncate text-[11px] text-slate-400">{canvas.class?.name ? <span translate="no">{canvas.class.name}</span> : <>Canvas by <span translate="no">{canvas.owner?.name ?? "Casparel"}</span></>}</span>
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!shared ? <div className="hidden items-center gap-1.5 border border-white/15 bg-slate-950/90 px-3 py-2 text-xs text-slate-300 backdrop-blur sm:flex" style={{ borderRadius: 8 }}>{status === "saving" ? <Loader2 className="size-3.5 animate-spin" /> : status === "saved" ? <Check className="size-3.5 text-emerald-400" /> : <Save className="size-3.5 text-amber-400" />}{saveLabel(status)}</div> : <Badge className="bg-slate-900 text-white">View only</Badge>}
            {canManage ? <Button className="border border-white/15 bg-slate-950/90 text-white hover:bg-slate-800" variant="outline" onClick={() => void openSharing()}><Share2 className="mr-2 size-4" /><span className="hidden sm:inline">Share</span></Button> : null}
            {/* Offered exactly when you cannot edit what you are looking at:
                someone else's board, or a shared link. The copy is yours and
                detached, so building on it cannot disturb theirs. */}
            {!canEdit ? <Button className="border border-white/15 bg-slate-950/90 text-white hover:bg-slate-800" variant="outline" disabled={copying} onClick={() => void copyToMyAccount()}><Copy className="mr-2 size-4" /><span className="hidden sm:inline">{copying ? "Copying..." : "Save a copy"}</span></Button> : null}
          </div>
        </header>

        {canEdit ? (
          <div className="absolute bottom-4 left-1/2 z-20 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 gap-1 overflow-x-auto sm:max-w-[calc(100%-7rem)] border border-white/15 bg-slate-950/92 p-1.5 shadow-xl backdrop-blur" style={{ borderRadius: 8 }}>
            <Button size="sm" variant="ghost" aria-label="Note" className="shrink-0 text-white hover:bg-white/10 hover:text-white" onClick={() => addNode("note")}><StickyNote className="size-4 sm:mr-2" /><span className="hidden sm:inline">Note</span></Button>
            <Button size="sm" variant="ghost" aria-label="Heading" className="shrink-0 text-white hover:bg-white/10 hover:text-white" onClick={() => addNode("heading")}><Heading className="size-4 sm:mr-2" /><span className="hidden sm:inline">Heading</span></Button>
            <Button size="sm" variant="ghost" aria-label="Link" className="shrink-0 text-white hover:bg-white/10 hover:text-white" onClick={() => addNode("link")}><Link2 className="size-4 sm:mr-2" /><span className="hidden sm:inline">Link</span></Button>
            <Button size="sm" variant="ghost" aria-label="Resource" className="shrink-0 text-white hover:bg-white/10 hover:text-white" onClick={() => setResourceOpen(true)}><BookOpen className="size-4 sm:mr-2" /><span className="hidden sm:inline">Resource</span></Button>
          </div>
        ) : null}

        {!nodes.length ? <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6"><div className="max-w-sm text-center text-slate-300"><FileText className="mx-auto mb-3 size-9 text-cyan-300" /><h2 className="font-semibold">This canvas is ready</h2><p className="mt-1 text-sm text-slate-400">{canEdit ? "Add a note, heading, link, or library resource below. Drag from a card handle to connect ideas." : "There are no cards here yet."}</p></div></div> : null}
      </div>

      <Dialog open={resourceOpen} onOpenChange={setResourceOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Add a library resource</DialogTitle><DialogDescription>Place an existing Casparel resource directly on this canvas.</DialogDescription></DialogHeader>
          <Input value={resourceQuery} onChange={(event) => setResourceQuery(event.target.value)} placeholder="Filter library resources..." />
          <div className="max-h-[55dvh] space-y-2 overflow-y-auto pr-1">
            {resourcesLoading ? <div className="flex justify-center py-10"><Loader2 className="size-5 animate-spin" /></div> : resources?.length ? resources.map((resource) => <button key={resource.id} type="button" className="flex w-full items-start justify-between gap-4 border p-3 text-left hover:bg-muted" style={{ borderRadius: 8 }} onClick={() => addNode("resource", resource)}><span className="min-w-0"><strong className="block truncate text-sm">{resource.title}</strong><span className="block truncate text-xs text-muted-foreground">{resource.subject} · {resource.gradeLevel}</span></span><Plus className="mt-1 size-4 shrink-0" /></button>) : <p className="py-10 text-center text-sm text-muted-foreground">No matching library resources.</p>}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Canvas details</DialogTitle><DialogDescription>Update how this workspace appears to collaborators.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-2"><div className="space-y-2"><Label>Title</Label><Input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} maxLength={160} /></div><div className="space-y-2"><Label>Description</Label><Textarea value={newDescription} onChange={(event) => setNewDescription(event.target.value)} maxLength={1000} /></div></div>
          <DialogFooter className="sm:justify-between"><Button variant="destructive" onClick={() => void deleteCanvas()}><Trash2 className="mr-2 size-4" />Delete</Button><Button disabled={!newTitle.trim()} onClick={() => void patchCanvas({ title: newTitle.trim(), description: newDescription.trim() })}>Save details</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Share canvas</DialogTitle><DialogDescription>Choose who can open or edit this workspace.</DialogDescription></DialogHeader>
          <div className="max-h-[65dvh] space-y-5 overflow-x-hidden overflow-y-auto px-1 pb-1">
            {canvas.classId ? <div className="space-y-2"><Label>Class access</Label><Select value={canvas.classAccess} onValueChange={(value) => void patchCanvas({ classAccess: value as "view" | "edit" })}><SelectTrigger className="w-full focus:ring-offset-0"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="view">Students can view</SelectItem><SelectItem value="edit">Students can edit</SelectItem></SelectContent></Select><p className="text-xs text-muted-foreground">Teachers who own the class can always manage the canvas.</p></div> : <div className="space-y-2"><Label>General access</Label><Select value={canvas.visibility} onValueChange={(value) => void patchCanvas({ visibility: value as "private" | "people" | "link" })}><SelectTrigger className="w-full focus:ring-offset-0"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="private">Private</SelectItem><SelectItem value="people">Invited people</SelectItem><SelectItem value="link">Anyone with the link can view</SelectItem></SelectContent></Select></div>}
            {canvas.visibility === "link" && shareUrl ? <div className="flex gap-2"><Input readOnly value={shareUrl} /><Button size="icon" variant="outline" title="Copy sharing link" onClick={() => void navigator.clipboard.writeText(shareUrl).then(() => toast({ title: "Link copied" }))}><Copy className="size-4" /></Button></div> : null}
            <div className="grid gap-2 sm:grid-cols-2"><Button type="button" variant="outline" disabled={publishing !== null} onClick={() => void publishCanvas("catalog")}><BookOpen className="mr-2 size-4" />Add to Catalog</Button><Button type="button" disabled={publishing !== null} onClick={() => void publishCanvas("forum")}><Send className="mr-2 size-4" />Post to Forum</Button></div>
            <div className="space-y-2"><Label htmlFor="canvas-person-search">Invite people</Label><div className="relative"><UserPlus className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input id="canvas-person-search" className="w-full pl-9 focus-visible:ring-offset-0" value={personQuery} onChange={(event) => setPersonQuery(event.target.value)} placeholder="Search Casparel users..." /></div>{peopleLoading ? <Loader2 className="mx-auto size-4 animate-spin" /> : personQuery.trim().length >= 2 && people?.length ? <div className="space-y-1 border p-1" style={{ borderRadius: 8 }}>{people.filter((person) => person.id !== canvas.ownerId && !collaborators.some((item) => item.userId === person.id)).slice(0, 6).map((person) => <button type="button" key={person.id} className="flex w-full items-center justify-between gap-3 p-2 text-left hover:bg-muted" style={{ borderRadius: 6 }} onClick={() => void addCollaborator(person.id)}><span><strong className="block text-sm">{person.name}</strong><span className="text-xs capitalize text-muted-foreground">{person.role}</span></span><Plus className="size-4" /></button>)}</div> : null}</div>
            <div className="space-y-2"><Label className="flex items-center gap-2"><Users className="size-4" />People with access</Label><div className="space-y-2"><div className="flex items-center justify-between gap-3 border-b py-2"><span><strong className="block text-sm">{canvas.owner?.name ?? "Owner"}</strong><span className="text-xs text-muted-foreground">Canvas owner</span></span><Badge variant="outline">Owner</Badge></div>{collaborators.map((person) => <div key={person.userId} className="flex items-center justify-between gap-3 border-b py-2"><span className="min-w-0"><strong className="block truncate text-sm">{person.name}</strong><span className="block truncate text-xs text-muted-foreground">{person.email}</span></span><div className="flex items-center gap-1"><Select value={person.role} onValueChange={(value) => void changeCollaborator(person.userId, value as "viewer" | "editor")}><SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="viewer">Viewer</SelectItem><SelectItem value="editor">Editor</SelectItem></SelectContent></Select><Button size="icon" variant="ghost" title="Remove collaborator" onClick={() => void removeCollaborator(person.userId)}><Trash2 className="size-4" /></Button></div></div>)}</div></div>
          </div>
        </DialogContent>
      </Dialog>
      </EdgeActionsContext.Provider>
    </NodeActionsContext.Provider>
  );
}
