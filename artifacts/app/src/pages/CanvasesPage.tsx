import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowRight,
  BookOpenCheck,
  LayoutDashboard,
  Link2,
  Loader2,
  Plus,
  School,
  Users,
} from "lucide-react";
import { Button } from "@workspace/edu-ds/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@workspace/edu-ds/components/ui/card";
import { Input } from "@workspace/edu-ds/components/ui/input";
import { Label } from "@workspace/edu-ds/components/ui/label";
import { Textarea } from "@workspace/edu-ds/components/ui/textarea";
import { Badge } from "@workspace/edu-ds/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/edu-ds/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/edu-ds/components/ui/select";
import { toast } from "@workspace/edu-ds/hooks/use-toast";
import { useGetMe, useListClasses, UserRole } from "@workspace/api-client-react";
import { canvasRequest, type SchoolarCanvas } from "../lib/canvas-api";

export default function CanvasesPage() {
  const [, setLocation] = useLocation();
  const routeSearch = useSearch();
  const requestedClassId = new URLSearchParams(routeSearch).get("classId");
  const [canvases, setCanvases] = useState<SchoolarCanvas[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [classId, setClassId] = useState(requestedClassId ?? "personal");
  const [classAccess, setClassAccess] = useState<"view" | "edit">("view");
  const { data: me } = useGetMe();
  const { data: classes } = useListClasses();
  const isTeacher = (me?.activeRole ?? me?.role) === UserRole.teacher;
  const ownedClasses = (classes ?? []).filter((item) => item.teacherId === me?.id);

  async function load() {
    try {
      setCanvases(await canvasRequest<SchoolarCanvas[]>("/canvases"));
    } catch (error) {
      toast({
        title: "Could not load canvases",
        description: error instanceof Error ? error.message : "Try again",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createCanvas(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    try {
      const canvas = await canvasRequest<SchoolarCanvas>("/canvases", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          classId: classId === "personal" ? null : Number(classId),
          classAccess,
        }),
      });
      setCreateOpen(false);
      setLocation(`/canvases/${canvas.id}`);
    } catch (error) {
      toast({
        title: "Could not create canvas",
        description: error instanceof Error ? error.message : "Try again",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  }

  const personal = canvases.filter((canvas) => canvas.classId == null);
  const classCanvases = canvases.filter((canvas) => canvas.classId != null && (!requestedClassId || String(canvas.classId) === requestedClassId));

  function CanvasCard({ canvas }: { canvas: SchoolarCanvas }) {
    const Icon = canvas.classId ? School : LayoutDashboard;
    return (
      <Card className="flex min-h-56 flex-col overflow-hidden">
        <CardHeader className="border-b bg-card/75">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Icon size={18} />
            </span>
            <Badge variant="outline" className="capitalize">
              {canvas.permissions.role.replace("-", " ")}
            </Badge>
          </div>
          <CardTitle className="line-clamp-2 text-base">{canvas.title}</CardTitle>
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {canvas.description || "An open workspace for connected ideas."}
          </p>
        </CardHeader>
        <CardContent className="flex-1 space-y-2 pt-4 text-xs text-muted-foreground">
          {canvas.class ? (
            <p className="flex items-center gap-2"><School size={13} /> {canvas.class.name}</p>
          ) : null}
          <p className="flex items-center gap-2"><Users size={13} /> {canvas.collaboratorCount} named collaborator{canvas.collaboratorCount === 1 ? "" : "s"}</p>
          <p className="flex items-center gap-2"><Link2 size={13} /> {canvas.visibility === "link" ? "Link sharing on" : `${canvas.visibility} access`}</p>
          <p>Edited {formatDistanceToNow(new Date(canvas.updatedAt), { addSuffix: true })}</p>
        </CardContent>
        <CardFooter className="justify-end border-t pt-4">
          <Button size="sm" onClick={() => setLocation(`/canvases/${canvas.id}`)}>
            Open <ArrowRight className="ml-2 size-4" />
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
            <BookOpenCheck size={16} /> Visual study spaces
          </div>
          <h1 className="text-2xl font-bold">Canvas</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Connect notes, links, and Schoolar resources in a flexible workspace.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}><Plus className="mr-2 size-4" /> New canvas</Button>
      </header>

      {loading ? (
        <div className="flex min-h-52 items-center justify-center"><Loader2 className="size-6 animate-spin text-primary" /></div>
      ) : !canvases.length ? (
        <section className="border-y py-16 text-center">
          <LayoutDashboard className="mx-auto mb-4 size-10 text-muted-foreground" />
          <h2 className="font-semibold">Start with a blank canvas</h2>
          <p className="mt-1 text-sm text-muted-foreground">Map a topic, plan a project, or create a shared class board.</p>
          <Button className="mt-5" onClick={() => setCreateOpen(true)}><Plus className="mr-2 size-4" /> Create canvas</Button>
        </section>
      ) : (
        <>
          {personal.length ? <section className="space-y-3"><h2 className="text-sm font-semibold uppercase text-muted-foreground">Personal and shared</h2><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{personal.map((canvas) => <CanvasCard key={canvas.id} canvas={canvas} />)}</div></section> : null}
          {classCanvases.length ? <section className="space-y-3"><h2 className="text-sm font-semibold uppercase text-muted-foreground">Class canvases</h2><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{classCanvases.map((canvas) => <CanvasCard key={canvas.id} canvas={canvas} />)}</div></section> : null}
        </>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <form onSubmit={createCanvas}>
            <DialogHeader><DialogTitle>Create canvas</DialogTitle><DialogDescription>Choose a personal workspace or attach it to a class you teach.</DialogDescription></DialogHeader>
            <div className="space-y-4 py-5">
              <div className="space-y-2"><Label htmlFor="canvas-title">Title</Label><Input id="canvas-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} autoFocus /></div>
              <div className="space-y-2"><Label htmlFor="canvas-description">Description</Label><Textarea id="canvas-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} /></div>
              <div className="space-y-2"><Label>Workspace</Label><Select value={classId} onValueChange={setClassId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="personal">Personal canvas</SelectItem>{isTeacher && ownedClasses.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>)}</SelectContent></Select></div>
              {classId !== "personal" ? <div className="space-y-2"><Label>Student access</Label><Select value={classAccess} onValueChange={(value) => setClassAccess(value as "view" | "edit")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="view">View and suggest</SelectItem><SelectItem value="edit">Collaborative editing</SelectItem></SelectContent></Select></div> : null}
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button type="submit" disabled={creating || !title.trim()}>{creating && <Loader2 className="mr-2 size-4 animate-spin" />}Create</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
