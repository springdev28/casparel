import { useEffect, useMemo, useState } from "react";
import { Bot, ClipboardPen, Save, UserRound, Users } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@workspace/edu-ds/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@workspace/edu-ds/components/ui/card";
import { Input } from "@workspace/edu-ds/components/ui/input";
import { Label } from "@workspace/edu-ds/components/ui/label";
import { Skeleton } from "@workspace/edu-ds/components/ui/skeleton";
import { Textarea } from "@workspace/edu-ds/components/ui/textarea";
import { toast } from "@workspace/edu-ds/hooks/use-toast";
import { getGetSeatingChartQueryKey, useGetSeatingChart, useUpdateSeatingChart, useUpdateStudentNote, type SeatingAssignment } from "@workspace/api-client-react";

export function SeatingChartEditor({ classId }: { classId: number }) {
 const client = useQueryClient();
 const { data: chart, isLoading } = useGetSeatingChart(classId, { query: { queryKey: getGetSeatingChartQueryKey(classId) } });
 const updateChart = useUpdateSeatingChart(), updateNote = useUpdateStudentNote();
 const [rows, setRows] = useState(4), [columns, setColumns] = useState(5);
 const [assignments, setAssignments] = useState<SeatingAssignment[]>([]);
 const [selectedId, setSelectedId] = useState<number | null>(null), [note, setNote] = useState("");
 useEffect(() => { if (chart) { setRows(chart.rows); setColumns(chart.columns); setAssignments(chart.students.map((s) => ({ userId: s.userId, row: s.seatRow, column: s.seatColumn }))); } }, [chart]);
 const students = useMemo(() => new Map((chart?.students ?? []).map((s) => [s.userId, s])), [chart]);
 const selected = selectedId == null ? null : students.get(selectedId) ?? null;
 useEffect(() => setNote(selected?.teacherNote ?? ""), [selectedId, selected?.teacherNote]);
 const seats = useMemo(() => { const map = new Map<string, number>(); assignments.forEach((a) => { if (a.row != null && a.column != null) map.set(`${a.row}:${a.column}`, a.userId); }); return map; }, [assignments]);
 const unseated = (chart?.students ?? []).filter((s) => !assignments.some((a) => a.userId === s.userId && a.row != null));
 function tapSeat(row: number, column: number) { const occupant = seats.get(`${row}:${column}`); if (selectedId == null) { if (occupant != null) setSelectedId(occupant); return; } setAssignments((old) => old.map((a) => a.userId === selectedId ? { ...a, row, column } : a.userId === occupant ? { ...a, row: null, column: null } : a)); }
 async function saveLayout() { try { await updateChart.mutateAsync({ id: classId, data: { rows, columns, assignments } }); await client.invalidateQueries({ queryKey: getGetSeatingChartQueryKey(classId) }); toast({ title: "Classroom saved" }); } catch { toast({ title: "Could not save classroom", variant: "destructive" }); } }
 async function saveNote() { if (selectedId == null) return; try { await updateNote.mutateAsync({ id: classId, userId: selectedId, data: { note: note.trim() || null } }); await client.invalidateQueries({ queryKey: getGetSeatingChartQueryKey(classId) }); toast({ title: "Private note saved" }); } catch { toast({ title: "Could not save note", variant: "destructive" }); } }
 if (isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
 if (!chart) return null;
 return <section className="space-y-4" data-testid="seating-chart-editor">
  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-lg font-semibold">Visual classroom</h2><p className="text-sm text-muted-foreground">Select a student, then tap a seat. Notes stay private to teachers.</p></div><div className="flex flex-wrap items-end gap-2"><div><Label className="text-xs">Rows</Label><Input type="number" min={1} max={10} value={rows} onChange={(e) => setRows(Math.max(1, Math.min(10, Number(e.target.value))))} className="h-9 w-20" /></div><div><Label className="text-xs">Columns</Label><Input type="number" min={1} max={10} value={columns} onChange={(e) => setColumns(Math.max(1, Math.min(10, Number(e.target.value))))} className="h-9 w-20" /></div><Button onClick={saveLayout} disabled={updateChart.isPending}><Save className="mr-2 size-4" />Save layout</Button></div></div>
  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_290px]">
   <Card className="overflow-hidden"><CardHeader className="border-b bg-muted/30 py-3"><div className="mx-auto w-2/3 rounded-lg border bg-background py-2 text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground">Front · Teacher</div></CardHeader><CardContent className="overflow-x-auto p-3 sm:p-5"><div className="grid min-w-max gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(104px, 1fr))` }}>{Array.from({ length: rows * columns }).map((_, i) => { const row = Math.floor(i / columns), column = i - row * columns, occupant = seats.get(`${row}:${column}`), student = occupant == null ? null : students.get(occupant); return <button key={`${row}:${column}`} onClick={() => tapSeat(row, column)} className={`min-h-24 rounded-xl border-2 p-2 text-left transition ${occupant === selectedId ? "border-primary bg-primary/10" : student ? "bg-card hover:border-primary/50" : "border-dashed bg-muted/20 hover:border-primary/40"}`}>{student ? <><div className="flex items-center gap-2">{student.avatarUrl ? <img src={student.avatarUrl} alt="" className="size-8 rounded-full object-cover" /> : <span className="flex size-8 items-center justify-center rounded-full bg-primary/10"><UserRound className="size-4" /></span>}<span className="line-clamp-2 text-xs font-semibold">{student.name}</span></div>{student.teacherNote && <span className="mt-2 inline-flex items-center gap-1 text-[10px] text-amber-700"><ClipboardPen className="size-3" />Note</span>}</> : <span className="flex h-full items-center justify-center text-xs text-muted-foreground">Empty seat</span>}</button>; })}</div></CardContent></Card>
   <div className="space-y-4"><Card><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><Users className="size-4" />Unseated students</CardTitle></CardHeader><CardContent className="flex max-h-56 flex-wrap gap-2 overflow-y-auto">{unseated.length ? unseated.map((s) => <button key={s.userId} onClick={() => setSelectedId(s.userId)} className={`rounded-full border px-3 py-2 text-xs ${selectedId === s.userId ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}>{s.name}</button>) : <p className="text-xs text-muted-foreground">Everyone has a seat.</p>}</CardContent></Card>
   <Card><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><ClipboardPen className="size-4" />Student note</CardTitle></CardHeader><CardContent className="space-y-3">{selected ? <><div className="flex items-center justify-between"><b className="text-sm">{selected.name}</b><Button size="sm" variant="ghost" onClick={() => setAssignments((old) => old.map((a) => a.userId === selectedId ? { ...a, row: null, column: null } : a))}>Remove seat</Button></div><Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={5} placeholder="Learning needs, collaboration preferences, focus considerations…" /><Button onClick={saveNote} className="w-full">Save private note</Button></> : <p className="text-sm text-muted-foreground">Select a student to add context for future seating plans.</p>}</CardContent></Card>
   <Card className="border-dashed"><CardContent className="flex gap-3 pt-5"><Bot className="size-5 shrink-0 text-primary" /><div><p className="text-sm font-semibold">Assistant-ready</p><p className="mt-1 text-xs text-muted-foreground">Notes and seats are structured for a future assistant-generated plan.</p><Button size="sm" variant="outline" disabled className="mt-3">Generate later</Button></div></CardContent></Card></div>
  </div>
 </section>;
}
