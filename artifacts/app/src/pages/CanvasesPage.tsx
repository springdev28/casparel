/**
 * @fileOverview Web screen role: renders the Canvases Page route and coordinates its page-level data and interactions.
 * System connection: mounted from App.tsx; composes generated API hooks, local helpers, and reusable UI components.
 */
import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { useDateLocale } from "@/lib/date-locale";
import {
  ArrowRight,
  BookOpenCheck,
  LayoutDashboard,
  Link2,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  School,
  Share2,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@workspace/edu-ds/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@workspace/edu-ds/components/ui/card";
import { Input } from "@workspace/edu-ds/components/ui/input";
import { Label } from "@workspace/edu-ds/components/ui/label";
import { Textarea } from "@workspace/edu-ds/components/ui/textarea";
import { Badge } from "@workspace/edu-ds/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/edu-ds/components/ui/dropdown-menu";
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
import { counted } from "@/lib/counted";
import { canvasRequest, type SchoolarCanvas } from "../lib/canvas-api";
import { LoadFailure } from "@/components/LoadFailure";

/**
 * The role and visibility names, written out rather than interpolated.
 *
 * Both are database enums and both were being shown to the reader as-is:
 * `role.replace("-", " ")` rendered "class editor", and `${visibility} access`
 * rendered "private access". A word built at render time is not a string
 * anything can translate, so every reader saw the enum in English -- and the
 * enum is not what a person calls these things in the first place.
 */
const ROLE_NAME: Record<SchoolarCanvas["permissions"]["role"], string> = {
  owner: "Owner",
  editor: "Editor",
  viewer: "Viewer",
  "class-editor": "Class editor",
  "class-viewer": "Class viewer",
};

const VISIBILITY_NAME: Record<SchoolarCanvas["visibility"], string> = {
  private: "Only you",
  people: "Chosen collaborators",
  class: "Everyone in the class",
  link: "Link sharing on",
};

export default function CanvasesPage({
  classIdOverride,
  embedded = false,
}: {
  classIdOverride?: number;
  embedded?: boolean;
} = {}) {
  const locale = useDateLocale();
  const [, setLocation] = useLocation();
  const routeSearch = useSearch();
  const requestedClassId =
    classIdOverride != null
      ? String(classIdOverride)
      : new URLSearchParams(routeSearch).get("classId");
  const [canvases, setCanvases] = useState<SchoolarCanvas[]>([]);
  const [loading, setLoading] = useState(true);
  /*
   * Why there is nothing to show, when there is nothing because the request
   * failed. The toast below says so and then goes away, leaving an invitation
   * to start a blank canvas on a page that never learned whether this person
   * has any.
   */
  const [loadError, setLoadError] = useState<unknown>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [classId, setClassId] = useState(requestedClassId ?? "personal");
  const [classAccess, setClassAccess] = useState<"view" | "edit">("view");
  const { data: me } = useGetMe();
  const { data: classes } = useListClasses();
  const isTeacher =
    (me?.activeRole ?? me?.role) === UserRole.teacher ||
    me?.role === UserRole.admin;
  const ownedClasses = (classes ?? []).filter(
    (item) => item.teacherId === me?.id || me?.role === UserRole.admin,
  );

  async function load() {
    setLoadError(null);
    try {
      setCanvases(await canvasRequest<SchoolarCanvas[]>("/canvases"));
    } catch (error) {
      setLoadError(error);
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

  async function deleteCanvasFromCard(canvas: SchoolarCanvas) {
    if (!window.confirm(`Delete “${canvas.title}”? This cannot be undone.`)) return;
    try {
      await canvasRequest(`/canvases/${canvas.id}`, { method: "DELETE" });
      setCanvases((current) => current.filter((item) => item.id !== canvas.id));
      toast({ title: "Canvas deleted" });
    } catch (error) {
      toast({
        title: "Could not delete canvas",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    }
  }

  const personal = canvases.filter((canvas) => canvas.classId == null);
  const classCanvases = canvases.filter((canvas) => canvas.classId != null && (!requestedClassId || String(canvas.classId) === requestedClassId));
  const hasVisibleCanvases = requestedClassId
    ? classCanvases.length > 0
    : canvases.length > 0;

  function CanvasCard({ canvas }: { canvas: SchoolarCanvas }) {
    const Icon = canvas.classId ? School : LayoutDashboard;
    return (
      <Card className="flex min-h-56 flex-col overflow-hidden">
        <CardHeader className="border-b bg-card/75">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary-text">
              <Icon size={18} />
            </span>
            <div className="flex items-center gap-1">
              <Badge variant="outline">
                {ROLE_NAME[canvas.permissions.role]}
              </Badge>
              {canvas.permissions.canManage ? <DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="size-8" aria-label={`Manage ${canvas.title}`} title="Canvas menu"><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-48"><DropdownMenuItem onClick={() => setLocation(`/canvases/${canvas.id}?panel=details`)}><Pencil className="mr-2 size-4" />Edit details</DropdownMenuItem><DropdownMenuItem onClick={() => setLocation(`/canvases/${canvas.id}?panel=share`)}><Share2 className="mr-2 size-4" />Sharing and access</DropdownMenuItem><DropdownMenuItem className="text-destructive-text focus:text-destructive-text" onClick={() => void deleteCanvasFromCard(canvas)}><Trash2 className="mr-2 size-4" />Delete canvas</DropdownMenuItem></DropdownMenuContent></DropdownMenu> : null}
            </div>
          </div>
          {/*
            The reader's own words, in both. Without this the bridge rewrites
            somebody's canvas title into whichever language they happen to be
            reading in -- the same failure as flashcards and class names, on
            the one page no audit had ever opened.
          */}
          <CardTitle translate="no" className="line-clamp-2 text-base">
            {canvas.title}
          </CardTitle>
          {canvas.description ? (
            <p translate="no" className="line-clamp-2 text-sm text-muted-foreground">
              {canvas.description}
            </p>
          ) : (
            <p className="line-clamp-2 text-sm text-muted-foreground">
              An open workspace for connected ideas.
            </p>
          )}
        </CardHeader>
        <CardContent className="flex-1 space-y-2 pt-4 text-xs text-muted-foreground">
          {canvas.class ? (
            <p className="flex items-center gap-2">
              <School size={13} className="shrink-0" />{" "}
              <span translate="no">{canvas.class.name}</span>
            </p>
          ) : null}
          {/*
            counted(), not "{n} collaborator{n === 1 ? '' : 's'}". Written that
            way it is three DOM text nodes, and the bridge matches whole nodes,
            so the plural rule never saw a phrase to apply.
          */}
          <p className="flex items-center gap-2">
            <Users size={13} className="shrink-0" />{" "}
            {counted(
              canvas.collaboratorCount,
              "named collaborator",
              "named collaborators",
            )}
          </p>
          <p className="flex items-center gap-2">
            <Link2 size={13} className="shrink-0" /> {VISIBILITY_NAME[canvas.visibility]}
          </p>
          <p>Edited {formatDistanceToNow(new Date(canvas.updatedAt), { addSuffix: true, locale })}</p>
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
    <div className={embedded ? "space-y-6" : "mx-auto max-w-7xl space-y-8 p-4 sm:p-6 lg:p-8"}>
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary-text">
            <BookOpenCheck size={16} /> Visual study spaces
          </div>
          <h1 className="text-2xl font-bold">{requestedClassId ? "Class canvas" : "Canvas"}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Connect notes, links, and Casparel resources in a flexible workspace.
          </p>
        </div>
        <Button data-testid="new-canvas-button" onClick={() => setCreateOpen(true)}><Plus className="mr-2 size-4" /> New canvas</Button>
      </header>

      {loading ? (
        <div className="flex min-h-52 items-center justify-center"><Loader2 className="size-6 animate-spin text-primary-text" /></div>
      ) : loadError && !hasVisibleCanvases ? (
        <LoadFailure
          error={loadError}
          retrying={loading}
          onRetry={() => {
            setLoading(true);
            void load();
          }}
        />
      ) : !hasVisibleCanvases ? (
        <section className="border-y py-16 text-center">
          <LayoutDashboard className="mx-auto mb-4 size-10 text-muted-foreground" />
          <h2 className="font-semibold">{requestedClassId ? "No class canvases yet" : "Start with a blank canvas"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Map a topic, plan a project, or create a shared class board.</p>
          <Button className="mt-5" onClick={() => setCreateOpen(true)}><Plus className="mr-2 size-4" /> Create canvas</Button>
        </section>
      ) : (
        <>
          {!requestedClassId && personal.length ? <section className="space-y-3"><h2 className="text-sm font-semibold uppercase text-muted-foreground">Personal and shared</h2><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{personal.map((canvas) => <CanvasCard key={canvas.id} canvas={canvas} />)}</div></section> : null}
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
              {!classIdOverride && <div className="space-y-2"><Label>Workspace</Label><Select value={classId} onValueChange={setClassId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="personal">Personal canvas</SelectItem>{isTeacher && ownedClasses.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>)}</SelectContent></Select></div>}
              {classId !== "personal" ? <div className="space-y-2"><Label>Student access</Label><Select value={classAccess} onValueChange={(value) => setClassAccess(value as "view" | "edit")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="view">View and suggest</SelectItem><SelectItem value="edit">Collaborative editing</SelectItem></SelectContent></Select></div> : null}
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button type="submit" disabled={creating || !title.trim()}>{creating && <Loader2 className="mr-2 size-4 animate-spin" />}Create</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
