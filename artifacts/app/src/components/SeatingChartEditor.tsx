import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Bot, ClipboardPen, Save, UserRound, Users, Sparkles, Loader2, Plus, Trash2, Move, Grid3X3, LayoutDashboard, MessageSquare, Send, RotateCw, Armchair, Presentation, RectangleHorizontal, Type } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@workspace/edu-ds/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/edu-ds/components/ui/card";
import { Input } from "@workspace/edu-ds/components/ui/input";
import { Label } from "@workspace/edu-ds/components/ui/label";
import { Skeleton } from "@workspace/edu-ds/components/ui/skeleton";
import { Textarea } from "@workspace/edu-ds/components/ui/textarea";
import { toast } from "@workspace/edu-ds/hooks/use-toast";
import { getGetSeatingChartQueryKey, useGetSeatingChart, useUpdateSeatingChart, useUpdateStudentNote, useSuggestSeatingPlan, type ClassroomDesk, type SeatingAssignment, type SeatingPlanSuggestion } from "@workspace/api-client-react";
import { usePlan } from "@/lib/use-plan";

type LayoutMode = "grid" | "custom";
type ElementKind = NonNullable<ClassroomDesk["kind"]>;
/** One interaction at a time: moving, resizing from the corner, or rotating from the top handle. */
type DragState = { mode: "move"; id: string; dx: number; dy: number } | { mode: "resize"; id: string } | { mode: "rotate"; id: string } | null;
const SHAPES: ClassroomDesk["shape"][] = ["polygon", "round", "oval", "trapezoid"];
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Absent kind means a legacy desk saved before room elements existed. */
const kindOf = (desk: ClassroomDesk): ElementKind => desk.kind ?? "desk";
const hasSeats = (desk: ClassroomDesk) => kindOf(desk) === "desk" || kindOf(desk) === "chair";

function deskShape(shape: ClassroomDesk["shape"]) {
  if (shape === "round") return "rounded-full";
  if (shape === "oval") return "rounded-[50%]";
  return shape === "rectangle" ? "rounded-xl" : "";
}

function deskClipPath(desk: ClassroomDesk) {
  if (desk.shape === "trapezoid") {
    const inset = clamp((90 - (desk.angle ?? 70)) * 0.75, 4, 42);
    return "polygon(" + inset + "% 0, " + (100 - inset) + "% 0, 100% 100%, 0 100%)";
  }
  if (desk.shape === "polygon") {
    const sides = clamp(Math.round(desk.sides ?? 4), 3, 12);
    if (sides === 4) return undefined;
    const start = sides % 2 === 0 ? Math.PI / sides : -Math.PI / 2;
    const points = Array.from({ length: sides }, (_, index) => {
      const radians = start + index * 2 * Math.PI / sides;
      return (50 + 50 * Math.cos(radians)) + "% " + (50 + 50 * Math.sin(radians)) + "%";
    });
    return "polygon(" + points.join(", ") + ")";
  }
  return undefined;
}

/** Visual treatment per element kind; tables keep the shape system. */
function kindClasses(desk: ClassroomDesk, selected: boolean) {
  const kind = kindOf(desk);
  const ring = selected ? "border-primary bg-primary/20 ring-2 ring-primary/20" : "";
  if (kind === "podium") return ring || "border-violet-500/70 bg-violet-500/10";
  if (kind === "board") return ring || "border-foreground/60 bg-background";
  if (kind === "text") return selected ? "border-dashed border-primary bg-primary/5" : "border-transparent bg-transparent shadow-none";
  return ring || "border-border bg-card";
}

export function SeatingChartEditor({ classId, readOnly = false }: { classId: number; readOnly?: boolean }) {
  const client = useQueryClient(), [, setLocation] = useLocation();
  const canvasRef = useRef<HTMLDivElement>(null);
  const { data: chart, isLoading } = useGetSeatingChart(classId, { query: { queryKey: getGetSeatingChartQueryKey(classId) } });
  const updateChart = useUpdateSeatingChart(), updateNote = useUpdateStudentNote(), suggestPlan = useSuggestSeatingPlan();
  const plan = usePlan();
  const [rows, setRows] = useState(4), [columns, setColumns] = useState(5);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("grid"), [desks, setDesks] = useState<ClassroomDesk[]>([]);
  const [assignments, setAssignments] = useState<SeatingAssignment[]>([]), [selectedDeskId, setSelectedDeskId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null), [note, setNote] = useState("");
  const [priorities, setPriorities] = useState(""), [suggestion, setSuggestion] = useState<SeatingPlanSuggestion | null>(null);
  const [drag, setDrag] = useState<DragState>(null);
  const [studentSuggestion, setStudentSuggestion] = useState("");
  const [suggestionPending, setSuggestionPending] = useState(false);

  useEffect(() => { if (chart) { setRows(chart.rows); setColumns(chart.columns); setLayoutMode(chart.layoutMode); setDesks(chart.desks.map((desk) => desk.shape === "rectangle" ? { ...desk, shape: "polygon" as const, sides: 4 } : desk)); setAssignments(chart.students.map((student) => ({ userId: student.userId, row: student.seatRow, column: student.seatColumn, deskId: student.seatDeskId, deskSeat: student.seatPosition }))); } }, [chart]);
  const students = useMemo(() => new Map((chart?.students ?? []).map((student) => [student.userId, student])), [chart]);
  const selected = selectedId == null ? null : students.get(selectedId) ?? null;
  useEffect(() => setNote(selected?.teacherNote ?? ""), [selectedId, selected?.teacherNote]);
  const gridSeats = useMemo(() => { const map = new Map<string, number>(); assignments.forEach((item) => { if (item.row != null && item.column != null) map.set(`${item.row}:${item.column}`, item.userId); }); return map; }, [assignments]);
  const deskSeats = useMemo(() => { const map = new Map<string, number>(); assignments.forEach((item) => { if (item.deskId != null && item.deskSeat != null) map.set(`${item.deskId}:${item.deskSeat}`, item.userId); }); return map; }, [assignments]);
  const unseated = (chart?.students ?? []).filter((student) => !assignments.some((item) => item.userId === student.userId && (layoutMode === "grid" ? item.row != null : item.deskId != null)));
  const selectedDesk = desks.find((desk) => desk.id === selectedDeskId) ?? null;

  // Delete/Backspace removes the selected element, exactly like the canvas
  // tools people know — but never while they are typing in a field.
  useEffect(() => {
    if (readOnly) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true]")) return;
      if (!selectedDeskId) return;
      event.preventDefault();
      removeDesk();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function assignSeat(target: { row?: number; column?: number; deskId?: string; deskSeat?: number }) {
    const occupant = target.deskId ? deskSeats.get(`${target.deskId}:${target.deskSeat}`) : gridSeats.get(`${target.row}:${target.column}`);
    if (selectedId == null) { if (occupant != null) setSelectedId(occupant); return; }
    setAssignments((old) => old.map((item) => item.userId === selectedId
      ? { userId: item.userId, row: target.row ?? null, column: target.column ?? null, deskId: target.deskId ?? null, deskSeat: target.deskSeat ?? null }
      : item.userId === occupant ? { userId: item.userId, row: null, column: null, deskId: null, deskSeat: null } : item));
  }

  function addDesk(shape: ClassroomDesk["shape"]) {
    const id = `desk-${Date.now().toString(36)}`;
    const desk: ClassroomDesk = { id, kind: "desk", shape, x: 8 + desks.length % 4 * 22, y: 16 + Math.floor(desks.length / 4) * 24, width: shape === "round" ? 16 : 22, height: 16, rotation: 0, capacity: shape === "round" ? 4 : 2, label: "Desk " + (desks.length + 1), ...(shape === "polygon" ? { sides: 4 } : {}), ...(shape === "trapezoid" ? { angle: 70 } : {}) };
    setDesks((old) => [...old, desk]); setSelectedDeskId(id);
  }
  /** Room furniture: chairs seat one; podium, board and text seat nobody. */
  function addElement(kind: Exclude<ElementKind, "desk">) {
    const id = `el-${Date.now().toString(36)}`;
    const base = { id, kind, x: 10 + desks.length % 5 * 17, y: 14 + Math.floor(desks.length / 5) * 20, rotation: 0, sides: 4 } as const;
    const element: ClassroomDesk =
      kind === "chair" ? { ...base, shape: "round", width: 6, height: 6, capacity: 1, label: "Chair" }
      : kind === "podium" ? { ...base, shape: "polygon", width: 18, height: 9, capacity: 0, label: "Teacher podium" }
      : kind === "board" ? { ...base, shape: "polygon", width: 36, height: 6, capacity: 0, label: "Whiteboard / Screen" }
      : { ...base, shape: "polygon", width: 20, height: 7, capacity: 0, label: "Text", text: "Write a note…" };
    setDesks((old) => [...old, element]); setSelectedDeskId(id);
  }
  function updateDesk(patch: Partial<ClassroomDesk>) { if (!selectedDeskId) return; setDesks((old) => old.map((desk) => desk.id === selectedDeskId ? { ...desk, ...patch } : desk)); }
  function removeDesk() { if (!selectedDeskId) return; setDesks((old) => old.filter((desk) => desk.id !== selectedDeskId)); setAssignments((old) => old.map((item) => item.deskId === selectedDeskId ? { ...item, deskId: null, deskSeat: null } : item)); setSelectedDeskId(null); }
  function changeCapacity(capacity: number) { if (!selectedDesk) return; updateDesk({ capacity }); setAssignments((old) => old.map((item) => item.deskId === selectedDesk.id && item.deskSeat != null && item.deskSeat >= capacity ? { ...item, deskId: null, deskSeat: null } : item)); }

  function canvasPoint(event: React.PointerEvent) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width * 100, y: (event.clientY - rect.top) / rect.height * 100 };
  }
  function beginDrag(event: React.PointerEvent, desk: ClassroomDesk) { if (!canvasRef.current) return; const point = canvasPoint(event); setSelectedDeskId(desk.id); setDrag({ mode: "move", id: desk.id, dx: point.x - desk.x, dy: point.y - desk.y }); event.currentTarget.setPointerCapture(event.pointerId); }
  function beginHandle(event: React.PointerEvent, desk: ClassroomDesk, mode: "resize" | "rotate") { event.stopPropagation(); setSelectedDeskId(desk.id); setDrag({ mode, id: desk.id }); (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); }
  function moveDrag(event: React.PointerEvent) {
    if (!drag || !canvasRef.current) return;
    const desk = desks.find((item) => item.id === drag.id);
    if (!desk) return;
    const point = canvasPoint(event);
    if (drag.mode === "move") {
      setDesks((old) => old.map((item) => item.id === drag.id ? { ...item, x: clamp(point.x - drag.dx, 0, 100 - item.width), y: clamp(point.y - drag.dy, 8, 100 - item.height) } : item));
    } else if (drag.mode === "resize") {
      // Measured in unrotated canvas space; close enough at classroom scale.
      setDesks((old) => old.map((item) => item.id === drag.id ? { ...item, width: clamp(point.x - item.x, 4, 60), height: clamp(point.y - item.y, 4, 60) } : item));
    } else {
      const rect = canvasRef.current.getBoundingClientRect();
      const centerX = rect.left + (desk.x + desk.width / 2) / 100 * rect.width;
      const centerY = rect.top + (desk.y + desk.height / 2) / 100 * rect.height;
      const degrees = Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180 / Math.PI + 90;
      const snapped = Math.round(degrees / 5) * 5;
      setDesks((old) => old.map((item) => item.id === drag.id ? { ...item, rotation: clamp(snapped > 180 ? snapped - 360 : snapped, -180, 180) } : item));
    }
  }

  async function saveLayout() { try { await updateChart.mutateAsync({ id: classId, data: { rows, columns, layoutMode, desks: layoutMode === "custom" ? desks : [], assignments } }); await client.invalidateQueries({ queryKey: getGetSeatingChartQueryKey(classId) }); toast({ title: "Classroom saved" }); } catch { toast({ title: "Could not save classroom", variant: "destructive" }); } }
  async function generatePlan() { if (!plan.seatingPlanner) { setLocation("/plans"); toast({ title: "Casparel Teacher Pro required", description: "The explainable seating planner is included with Teacher Pro. Manual seating stays available on every plan." }); return; } try { const suggestionPlan = await suggestPlan.mutateAsync({ id: classId, data: { priorities: priorities.trim() || null } }); setSuggestion(suggestionPlan); toast({ title: "Seating suggestion ready", description: "Review every relationship and reason before applying it." }); } catch { toast({ title: "Could not generate seating suggestion", variant: "destructive" }); } }
  function useSuggestionDraft() { if (!suggestion) return; setRows(suggestion.rows); setColumns(suggestion.columns); setLayoutMode(suggestion.layoutMode); setDesks(suggestion.desks); setAssignments(suggestion.assignments.map(({ userId, row, column, deskId, deskSeat }) => ({ userId, row, column, deskId, deskSeat }))); toast({ title: "Suggestion loaded as an editable draft" }); }
  async function saveNote() { if (selectedId == null) return; try { await updateNote.mutateAsync({ id: classId, userId: selectedId, data: { note: note.trim() || null } }); await client.invalidateQueries({ queryKey: getGetSeatingChartQueryKey(classId) }); toast({ title: "Private note saved" }); } catch { toast({ title: "Could not save note", variant: "destructive" }); } }
  async function submitStudentSuggestion() {
    const message = studentSuggestion.trim();
    if (message.length < 3) return;
    setSuggestionPending(true);
    try {
      const response = await fetch(`/api/classes/${classId}/seating-suggestions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("schoolar_token")}`,
        },
        body: JSON.stringify({ message }),
      });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error || "Could not send suggestion");
      setStudentSuggestion("");
      toast({ title: "Suggestion sent", description: "Your teacher will see it in their activity feed." });
    } catch (error) {
      toast({ title: "Could not send suggestion", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setSuggestionPending(false);
    }
  }

  if (isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (!chart) return null;
  const selectedKind = selectedDesk ? kindOf(selectedDesk) : null;
  return <section className="space-y-4" data-testid="seating-chart-editor">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><h2 className="text-lg font-semibold">{readOnly ? "Classroom seating" : "Classroom Designer"}</h2><p className="text-sm text-muted-foreground">{readOnly ? "View the complete seating plan. Only your teacher can edit it." : "Build the room, place students, and let the assistant reason about proximity and desk-mates."}</p></div>{!readOnly && <div className="flex flex-wrap gap-2"><Button variant={layoutMode === "grid" ? "default" : "outline"} size="sm" onClick={() => setLayoutMode("grid")}><Grid3X3 className="mr-2 size-4" />Simple grid</Button><Button variant={layoutMode === "custom" ? "default" : "outline"} size="sm" onClick={() => setLayoutMode("custom")}><LayoutDashboard className="mr-2 size-4" />Design your own</Button><Button onClick={saveLayout} disabled={updateChart.isPending}><Save className="mr-2 size-4" />Save layout</Button></div>}</div>
    {!readOnly && layoutMode === "custom" && <Card><CardContent className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-muted-foreground">Add table:</span>{SHAPES.map((shape) => <Button key={shape} size="sm" variant="outline" onClick={() => addDesk(shape)}><Plus className="mr-1 size-3" />{shape}</Button>)}<span className="ml-2 text-xs font-semibold text-muted-foreground">Add element:</span><Button size="sm" variant="outline" onClick={() => addElement("chair")}><Armchair className="mr-1 size-3" />Chair</Button><Button size="sm" variant="outline" onClick={() => addElement("podium")}><Presentation className="mr-1 size-3" />Podium</Button><Button size="sm" variant="outline" onClick={() => addElement("board")}><RectangleHorizontal className="mr-1 size-3" />Board / screen</Button><Button size="sm" variant="outline" onClick={() => addElement("text")}><Type className="mr-1 size-3" />Text</Button></div>
      <p className="text-xs text-muted-foreground">Drag an element to move it · drag the corner square to resize · drag the top handle to rotate · press Delete to remove the selected element.</p>
      {selectedDesk && <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2 xl:grid-cols-6">
        <div><Label>Label</Label><Input value={selectedDesk.label} onChange={(event) => updateDesk({ label: event.target.value })} /></div>
        {selectedKind === "text" && <div className="sm:col-span-2"><Label>Text</Label><Input value={selectedDesk.text ?? ""} maxLength={300} onChange={(event) => updateDesk({ text: event.target.value })} /></div>}
        {selectedKind === "desk" && <div><Label>Shape</Label><select className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={selectedDesk.shape} onChange={(event) => { const shape = event.target.value as ClassroomDesk["shape"]; updateDesk({ shape, ...(shape === "polygon" ? { sides: selectedDesk.sides ?? 4 } : {}), ...(shape === "trapezoid" ? { angle: selectedDesk.angle ?? 70 } : {}) }); }}>{SHAPES.map((shape) => <option key={shape}>{shape}</option>)}</select></div>}
        {selectedKind === "desk" && <div><Label>Students</Label><Input type="number" min={1} max={8} value={selectedDesk.capacity} onChange={(event) => changeCapacity(clamp(Number(event.target.value), 1, 8))} /></div>}
        <div><Label>Width · {Math.round(selectedDesk.width)}%</Label><Input type="range" min={4} max={60} value={selectedDesk.width} onChange={(event) => updateDesk({ width: Number(event.target.value) })} /></div>
        <div><Label>Height · {Math.round(selectedDesk.height)}%</Label><Input type="range" min={4} max={60} value={selectedDesk.height} onChange={(event) => updateDesk({ height: Number(event.target.value) })} /></div>
        {selectedKind === "desk" && selectedDesk.shape === "polygon" && <div><Label>Sides · {selectedDesk.sides ?? 4}</Label><Input type="range" min={3} max={12} step={1} value={selectedDesk.sides ?? 4} onChange={(event) => updateDesk({ sides: Number(event.target.value) })} /></div>}
        {selectedKind === "desk" && selectedDesk.shape === "trapezoid" && <div><Label>Angle · {selectedDesk.angle ?? 70}°</Label><Input type="range" min={25} max={85} step={1} value={selectedDesk.angle ?? 70} onChange={(event) => updateDesk({ angle: Number(event.target.value) })} /></div>}
        <div><Label>Rotation · {selectedDesk.rotation}°</Label><div className="flex gap-2"><Input type="range" min={-180} max={180} step={5} value={selectedDesk.rotation} onChange={(event) => updateDesk({ rotation: Number(event.target.value) })} /><Button size="icon" variant="destructive" onClick={removeDesk} aria-label="Remove selected element"><Trash2 className="size-4" /></Button></div></div>
      </div>}
    </CardContent></Card>}
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_310px]">
      <Card className="overflow-hidden"><CardHeader className="border-b bg-muted/30 py-3"><div className="mx-auto w-2/3 rounded-lg border bg-background py-2 text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground">Front · Board · Teacher</div></CardHeader><CardContent className="overflow-x-auto p-3 sm:p-5">{layoutMode === "grid" ? <>{!readOnly && <div className="mb-3 flex gap-2"><div><Label className="text-xs">Rows</Label><Input type="number" min={1} max={10} value={rows} onChange={(event) => setRows(clamp(Number(event.target.value), 1, 10))} className="h-9 w-20" /></div><div><Label className="text-xs">Columns</Label><Input type="number" min={1} max={10} value={columns} onChange={(event) => setColumns(clamp(Number(event.target.value), 1, 10))} className="h-9 w-20" /></div></div>}<div className="grid min-w-max gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(104px, 1fr))` }}>{Array.from({ length: rows * columns }).map((_, index) => { const row = Math.floor(index / columns), column = index % columns, occupant = gridSeats.get(`${row}:${column}`), student = occupant == null ? null : students.get(occupant); return <button key={`${row}:${column}`} disabled={readOnly} onClick={() => assignSeat({ row, column })} className={`min-h-24 rounded-xl border-2 p-2 text-left disabled:cursor-default ${occupant === selectedId ? "border-primary bg-primary/10" : student ? "bg-card" : "border-dashed bg-muted/20"}`}><StudentSeat student={student} /></button>; })}</div></> : <div className="min-w-[700px]">{!readOnly && <p className="mb-2 flex items-center gap-1 text-xs text-muted-foreground"><Move className="size-3" />Select a student, then a numbered place. Use the handles on a selected element to resize and rotate.</p>}<div ref={canvasRef} onPointerMove={readOnly ? undefined : moveDrag} onPointerUp={readOnly ? undefined : () => setDrag(null)} onPointerCancel={readOnly ? undefined : () => setDrag(null)} className="relative h-[620px] touch-none overflow-hidden rounded-xl border-2 bg-[radial-gradient(circle_at_center,hsl(var(--border))_1px,transparent_1px)] [background-size:20px_20px]">{desks.length === 0 && <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">Add a table or element above to begin designing.</div>}{desks.map((desk) => { const kind = kindOf(desk); const isSelected = selectedDeskId === desk.id; return <div key={desk.id} onPointerDown={readOnly ? undefined : (event) => beginDrag(event, desk)} onClick={readOnly ? undefined : () => setSelectedDeskId(desk.id)} className={`absolute flex ${readOnly ? "cursor-default" : "cursor-move"} flex-col border-2 p-2 shadow-md ${deskShape(desk.shape)} ${kindClasses(desk, isSelected)} ${kind === "text" ? "items-center justify-center shadow-none" : ""}`} style={{ left: `${desk.x}%`, top: `${desk.y}%`, width: `${desk.width}%`, height: `${desk.height}%`, transform: "rotate(" + desk.rotation + "deg)", clipPath: deskClipPath(desk) }}>
        {kind === "text"
          ? <span className="pointer-events-none max-h-full overflow-hidden text-center text-xs italic text-muted-foreground">{desk.text?.trim() || desk.label || "Text"}</span>
          : kind === "board"
            ? <span className="pointer-events-none m-auto truncate text-center text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{desk.label}</span>
            : <span className={`truncate text-center text-[10px] font-semibold ${kind === "podium" ? "m-auto" : ""}`}>{desk.label}</span>}
        {hasSeats(desk) && <div className="flex flex-1 flex-wrap items-center justify-center gap-1">{Array.from({ length: desk.capacity }, (_, deskSeat) => { const occupant = deskSeats.get(`${desk.id}:${deskSeat}`), student = occupant == null ? null : students.get(occupant); return <button key={deskSeat} disabled={readOnly} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); assignSeat({ deskId: desk.id, deskSeat }); }} title={student ? student.name + (student.customRole ? ` · ${student.customRole}` : "") : `Empty place ${deskSeat + 1}`} className={`flex ${kind === "chair" ? "size-7" : "size-9"} items-center justify-center overflow-hidden rounded-full border text-[10px] font-bold shadow-sm ${occupant === selectedId ? "border-primary bg-primary text-primary-foreground" : student ? "bg-background" : "border-dashed bg-muted"}`}>{student?.avatarUrl ? <img src={student.avatarUrl} alt="" className="size-full object-cover" /> : student ? student.name.slice(0, 2).toUpperCase() : deskSeat + 1}</button>; })}</div>}
        {!readOnly && isSelected && <>
          <button aria-label="Rotate element" onPointerDown={(event) => beginHandle(event, desk, "rotate")} className="absolute -top-3 left-1/2 flex size-6 -translate-x-1/2 -translate-y-full cursor-grab items-center justify-center rounded-full border-2 border-primary bg-background shadow" style={{ touchAction: "none" }}><RotateCw className="size-3 text-primary-text" /></button>
          <span aria-hidden className="absolute -top-3 left-1/2 h-3 w-0.5 -translate-x-1/2 bg-primary" />
          <button aria-label="Resize element" onPointerDown={(event) => beginHandle(event, desk, "resize")} className="absolute -bottom-1.5 -right-1.5 size-4 cursor-nwse-resize rounded-sm border-2 border-primary bg-background shadow" style={{ touchAction: "none" }} />
        </>}
      </div>; })}</div></div>}</CardContent></Card>
      <div className="space-y-4">{readOnly ? <Card><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><MessageSquare className="size-4" />Suggest a change</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-xs text-muted-foreground">Your suggestion goes to the class teacher. It will not change the chart automatically.</p><Textarea value={studentSuggestion} onChange={(event) => setStudentSuggestion(event.target.value)} maxLength={1000} rows={5} placeholder="Explain what you would like changed and why…" data-testid="seating-suggestion-input" /><Button className="w-full" onClick={submitStudentSuggestion} disabled={suggestionPending || studentSuggestion.trim().length < 3} data-testid="submit-seating-suggestion">{suggestionPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-4" />}Send suggestion</Button></CardContent></Card> : <><Card><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><Users className="size-4" />Students to place</CardTitle></CardHeader><CardContent className="flex max-h-56 flex-wrap gap-2 overflow-y-auto">{unseated.length ? unseated.map((student) => <button key={student.userId} onClick={() => setSelectedId(student.userId)} className={`rounded-full border px-3 py-2 text-xs ${selectedId === student.userId ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}>{student.name}{student.customRole ? <span className="ml-1 opacity-70">· {student.customRole}</span> : null}</button>) : <p className="text-xs text-muted-foreground">Everyone has a place.</p>}</CardContent></Card>
      <Card><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><ClipboardPen className="size-4" />Individual student note</CardTitle></CardHeader><CardContent className="space-y-3">{selected ? <><div className="flex flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-2"><b className="text-sm">{selected.name}</b>{selected.customRole && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary-text">{selected.customRole}</span>}</span><Button size="sm" variant="ghost" onClick={() => setLocation(`/profile/${selected.userId}?classId=${classId}`)}>Open profile</Button></div><Textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} rows={5} placeholder="Example: He talks a lot with Jane. Keep him near the front." /><div className="flex gap-2"><Button onClick={saveNote} className="flex-1">Save private note</Button><Button variant="outline" onClick={() => setAssignments((old) => old.map((item) => item.userId === selectedId ? { ...item, row: null, column: null, deskId: null, deskSeat: null } : item))}>Unseat</Button></div></> : <p className="text-sm text-muted-foreground">Select a student to manage their note and placement.</p>}</CardContent></Card>
      <Card className="border-primary/20"><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><Bot className="size-4 text-primary-text" />Explainable seating assistant <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary-text">Teacher Pro</span></CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-xs text-muted-foreground">{plan.seatingPlanner ? "Rule-based, not an AI model: it reads current positions, front distance, desk-mates, and private notes only when requested, and explains every placement." : "The seating planner is included with Teacher Pro. You can still design and assign every seat manually on any plan."}</p><Textarea value={priorities} onChange={(event) => setPriorities(event.target.value)} maxLength={1000} rows={3} placeholder="Optional priorities…" disabled={!plan.seatingPlanner} /><Button className="w-full" variant="outline" onClick={generatePlan} disabled={suggestPlan.isPending}>{suggestPlan.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}{plan.seatingPlanner ? "Generate suggestion" : "Unlock with Teacher Pro"}</Button>{suggestion && <div className="space-y-3 rounded-lg border bg-muted/30 p-3"><p className="text-sm font-semibold">{suggestion.summary}</p><ul className="space-y-1 text-xs text-muted-foreground">{suggestion.considerations.map((item) => <li key={item}>• {item}</li>)}</ul><div className="max-h-64 space-y-2 overflow-y-auto">{suggestion.assignments.map((item) => <div key={item.userId} className="rounded-md bg-background p-2 text-xs"><p className="font-semibold">{students.get(item.userId)?.name ?? `Student ${item.userId}`}</p><p className="mt-1 text-muted-foreground">{item.reason}</p></div>)}</div><Button size="sm" className="w-full" onClick={useSuggestionDraft}>Use as editable draft</Button><p className="text-[11px] text-muted-foreground">Saving the layout is still required.</p></div>}</CardContent></Card></>}</div>
    </div>
  </section>;
}

function StudentSeat({ student }: { student?: { name: string; avatarUrl?: string | null } | null }) {
  if (!student) return <span className="flex h-full items-center justify-center text-xs text-muted-foreground">Empty seat</span>;
  return <div className="flex items-center gap-2">{student.avatarUrl ? <img src={student.avatarUrl} alt="" className="size-8 rounded-full object-cover" /> : <span className="flex size-8 items-center justify-center rounded-full bg-primary/10"><UserRound className="size-4" /></span>}<span className="line-clamp-2 text-xs font-semibold">{student.name}</span></div>;
}
