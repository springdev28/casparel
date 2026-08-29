/**
 * @fileOverview Web UI role: provides the reusable Seating Chart Editor component or bridge.
 * System connection: consumed by pages or shells and kept separate to share presentation, accessibility, and interaction behavior.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useLocation } from "wouter";
import {
  Bot,
  ClipboardCopy,
  ClipboardPaste,
  ClipboardPen,
  Copy,
  Grid3X3,
  LayoutDashboard,
  Loader2,
  Maximize2,
  MessageSquare,
  Monitor,
  MousePointer2,
  Move,
  Plus,
  Presentation,
  RotateCw,
  Save,
  Send,
  Sparkles,
  Table2,
  Trash2,
  Type as TypeIcon,
  UserRound,
  Users,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@workspace/edu-ds/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/edu-ds/components/ui/card";
import { Input } from "@workspace/edu-ds/components/ui/input";
import { Label } from "@workspace/edu-ds/components/ui/label";
import { Skeleton } from "@workspace/edu-ds/components/ui/skeleton";
import { Textarea } from "@workspace/edu-ds/components/ui/textarea";
import { toast } from "@workspace/edu-ds/hooks/use-toast";
import {
  getGetSeatingChartQueryKey,
  useGetSeatingChart,
  useSuggestSeatingPlan,
  useUpdateSeatingChart,
  useUpdateStudentNote,
  type ClassroomDesk,
  type SeatingAssignment,
  type SeatingPlanSuggestion,
} from "@workspace/api-client-react";
import { usePlan } from "@/lib/use-plan";

type LayoutMode = "grid" | "custom";
type ElementKind = NonNullable<ClassroomDesk["kind"]>;
type CanvasPoint = { x: number; y: number };
type PointerCoordinates = {
  clientX: number;
  clientY: number;
  shiftKey?: boolean;
};
type SeatStudent = { name: string; avatarUrl?: string | null };
type MoveOrigin = Pick<ClassroomDesk, "x" | "y" | "width" | "height">;
type SelectionBounds = { x: number; y: number; width: number; height: number };
type GroupRotationOrigin = MoveOrigin & {
  rotation: number;
  centerX: number;
  centerY: number;
};
type InteractionState =
  | {
      type: "move";
      start: CanvasPoint;
      origins: Record<string, MoveOrigin>;
    }
  | {
      type: "marquee";
      start: CanvasPoint;
      current: CanvasPoint;
      baseSelection: string[];
    }
  | {
      type: "resize";
      id: string;
      start: CanvasPoint;
      width: number;
      height: number;
    }
  | {
      type: "rotate";
      id: string;
      startAngle: number;
      rotation: number;
    }
  | {
      type: "chair";
      deskId: string;
      seatIndex: number;
    }
  | {
      type: "group-resize";
      bounds: SelectionBounds;
      origins: Record<string, MoveOrigin>;
    }
  | {
      type: "group-rotate";
      center: CanvasPoint;
      startAngle: number;
      origins: Record<string, GroupRotationOrigin>;
    }
  | null;

const SHAPES: ClassroomDesk["shape"][] = [
  "rectangle",
  "round",
  "oval",
  "trapezoid",
  "polygon",
];
const MAX_ELEMENTS = 50;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function elementKind(element: ClassroomDesk): ElementKind {
  return element.kind ?? "desk";
}

function kindLabel(kind: ElementKind) {
  return {
    desk: "Student table",
    chair: "Chair",
    teacherDesk: "Teacher place",
    podium: "Podium",
    board: "Whiteboard / screen",
    text: "Text label",
  }[kind];
}

function shapeLabel(shape: ClassroomDesk["shape"]) {
  return {
    rectangle: "Rectangular table",
    round: "Round table",
    oval: "Oval table",
    trapezoid: "Trapezoid table",
    polygon: "Polygon table",
  }[shape];
}

function defaultChairAngles(count: number) {
  if (count <= 0) return [];
  return Array.from({ length: count }, (_, index) =>
    normalizeDegrees(90 + (index * 360) / count),
  );
}

function chairAngles(element: ClassroomDesk) {
  const count = clamp(Math.round(element.capacity), 0, 8);
  const defaults = defaultChairAngles(count);
  return Array.from({ length: count }, (_, index) => {
    const saved = element.chairPositions?.[index];
    return typeof saved === "number" && Number.isFinite(saved)
      ? normalizeDegrees(saved)
      : defaults[index];
  });
}

function resizeChairAngles(element: ClassroomDesk, count: number) {
  const result = chairAngles(element).slice(0, count);
  while (result.length < count) {
    if (result.length === 0) {
      result.push(90);
      continue;
    }
    const ordered = result
      .map((angle) => (angle + 360) % 360)
      .sort((a, b) => a - b);
    let largestGap = -1;
    let nextAngle = 90;
    ordered.forEach((angle, index) => {
      const following =
        index === ordered.length - 1 ? ordered[0] + 360 : ordered[index + 1];
      const gap = following - angle;
      if (gap > largestGap) {
        largestGap = gap;
        nextAngle = angle + gap / 2;
      }
    });
    result.push(normalizeDegrees(nextAngle));
  }
  return result;
}

function chairPlacement(angle: number) {
  const radians = (angle * Math.PI) / 180;
  const facingRotation = normalizeDegrees(angle - 90);
  return {
    facingRotation,
    style: {
      left: `${50 + Math.cos(radians) * 59}%`,
      top: `${50 + Math.sin(radians) * 63}%`,
      transform: `translate(-50%, -50%) rotate(${facingRotation}deg)`,
    } satisfies CSSProperties,
  };
}

function deskClipPath(element: ClassroomDesk) {
  if (element.shape === "trapezoid") {
    const inset = clamp((90 - (element.angle ?? 70)) * 0.75, 4, 42);
    return `polygon(${inset}% 0, ${100 - inset}% 0, 100% 100%, 0 100%)`;
  }
  if (element.shape === "polygon") {
    const sides = clamp(Math.round(element.sides ?? 6), 3, 12);
    const start = sides % 2 === 0 ? Math.PI / sides : -Math.PI / 2;
    const points = Array.from({ length: sides }, (_, index) => {
      const radians = start + (index * 2 * Math.PI) / sides;
      return `${50 + 50 * Math.cos(radians)}% ${50 + 50 * Math.sin(radians)}%`;
    });
    return `polygon(${points.join(", ")})`;
  }
  return undefined;
}

function makeElementId(kind: ElementKind) {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 12)
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${kind}-${suffix}`;
}

function nextDeskNumber(elements: ClassroomDesk[]) {
  const deskLabels = elements
    .filter((element) => elementKind(element) === "desk")
    .map((element) => element.label.match(/^Desk\s+(\d+)$/i)?.[1])
    .filter((value): value is string => Boolean(value))
    .map(Number);
  const deskCount = elements.filter(
    (element) => elementKind(element) === "desk",
  ).length;
  return Math.max(deskCount, 0, ...deskLabels) + 1;
}

function selectionBounds(elements: MoveOrigin[]): SelectionBounds | null {
  if (!elements.length) return null;
  const left = Math.min(...elements.map((element) => element.x));
  const top = Math.min(...elements.map((element) => element.y));
  const right = Math.max(
    ...elements.map((element) => element.x + element.width),
  );
  const bottom = Math.max(
    ...elements.map((element) => element.y + element.height),
  );
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function createElement(
  kind: ElementKind,
  shape: ClassroomDesk["shape"],
  index: number,
): ClassroomDesk {
  const stagger = index % 8;
  const base: ClassroomDesk = {
    id: makeElementId(kind),
    kind,
    shape,
    x: clamp(8 + (stagger % 4) * 22, 0, 72),
    y: clamp(14 + Math.floor(stagger / 4) * 28, 0, 72),
    width: 22,
    height: 16,
    rotation: 0,
    capacity: 0,
    label: kindLabel(kind),
  };

  if (kind === "desk") {
    const capacity = shape === "round" ? 4 : shape === "oval" ? 6 : 2;
    return {
      ...base,
      width: shape === "round" ? 18 : shape === "oval" ? 28 : 22,
      height: shape === "round" ? 20 : 16,
      capacity,
      chairPositions: defaultChairAngles(capacity),
      label: shape === "round" ? "Group table" : "Student table",
      ...(shape === "polygon" ? { sides: 6 } : {}),
      ...(shape === "trapezoid" ? { angle: 70 } : {}),
    };
  }
  if (kind === "chair") {
    return { ...base, width: 8, height: 11, capacity: 1, label: "Chair" };
  }
  if (kind === "teacherDesk") {
    return {
      ...base,
      x: 37,
      y: 8,
      width: 26,
      height: 15,
      label: "Teacher place",
    };
  }
  if (kind === "podium") {
    return {
      ...base,
      x: 43,
      y: 9,
      width: 14,
      height: 13,
      label: "Podium",
    };
  }
  if (kind === "board") {
    return {
      ...base,
      x: 32,
      y: 2,
      width: 36,
      height: 8,
      label: "Whiteboard / screen",
    };
  }
  return {
    ...base,
    width: 28,
    height: 8,
    label: "Classroom note",
  };
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

function normalizeDegrees(value: number) {
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

export function SeatingChartEditor({
  classId,
  readOnly = false,
}: {
  classId: number;
  readOnly?: boolean;
}) {
  const client = useQueryClient();
  const [, setLocation] = useLocation();
  const canvasRef = useRef<HTMLDivElement>(null);
  const pasteCountRef = useRef(0);
  const chairWasDraggedRef = useRef(false);
  const interactionRef = useRef<InteractionState>(null);
  const pointerFrameRef = useRef<number | null>(null);
  const pendingPointerRef = useRef<PointerCoordinates | null>(null);
  const { data: chart, isLoading } = useGetSeatingChart(classId, {
    query: { queryKey: getGetSeatingChartQueryKey(classId) },
  });
  const updateChart = useUpdateSeatingChart();
  const updateNote = useUpdateStudentNote();
  const suggestPlan = useSuggestSeatingPlan();
  const plan = usePlan();
  const [rows, setRows] = useState(4);
  const [columns, setColumns] = useState(5);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("grid");
  const [desks, setDesks] = useState<ClassroomDesk[]>([]);
  const [assignments, setAssignments] = useState<SeatingAssignment[]>([]);
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const [clipboardElements, setClipboardElements] = useState<ClassroomDesk[]>(
    [],
  );
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [priorities, setPriorities] = useState("");
  const [suggestion, setSuggestion] = useState<SeatingPlanSuggestion | null>(
    null,
  );
  const [interaction, setInteraction] = useState<InteractionState>(null);
  const [studentSuggestion, setStudentSuggestion] = useState("");
  const [suggestionPending, setSuggestionPending] = useState(false);

  useEffect(() => {
    if (!chart) return;
    setRows(chart.rows);
    setColumns(chart.columns);
    setLayoutMode(chart.layoutMode);
    setDesks(
      chart.desks.map((element) =>
        elementKind(element) === "podium" &&
        element.label === "Podium / lectern"
          ? { ...element, label: "Podium" }
          : element,
      ),
    );
    setAssignments(
      chart.students.map((student) => ({
        userId: student.userId,
        row: student.seatRow,
        column: student.seatColumn,
        deskId: student.seatDeskId,
        deskSeat: student.seatPosition,
      })),
    );
    setSelectedElementIds([]);
    cancelInteraction();
  }, [chart]);

  useEffect(
    () => () => {
      if (pointerFrameRef.current != null) {
        cancelAnimationFrame(pointerFrameRef.current);
      }
    },
    [],
  );

  const students = useMemo(
    () =>
      new Map(
        (chart?.students ?? []).map((student) => [student.userId, student]),
      ),
    [chart],
  );
  const selected =
    selectedId == null ? null : (students.get(selectedId) ?? null);
  const selectedElementSet = useMemo(
    () => new Set(selectedElementIds),
    [selectedElementIds],
  );
  const selectedElement =
    selectedElementIds.length === 1
      ? (desks.find((desk) => desk.id === selectedElementIds[0]) ?? null)
      : null;
  const selectedGroupElements = useMemo(
    () =>
      selectedElementIds.length > 1
        ? desks.filter((element) => selectedElementSet.has(element.id))
        : [],
    [desks, selectedElementIds.length, selectedElementSet],
  );
  const selectedGroupBounds = useMemo(
    () => selectionBounds(selectedGroupElements),
    [selectedGroupElements],
  );

  useEffect(
    () => setNote(selected?.teacherNote ?? ""),
    [selectedId, selected?.teacherNote],
  );

  const gridSeats = useMemo(() => {
    const map = new Map<string, number>();
    assignments.forEach((item) => {
      if (item.row != null && item.column != null) {
        map.set(`${item.row}:${item.column}`, item.userId);
      }
    });
    return map;
  }, [assignments]);

  const deskSeats = useMemo(() => {
    const map = new Map<string, number>();
    assignments.forEach((item) => {
      if (item.deskId != null && item.deskSeat != null) {
        map.set(`${item.deskId}:${item.deskSeat}`, item.userId);
      }
    });
    return map;
  }, [assignments]);

  const seatNumberStarts = useMemo(() => {
    const starts = new Map<string, number>();
    let nextSeatNumber = 1;
    desks.forEach((element) => {
      const kind = elementKind(element);
      if (kind !== "desk" && kind !== "chair") return;
      starts.set(element.id, nextSeatNumber);
      nextSeatNumber += clamp(Math.round(element.capacity), 0, 8);
    });
    return starts;
  }, [desks]);

  const unseated = (chart?.students ?? []).filter(
    (student) =>
      !assignments.some(
        (item) =>
          item.userId === student.userId &&
          (layoutMode === "grid" ? item.row != null : item.deskId != null),
      ),
  );

  function canvasPoint(event: { clientX: number; clientY: number }) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    };
  }

  function pointerAngle(
    event: { clientX: number; clientY: number },
    element: ClassroomDesk,
  ) {
    return pointerAngleAt(event, {
      x: element.x + element.width / 2,
      y: element.y + element.height / 2,
    });
  }

  function pointerAngleAt(
    event: { clientX: number; clientY: number },
    center: CanvasPoint,
  ) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const centerX = rect.left + (center.x / 100) * rect.width;
    const centerY = rect.top + (center.y / 100) * rect.height;
    return (
      (Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180) /
      Math.PI
    );
  }

  function setActiveInteraction(next: InteractionState) {
    interactionRef.current = next;
    setInteraction(next);
  }

  function clearQueuedPointerMove() {
    if (pointerFrameRef.current != null) {
      cancelAnimationFrame(pointerFrameRef.current);
      pointerFrameRef.current = null;
    }
    pendingPointerRef.current = null;
  }

  function cancelInteraction() {
    clearQueuedPointerMove();
    setActiveInteraction(null);
  }

  function finishInteraction() {
    const pending = pendingPointerRef.current;
    if (pointerFrameRef.current != null) {
      cancelAnimationFrame(pointerFrameRef.current);
      pointerFrameRef.current = null;
    }
    pendingPointerRef.current = null;
    if (pending) applyPointerMove(pending);
    setActiveInteraction(null);
  }

  function assignSeat(target: {
    row?: number;
    column?: number;
    deskId?: string;
    deskSeat?: number;
  }) {
    const occupant = target.deskId
      ? deskSeats.get(`${target.deskId}:${target.deskSeat}`)
      : gridSeats.get(`${target.row}:${target.column}`);
    if (selectedId == null) {
      if (occupant != null) setSelectedId(occupant);
      return;
    }
    setAssignments((old) =>
      old.map((item) =>
        item.userId === selectedId
          ? {
              userId: item.userId,
              row: target.row ?? null,
              column: target.column ?? null,
              deskId: target.deskId ?? null,
              deskSeat: target.deskSeat ?? null,
            }
          : item.userId === occupant
            ? {
                userId: item.userId,
                row: null,
                column: null,
                deskId: null,
                deskSeat: null,
              }
            : item,
      ),
    );
  }

  function assignSeatFromChair(target: { deskId: string; deskSeat: number }) {
    if (chairWasDraggedRef.current) {
      chairWasDraggedRef.current = false;
      return;
    }
    assignSeat(target);
  }

  function addElement(
    kind: ElementKind,
    shape: ClassroomDesk["shape"] = "rectangle",
  ) {
    if (desks.length >= MAX_ELEMENTS) {
      toast({
        title: "Classroom is full",
        description: `A custom classroom can contain up to ${MAX_ELEMENTS} elements.`,
        variant: "destructive",
      });
      return;
    }
    const created = createElement(kind, shape, desks.length);
    const element =
      kind === "desk"
        ? { ...created, label: `Desk ${nextDeskNumber(desks)}` }
        : created;
    setDesks((old) => [...old, element]);
    setSelectedElementIds([element.id]);
    requestAnimationFrame(() => canvasRef.current?.focus());
  }

  function updateElement(patch: Partial<ClassroomDesk>) {
    if (!selectedElement) return;
    setDesks((old) =>
      old.map((element) =>
        element.id === selectedElement.id ? { ...element, ...patch } : element,
      ),
    );
  }

  function removeElements(ids = selectedElementIds) {
    if (!ids.length) return;
    const removed = new Set(ids);
    setDesks((old) => old.filter((element) => !removed.has(element.id)));
    setAssignments((old) =>
      old.map((item) =>
        item.deskId != null && removed.has(item.deskId)
          ? { ...item, deskId: null, deskSeat: null }
          : item,
      ),
    );
    setSelectedElementIds([]);
    cancelInteraction();
  }

  function changeCapacity(capacity: number) {
    if (!selectedElement || elementKind(selectedElement) !== "desk") return;
    const nextCapacity = clamp(
      Number.isFinite(capacity) ? Math.round(capacity) : 0,
      0,
      8,
    );
    updateElement({
      capacity: nextCapacity,
      chairPositions: resizeChairAngles(selectedElement, nextCapacity),
    });
    setAssignments((old) =>
      old.map((item) =>
        item.deskId === selectedElement.id &&
        item.deskSeat != null &&
        item.deskSeat >= nextCapacity
          ? { ...item, deskId: null, deskSeat: null }
          : item,
      ),
    );
  }

  function copySelection(title = "Copied") {
    const copied = desks
      .filter((element) => selectedElementSet.has(element.id))
      .map((element) => ({ ...element }));
    if (!copied.length) return;
    setClipboardElements(copied);
    pasteCountRef.current = 0;
    toast({
      title: `${title} ${copied.length} element${copied.length === 1 ? "" : "s"}`,
      description: "Paste to create an unassigned copy.",
    });
  }

  function pasteElements(source = clipboardElements) {
    if (!source.length) return;
    const available = MAX_ELEMENTS - desks.length;
    if (available <= 0) {
      toast({ title: "Classroom is full", variant: "destructive" });
      return;
    }
    const offset = 3 + (pasteCountRef.current % 4) * 2;
    pasteCountRef.current += 1;
    let pastedDeskNumber = nextDeskNumber(desks);
    const pasted = source.slice(0, available).map((element) => {
      const kind = elementKind(element);
      return {
        ...element,
        id: makeElementId(kind),
        x: clamp(element.x + offset, 0, 100 - element.width),
        y: clamp(element.y + offset, 0, 100 - element.height),
        label: kind === "desk" ? `Desk ${pastedDeskNumber++}` : element.label,
        ...(element.chairPositions
          ? { chairPositions: [...element.chairPositions] }
          : {}),
      };
    });
    setDesks((old) => [...old, ...pasted]);
    setSelectedElementIds(pasted.map((element) => element.id));
    requestAnimationFrame(() => canvasRef.current?.focus());
    if (pasted.length < source.length) {
      toast({
        title: `Pasted ${pasted.length} elements`,
        description: `The classroom limit is ${MAX_ELEMENTS} elements.`,
      });
    }
  }

  function duplicateSelection() {
    const copied = desks
      .filter((element) => selectedElementSet.has(element.id))
      .map((element) => ({ ...element }));
    pasteElements(copied);
  }

  function beginCanvasSelection(event: ReactPointerEvent<HTMLDivElement>) {
    if (readOnly || event.button !== 0 || event.target !== event.currentTarget)
      return;
    const point = canvasPoint(event);
    if (!point) return;
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    setActiveInteraction({
      type: "marquee",
      start: point,
      current: point,
      baseSelection: additive ? selectedElementIds : [],
    });
    if (!additive) setSelectedElementIds([]);
  }

  function beginMove(
    event: ReactPointerEvent<HTMLDivElement>,
    element: ClassroomDesk,
  ) {
    if (readOnly || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    canvasRef.current?.focus();
    const point = canvasPoint(event);
    if (!point) return;
    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    let nextSelection = selectedElementIds;

    if (additive && selectedElementSet.has(element.id)) {
      setSelectedElementIds(
        selectedElementIds.filter((id) => id !== element.id),
      );
      return;
    }
    if (additive) {
      nextSelection = [...selectedElementIds, element.id];
    } else if (!selectedElementSet.has(element.id)) {
      nextSelection = [element.id];
    }
    setSelectedElementIds(nextSelection);
    const ids = new Set(nextSelection);
    const origins = Object.fromEntries(
      desks
        .filter((item) => ids.has(item.id))
        .map((item) => [
          item.id,
          { x: item.x, y: item.y, width: item.width, height: item.height },
        ]),
    );
    event.currentTarget.setPointerCapture(event.pointerId);
    setActiveInteraction({ type: "move", start: point, origins });
  }

  function beginResize(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!selectedElement) return;
    event.preventDefault();
    event.stopPropagation();
    const point = canvasPoint(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setActiveInteraction({
      type: "resize",
      id: selectedElement.id,
      start: point,
      width: selectedElement.width,
      height: selectedElement.height,
    });
  }

  function beginRotate(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!selectedElement) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setActiveInteraction({
      type: "rotate",
      id: selectedElement.id,
      startAngle: pointerAngle(event, selectedElement),
      rotation: selectedElement.rotation,
    });
  }

  function beginChairMove(
    event: ReactPointerEvent<HTMLButtonElement>,
    element: ClassroomDesk,
    seatIndex: number,
  ) {
    if (readOnly || event.button !== 0) return;
    event.stopPropagation();
    chairWasDraggedRef.current = false;
    setSelectedElementIds([element.id]);
    event.currentTarget.setPointerCapture(event.pointerId);
    setActiveInteraction({ type: "chair", deskId: element.id, seatIndex });
  }

  function beginGroupResize(event: ReactPointerEvent<HTMLButtonElement>) {
    if (readOnly || !selectedGroupBounds) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setActiveInteraction({
      type: "group-resize",
      bounds: selectedGroupBounds,
      origins: Object.fromEntries(
        selectedGroupElements.map((element) => [
          element.id,
          {
            x: element.x,
            y: element.y,
            width: element.width,
            height: element.height,
          },
        ]),
      ),
    });
  }

  function beginGroupRotate(event: ReactPointerEvent<HTMLButtonElement>) {
    if (readOnly || !selectedGroupBounds) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const center = {
      x: selectedGroupBounds.x + selectedGroupBounds.width / 2,
      y: selectedGroupBounds.y + selectedGroupBounds.height / 2,
    };
    setActiveInteraction({
      type: "group-rotate",
      center,
      startAngle: pointerAngleAt(event, center),
      origins: Object.fromEntries(
        selectedGroupElements.map((element) => [
          element.id,
          {
            x: element.x,
            y: element.y,
            width: element.width,
            height: element.height,
            rotation: element.rotation,
            centerX: element.x + element.width / 2,
            centerY: element.y + element.height / 2,
          },
        ]),
      ),
    });
  }

  function movePointer(event: ReactPointerEvent<HTMLDivElement>) {
    if (!interactionRef.current) return;
    pendingPointerRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      shiftKey: event.shiftKey,
    };
    if (pointerFrameRef.current != null) return;
    pointerFrameRef.current = requestAnimationFrame(() => {
      pointerFrameRef.current = null;
      const pending = pendingPointerRef.current;
      pendingPointerRef.current = null;
      if (pending) applyPointerMove(pending);
    });
  }

  function applyPointerMove(event: PointerCoordinates) {
    const interaction = interactionRef.current;
    if (!interaction) return;
    const point = canvasPoint(event);
    if (!point) return;

    if (interaction.type === "marquee") {
      const left = Math.min(interaction.start.x, point.x);
      const right = Math.max(interaction.start.x, point.x);
      const top = Math.min(interaction.start.y, point.y);
      const bottom = Math.max(interaction.start.y, point.y);
      const hits = desks
        .filter(
          (element) =>
            element.x + element.width >= left &&
            element.x <= right &&
            element.y + element.height >= top &&
            element.y <= bottom,
        )
        .map((element) => element.id);
      setSelectedElementIds([
        ...new Set([...interaction.baseSelection, ...hits]),
      ]);
      setActiveInteraction({ ...interaction, current: point });
      return;
    }

    if (interaction.type === "move") {
      const origins = Object.values(interaction.origins);
      if (!origins.length) return;
      const minDx = -Math.min(...origins.map((origin) => origin.x));
      const maxDx = Math.min(
        ...origins.map((origin) => 100 - origin.x - origin.width),
      );
      const minDy = -Math.min(...origins.map((origin) => origin.y));
      const maxDy = Math.min(
        ...origins.map((origin) => 100 - origin.y - origin.height),
      );
      const dx = clamp(point.x - interaction.start.x, minDx, maxDx);
      const dy = clamp(point.y - interaction.start.y, minDy, maxDy);
      setDesks((old) =>
        old.map((element) => {
          const origin = interaction.origins[element.id];
          return origin
            ? { ...element, x: origin.x + dx, y: origin.y + dy }
            : element;
        }),
      );
      return;
    }

    if (interaction.type === "group-resize") {
      const origins = Object.values(interaction.origins);
      if (!origins.length) return;
      const { bounds } = interaction;
      const minimumScaleX = Math.max(
        0.2,
        ...origins.map((origin) => 8 / origin.width),
      );
      const minimumScaleY = Math.max(
        0.2,
        ...origins.map((origin) => 8 / origin.height),
      );
      const maximumScaleX = (100 - bounds.x) / bounds.width;
      const maximumScaleY = (100 - bounds.y) / bounds.height;
      let scaleX = clamp(
        (point.x - bounds.x) / bounds.width,
        minimumScaleX,
        maximumScaleX,
      );
      let scaleY = clamp(
        (point.y - bounds.y) / bounds.height,
        minimumScaleY,
        maximumScaleY,
      );
      if (event.shiftKey) {
        const requested =
          Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY;
        const uniform = clamp(
          requested,
          Math.max(minimumScaleX, minimumScaleY),
          Math.min(maximumScaleX, maximumScaleY),
        );
        scaleX = uniform;
        scaleY = uniform;
      }
      setDesks((old) =>
        old.map((element) => {
          const origin = interaction.origins[element.id];
          return origin
            ? {
                ...element,
                x: bounds.x + (origin.x - bounds.x) * scaleX,
                y: bounds.y + (origin.y - bounds.y) * scaleY,
                width: origin.width * scaleX,
                height: origin.height * scaleY,
              }
            : element;
        }),
      );
      return;
    }

    if (interaction.type === "group-rotate") {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const delta = normalizeDegrees(
        pointerAngleAt(event, interaction.center) - interaction.startAngle,
      );
      const radians = (delta * Math.PI) / 180;
      const cosine = Math.cos(radians);
      const sine = Math.sin(radians);
      const proposed = new Map(
        Object.entries(interaction.origins).map(([id, origin]) => {
          const offsetX =
            ((origin.centerX - interaction.center.x) / 100) * rect.width;
          const offsetY =
            ((origin.centerY - interaction.center.y) / 100) * rect.height;
          const centerX =
            interaction.center.x +
            ((offsetX * cosine - offsetY * sine) / rect.width) * 100;
          const centerY =
            interaction.center.y +
            ((offsetX * sine + offsetY * cosine) / rect.height) * 100;
          return [
            id,
            {
              x: centerX - origin.width / 2,
              y: centerY - origin.height / 2,
              width: origin.width,
              height: origin.height,
              rotation: normalizeDegrees(origin.rotation + delta),
            },
          ] as const;
        }),
      );
      const proposedValues = [...proposed.values()];
      const proposedBounds = selectionBounds(proposedValues);
      const correctionX = proposedBounds
        ? proposedBounds.x < 0
          ? -proposedBounds.x
          : proposedBounds.x + proposedBounds.width > 100
            ? 100 - proposedBounds.x - proposedBounds.width
            : 0
        : 0;
      const correctionY = proposedBounds
        ? proposedBounds.y < 0
          ? -proposedBounds.y
          : proposedBounds.y + proposedBounds.height > 100
            ? 100 - proposedBounds.y - proposedBounds.height
            : 0
        : 0;
      setDesks((old) =>
        old.map((element) => {
          const next = proposed.get(element.id);
          return next
            ? {
                ...element,
                ...next,
                x: next.x + correctionX,
                y: next.y + correctionY,
              }
            : element;
        }),
      );
      return;
    }

    if (interaction.type === "chair") {
      const element = desks.find((item) => item.id === interaction.deskId);
      if (!element) return;
      const angle = normalizeDegrees(
        pointerAngle(event, element) - element.rotation,
      );
      const positions = chairAngles(element);
      const previous = positions[interaction.seatIndex];
      if (Math.abs(normalizeDegrees(angle - previous)) > 0.8) {
        chairWasDraggedRef.current = true;
      }
      positions[interaction.seatIndex] = angle;
      setDesks((old) =>
        old.map((item) =>
          item.id === interaction.deskId
            ? { ...item, chairPositions: positions }
            : item,
        ),
      );
      return;
    }

    if (interaction.type === "resize") {
      const element = desks.find((item) => item.id === interaction.id);
      if (!element) return;
      const width = clamp(
        interaction.width + point.x - interaction.start.x,
        8,
        Math.min(60, 100 - element.x),
      );
      const height = clamp(
        interaction.height + point.y - interaction.start.y,
        8,
        Math.min(60, 100 - element.y),
      );
      setDesks((old) =>
        old.map((item) =>
          item.id === interaction.id ? { ...item, width, height } : item,
        ),
      );
      return;
    }

    const element = desks.find((item) => item.id === interaction.id);
    if (!element) return;
    const delta = pointerAngle(event, element) - interaction.startAngle;
    const rotation = normalizeDegrees(interaction.rotation + delta);
    setDesks((old) =>
      old.map((item) =>
        item.id === interaction.id ? { ...item, rotation } : item,
      ),
    );
  }

  useEffect(() => {
    if (readOnly || layoutMode !== "custom") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const modifier = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        selectedElementIds.length
      ) {
        event.preventDefault();
        removeElements();
      } else if (modifier && key === "c" && selectedElementIds.length) {
        event.preventDefault();
        copySelection();
      } else if (modifier && key === "x" && selectedElementIds.length) {
        event.preventDefault();
        copySelection("Cut");
        removeElements();
      } else if (modifier && key === "v" && clipboardElements.length) {
        event.preventDefault();
        pasteElements();
      } else if (modifier && key === "d" && selectedElementIds.length) {
        event.preventDefault();
        duplicateSelection();
      } else if (event.key === "Escape") {
        setSelectedElementIds([]);
        cancelInteraction();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  async function saveLayout() {
    try {
      await updateChart.mutateAsync({
        id: classId,
        data: {
          rows,
          columns,
          layoutMode,
          desks:
            layoutMode === "custom"
              ? desks.map((element) =>
                  elementKind(element) === "desk"
                    ? { ...element, chairPositions: chairAngles(element) }
                    : element,
                )
              : [],
          assignments,
        },
      });
      await client.invalidateQueries({
        queryKey: getGetSeatingChartQueryKey(classId),
      });
      toast({ title: "Classroom saved" });
    } catch {
      toast({ title: "Could not save classroom", variant: "destructive" });
    }
  }

  async function generatePlan() {
    if (!plan.seatingPlanner) {
      setLocation("/settings");
      toast({
        title: "Casparel Pro required",
        description:
          "Seating-plan suggestions are included with Pro. Manual seating stays available on Free.",
      });
      return;
    }
    try {
      const suggestionPlan = await suggestPlan.mutateAsync({
        id: classId,
        data: { priorities: priorities.trim() || null },
      });
      setSuggestion(suggestionPlan);
      toast({
        title: "Seating suggestion ready",
        description: "Review every relationship and reason before applying it.",
      });
    } catch {
      toast({
        title: "Could not generate seating suggestion",
        variant: "destructive",
      });
    }
  }

  function useSuggestionDraft() {
    if (!suggestion) return;
    setRows(suggestion.rows);
    setColumns(suggestion.columns);
    setLayoutMode(suggestion.layoutMode);
    setDesks(suggestion.desks);
    setAssignments(
      suggestion.assignments.map(
        ({ userId, row, column, deskId, deskSeat }) => ({
          userId,
          row,
          column,
          deskId,
          deskSeat,
        }),
      ),
    );
    setSelectedElementIds([]);
    toast({ title: "Suggestion loaded as an editable draft" });
  }

  async function saveNote() {
    if (selectedId == null) return;
    try {
      await updateNote.mutateAsync({
        id: classId,
        userId: selectedId,
        data: { note: note.trim() || null },
      });
      await client.invalidateQueries({
        queryKey: getGetSeatingChartQueryKey(classId),
      });
      toast({ title: "Private note saved" });
    } catch {
      toast({ title: "Could not save note", variant: "destructive" });
    }
  }

  async function submitStudentSuggestion() {
    const message = studentSuggestion.trim();
    if (message.length < 3) return;
    setSuggestionPending(true);
    try {
      const response = await fetch(
        `/api/classes/${classId}/seating-suggestions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("schoolar_token")}`,
          },
          body: JSON.stringify({ message }),
        },
      );
      const result = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(result?.error || "Could not send suggestion");
      }
      setStudentSuggestion("");
      toast({
        title: "Suggestion sent",
        description: "Your teacher will see it in their activity feed.",
      });
    } catch (error) {
      toast({
        title: "Could not send suggestion",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSuggestionPending(false);
    }
  }

  if (isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (!chart) return null;

  const marquee = interaction?.type === "marquee" ? interaction : null;
  const marqueeStyle = marquee
    ? {
        left: `${Math.min(marquee.start.x, marquee.current.x)}%`,
        top: `${Math.min(marquee.start.y, marquee.current.y)}%`,
        width: `${Math.abs(marquee.current.x - marquee.start.x)}%`,
        height: `${Math.abs(marquee.current.y - marquee.start.y)}%`,
      }
    : undefined;

  return (
    <section className="space-y-4" data-testid="seating-chart-editor">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            {readOnly ? "Classroom seating" : "Classroom Designer"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {readOnly
              ? "View the complete seating plan. Only your teacher can edit it."
              : "Build the room, place students, and arrange furniture with precise top-view controls."}
          </p>
        </div>
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant={layoutMode === "grid" ? "default" : "outline"}
              size="sm"
              onClick={() => setLayoutMode("grid")}
            >
              <Grid3X3 className="mr-2 size-4" />
              Simple grid
            </Button>
            <Button
              variant={layoutMode === "custom" ? "default" : "outline"}
              size="sm"
              onClick={() => setLayoutMode("custom")}
            >
              <LayoutDashboard className="mr-2 size-4" />
              Design your own
            </Button>
            <Button onClick={saveLayout} disabled={updateChart.isPending}>
              <Save className="mr-2 size-4" />
              Save layout
            </Button>
          </div>
        )}
      </div>

      {!readOnly && layoutMode === "custom" && (
        <Card className="overflow-hidden">
          <CardContent className="space-y-4 p-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
              <PaletteGroup label="Add desks · chairs are connected">
                {SHAPES.map((shape) => (
                  <PaletteButton
                    key={shape}
                    label={shapeLabel(shape)}
                    icon={<Table2 className="size-4" />}
                    onClick={() => addElement("desk", shape)}
                  />
                ))}
              </PaletteGroup>
              <PaletteGroup label="Add classroom elements">
                <PaletteButton
                  label="Teacher place"
                  icon={<Presentation className="size-4" />}
                  onClick={() => addElement("teacherDesk")}
                />
                <PaletteButton
                  label="Podium / lectern"
                  icon={<Presentation className="size-4" />}
                  onClick={() => addElement("podium")}
                />
                <PaletteButton
                  label="Whiteboard / screen"
                  icon={<Monitor className="size-4" />}
                  onClick={() => addElement("board")}
                />
                <PaletteButton
                  label="Text"
                  icon={<TypeIcon className="size-4" />}
                  onClick={() => addElement("text")}
                />
              </PaletteGroup>
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/20 p-2.5">
              <div className="mr-auto flex min-w-48 items-center gap-2 px-1 text-xs text-muted-foreground">
                <MousePointer2 className="size-4 text-primary" />
                {selectedElementIds.length
                  ? `${selectedElementIds.length} element${selectedElementIds.length === 1 ? "" : "s"} selected`
                  : "Drag empty space to select a group"}
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={!selectedElementIds.length}
                onClick={() => copySelection()}
                title="Copy (⌘/Ctrl+C)"
              >
                <ClipboardCopy className="mr-1.5 size-3.5" />
                Copy
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!clipboardElements.length}
                onClick={() => pasteElements()}
                title="Paste (⌘/Ctrl+V)"
              >
                <ClipboardPaste className="mr-1.5 size-3.5" />
                Paste
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!selectedElementIds.length}
                onClick={duplicateSelection}
                title="Duplicate (⌘/Ctrl+D)"
              >
                <Copy className="mr-1.5 size-3.5" />
                Duplicate
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={!selectedElementIds.length}
                onClick={() => removeElements()}
                title="Delete selected elements"
              >
                <Trash2 className="mr-1.5 size-3.5" />
                Delete
              </Button>
            </div>

            {selectedElementIds.length > 1 && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
                <b>{selectedElementIds.length} elements selected.</b>{" "}
                <span className="text-muted-foreground">
                  Drag any selected element to move the group. Use the group
                  handles on the canvas to rotate or resize it; hold Shift while
                  resizing to preserve proportions, or resize freely to reshape
                  the arrangement.
                </span>
              </div>
            )}

            {selectedElement && (
              <div className="grid gap-3 rounded-xl border bg-muted/20 p-3 sm:grid-cols-2 xl:grid-cols-6">
                <div>
                  <Label>Label</Label>
                  <Input
                    value={selectedElement.label}
                    onChange={(event) =>
                      updateElement({ label: event.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Element</Label>
                  <div className="flex h-10 items-center rounded-md border bg-background px-3 text-sm font-medium">
                    {kindLabel(elementKind(selectedElement))}
                  </div>
                </div>
                {elementKind(selectedElement) === "desk" && (
                  <>
                    <div>
                      <Label>Shape</Label>
                      <select
                        className="h-10 w-full rounded-md border bg-background px-2 text-sm"
                        value={selectedElement.shape}
                        onChange={(event) => {
                          const shape = event.target
                            .value as ClassroomDesk["shape"];
                          updateElement({
                            shape,
                            ...(shape === "polygon"
                              ? { sides: selectedElement.sides ?? 6 }
                              : {}),
                            ...(shape === "trapezoid"
                              ? { angle: selectedElement.angle ?? 70 }
                              : {}),
                          });
                        }}
                      >
                        {SHAPES.map((shape) => (
                          <option key={shape} value={shape}>
                            {shapeLabel(shape)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label>Chairs</Label>
                      <Input
                        type="number"
                        min={0}
                        max={8}
                        value={selectedElement.capacity}
                        onChange={(event) =>
                          changeCapacity(Number(event.target.value))
                        }
                      />
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Use 0 for no chairs. Drag each chair around its desk; it
                        will always face inward.
                      </p>
                    </div>
                  </>
                )}
                {elementKind(selectedElement) === "chair" && (
                  <div>
                    <Label>Student places</Label>
                    <div className="flex h-10 items-center rounded-md border bg-background px-3 text-sm">
                      1 · fixed to chair
                    </div>
                  </div>
                )}
                <div>
                  <Label>Width · {Math.round(selectedElement.width)}%</Label>
                  <Input
                    type="range"
                    min={8}
                    max={Math.min(60, 100 - selectedElement.x)}
                    value={selectedElement.width}
                    onChange={(event) =>
                      updateElement({ width: Number(event.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label>Height · {Math.round(selectedElement.height)}%</Label>
                  <Input
                    type="range"
                    min={8}
                    max={Math.min(60, 100 - selectedElement.y)}
                    value={selectedElement.height}
                    onChange={(event) =>
                      updateElement({ height: Number(event.target.value) })
                    }
                  />
                </div>
                {selectedElement.shape === "polygon" &&
                  elementKind(selectedElement) === "desk" && (
                    <div>
                      <Label>Sides · {selectedElement.sides ?? 6}</Label>
                      <Input
                        type="range"
                        min={3}
                        max={12}
                        step={1}
                        value={selectedElement.sides ?? 6}
                        onChange={(event) =>
                          updateElement({ sides: Number(event.target.value) })
                        }
                      />
                    </div>
                  )}
                {selectedElement.shape === "trapezoid" &&
                  elementKind(selectedElement) === "desk" && (
                    <div>
                      <Label>Angle · {selectedElement.angle ?? 70}°</Label>
                      <Input
                        type="range"
                        min={25}
                        max={85}
                        step={1}
                        value={selectedElement.angle ?? 70}
                        onChange={(event) =>
                          updateElement({ angle: Number(event.target.value) })
                        }
                      />
                    </div>
                  )}
                <div>
                  <Label>
                    Rotation · {Math.round(selectedElement.rotation)}°
                  </Label>
                  <Input
                    type="range"
                    min={-180}
                    max={180}
                    step={5}
                    value={selectedElement.rotation}
                    onChange={(event) =>
                      updateElement({ rotation: Number(event.target.value) })
                    }
                  />
                </div>
              </div>
            )}

            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>Shift/⌘ click adds to selection</span>
              <span>Drag the corner to resize</span>
              <span>Drag the top handle to rotate</span>
              <span>Delete removes the selection</span>
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_310px]">
        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-muted/30 py-3">
            <div className="mx-auto flex w-2/3 items-center justify-center rounded-lg border bg-background py-2 text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground shadow-sm">
              Front
            </div>
          </CardHeader>
          {/*
            data-sideways: a room plan is as wide as the room. Five columns at
            a 104px minimum cannot fit a 375px phone and should not try -- this
            card scrolls, which is the right answer for a floor plan and the
            wrong one for almost anything else, so it says so explicitly rather
            than letting the fit audit infer it from an overflow-x that any
            container might carry as a precaution.
          */}
          <CardContent data-sideways className="overflow-x-auto p-3 sm:p-5">
            {layoutMode === "grid" ? (
              <>
                {!readOnly && (
                  <div className="mb-3 flex gap-2">
                    <div>
                      {/*
                        htmlFor and id, not a <Label> sitting beside a field.
                        Rendered on its own the word "Rows" is styled text: a
                        screen reader announces the number field with no name
                        at all, in a panel where two identical spinners sit
                        side by side.
                      */}
                      <Label className="text-xs" htmlFor="seating-rows">
                        Rows
                      </Label>
                      <Input
                        id="seating-rows"
                        type="number"
                        min={1}
                        max={10}
                        value={rows}
                        onChange={(event) =>
                          setRows(clamp(Number(event.target.value), 1, 10))
                        }
                        className="h-9 w-20"
                      />
                    </div>
                    <div>
                      <Label className="text-xs" htmlFor="seating-columns">
                        Columns
                      </Label>
                      <Input
                        id="seating-columns"
                        type="number"
                        min={1}
                        max={10}
                        value={columns}
                        onChange={(event) =>
                          setColumns(clamp(Number(event.target.value), 1, 10))
                        }
                        className="h-9 w-20"
                      />
                    </div>
                  </div>
                )}
                <div
                  className="grid min-w-max gap-3 rounded-xl border bg-[radial-gradient(circle_at_center,hsl(var(--border)/0.8)_1px,transparent_1px)] p-4 [background-size:20px_20px]"
                  style={{
                    gridTemplateColumns: `repeat(${columns}, minmax(104px, 1fr))`,
                  }}
                >
                  {Array.from({ length: rows * columns }).map((_, index) => {
                    const row = Math.floor(index / columns);
                    const column = index % columns;
                    const occupant = gridSeats.get(`${row}:${column}`);
                    const student =
                      occupant == null ? null : students.get(occupant);
                    return (
                      <button
                        key={`${row}:${column}`}
                        disabled={readOnly}
                        onClick={() => assignSeat({ row, column })}
                        className={`relative min-h-24 rounded-lg border-2 p-2 pt-4 text-left shadow-sm transition disabled:cursor-default ${
                          occupant === selectedId
                            ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                            : student
                              ? "border-border bg-gradient-to-b from-card to-muted/40 hover:border-primary/50"
                              : "border-dashed bg-muted/20 hover:border-primary/40"
                        }`}
                      >
                        <span className="absolute inset-x-3 top-1 h-1 rounded-full bg-border/80" />
                        <StudentSeat student={student} />
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="min-w-[760px]">
                {!readOnly && (
                  <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Move className="size-3.5" />
                    Drag furniture to move it, or drag a chair around its desk.
                    Chairs always face inward. Drag empty floor to select a
                    group.
                  </p>
                )}
                <div
                  ref={canvasRef}
                  tabIndex={readOnly ? -1 : 0}
                  onPointerDown={beginCanvasSelection}
                  onPointerMove={readOnly ? undefined : movePointer}
                  onPointerUp={
                    readOnly ? undefined : finishInteraction
                  }
                  onPointerCancel={
                    readOnly ? undefined : cancelInteraction
                  }
                  className="relative h-[620px] touch-none overflow-hidden rounded-2xl border-2 bg-[linear-gradient(145deg,hsl(var(--background)),hsl(var(--muted)/0.38)),radial-gradient(circle_at_center,hsl(var(--border)/0.85)_1px,transparent_1px)] shadow-inner outline-none [background-size:auto,20px_20px] focus-visible:ring-2 focus-visible:ring-primary/50"
                  aria-label="Classroom layout canvas"
                >
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-20 border-b border-dashed border-primary/10 bg-gradient-to-b from-primary/[0.04] to-transparent" />
                  {desks.length === 0 && (
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                      <LayoutDashboard className="size-8 opacity-40" />
                      Add a table or classroom element above to begin.
                    </div>
                  )}
                  {desks.map((element) => (
                    <ClassroomElement
                      key={element.id}
                      element={element}
                      seatNumberStart={seatNumberStarts.get(element.id) ?? 1}
                      selected={selectedElementSet.has(element.id)}
                      showHandles={
                        !readOnly &&
                        selectedElementIds.length === 1 &&
                        selectedElementIds[0] === element.id
                      }
                      readOnly={readOnly}
                      deskSeats={deskSeats}
                      students={students}
                      selectedStudentId={selectedId}
                      onBeginMove={beginMove}
                      onBeginChairMove={beginChairMove}
                      onBeginResize={beginResize}
                      onBeginRotate={beginRotate}
                      onAssignSeat={assignSeatFromChair}
                    />
                  ))}
                  {selectedGroupBounds && (
                    <div
                      className="pointer-events-none absolute z-40 border-2 border-primary bg-primary/[0.025] shadow-[0_0_0_3px_hsl(var(--primary)/0.12)]"
                      style={{
                        left: `${selectedGroupBounds.x}%`,
                        top: `${selectedGroupBounds.y}%`,
                        width: `${selectedGroupBounds.width}%`,
                        height: `${selectedGroupBounds.height}%`,
                      }}
                      role="group"
                      aria-label={`${selectedElementIds.length} selected classroom elements`}
                    >
                      <div className="absolute -top-9 left-1/2 h-8 w-px -translate-x-1/2 bg-primary" />
                      <button
                        type="button"
                        onPointerDown={beginGroupRotate}
                        className="pointer-events-auto absolute -top-12 left-1/2 flex size-8 -translate-x-1/2 items-center justify-center rounded-full border-2 border-primary bg-background text-primary shadow-md hover:scale-105"
                        title="Rotate selected group"
                        aria-label="Rotate selected group"
                      >
                        <RotateCw className="size-4" />
                      </button>
                      <button
                        type="button"
                        onPointerDown={beginGroupResize}
                        className="pointer-events-auto absolute -bottom-3 -right-3 flex size-7 items-center justify-center rounded-md border-2 border-primary bg-background text-primary shadow-md hover:scale-105"
                        title="Resize group · hold Shift to preserve proportions"
                        aria-label="Resize or reshape selected group"
                      >
                        <Maximize2 className="size-3.5" />
                      </button>
                    </div>
                  )}
                  {marqueeStyle && (
                    <div
                      className="pointer-events-none absolute z-50 border border-primary bg-primary/10 shadow-[0_0_0_1px_hsl(var(--primary)/0.15)]"
                      style={marqueeStyle}
                    />
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {readOnly ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <MessageSquare className="size-4" />
                  Suggest a change
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Your suggestion goes to the class teacher. It will not change
                  the chart automatically.
                </p>
                <Textarea
                  value={studentSuggestion}
                  onChange={(event) => setStudentSuggestion(event.target.value)}
                  maxLength={1000}
                  rows={5}
                  aria-label="Your seating suggestion for the teacher"
                  placeholder="Explain what you would like changed and why…"
                  data-testid="seating-suggestion-input"
                />
                <Button
                  className="w-full"
                  onClick={submitStudentSuggestion}
                  disabled={
                    suggestionPending || studentSuggestion.trim().length < 3
                  }
                  data-testid="submit-seating-suggestion"
                >
                  {suggestionPending ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 size-4" />
                  )}
                  Send suggestion
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Users className="size-4" />
                    Students to place
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex max-h-56 flex-wrap gap-2 overflow-y-auto">
                  {unseated.length ? (
                    unseated.map((student) => (
                      <button
                        key={student.userId}
                        onClick={() => setSelectedId(student.userId)}
                        className={`rounded-full border px-3 py-2 text-xs transition ${
                          selectedId === student.userId
                            ? "border-primary bg-primary text-primary-foreground"
                            : "bg-background hover:border-primary/50"
                        }`}
                        translate="no"
                      >
                        {student.name}
                      </button>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Everyone has a place.
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <ClipboardPen className="size-4" />
                    Individual student note
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {selected ? (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <b className="text-sm">{selected.name}</b>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setLocation(
                              `/profile/${selected.userId}?classId=${classId}`,
                            )
                          }
                        >
                          Open profile
                        </Button>
                      </div>
                      <Textarea
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        maxLength={2000}
                        rows={5}
                        placeholder="Example: He talks a lot with Jane. Keep him near the front."
                      />
                      <div className="flex gap-2">
                        <Button onClick={saveNote} className="flex-1">
                          Save private note
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() =>
                            setAssignments((old) =>
                              old.map((item) =>
                                item.userId === selectedId
                                  ? {
                                      ...item,
                                      row: null,
                                      column: null,
                                      deskId: null,
                                      deskSeat: null,
                                    }
                                  : item,
                              ),
                            )
                          }
                        >
                          Unseat
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Select a student to manage their note and placement.
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card className="border-primary/20">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Bot className="size-4 text-primary-text" />
                    Explainable seating assistant
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary-text">
                      Pro
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/*
                    Not "AI". The planner is deterministic -- pattern rules
                    over positions and notes, no model call -- which is why
                    the server's own refusal is careful never to call it AI.
                    Only the upsell did, which is the worst place for a claim
                    the product cannot back: it is the sentence somebody reads
                    immediately before paying.
                  */}
                  <p className="text-xs text-muted-foreground">
                    {plan.seatingPlanner
                      ? "Rule-based, not a model. Uses current positions, front distance, desk-mates, and private notes only when requested."
                      : "Seating suggestions require Pro. You can still design and assign every seat manually."}
                  </p>
                  <Textarea
                    value={priorities}
                    onChange={(event) => setPriorities(event.target.value)}
                    maxLength={1000}
                    rows={3}
                    // A placeholder is not a name: it disappears the moment
                    // somebody types, and it is never read as the field's
                    // label by anything.
                    aria-label="What the seating plan should prioritise"
                    placeholder="Optional priorities…"
                    disabled={!plan.seatingPlanner}
                  />
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={generatePlan}
                    disabled={suggestPlan.isPending}
                  >
                    {suggestPlan.isPending ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <Sparkles className="mr-2 size-4" />
                    )}
                    {plan.seatingPlanner
                      ? "Generate suggestion"
                      : "Unlock with Pro"}
                  </Button>
                  {suggestion && (
                    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
                      <p className="text-sm font-semibold">
                        {suggestion.summary}
                      </p>
                      <ul className="space-y-1 text-xs text-muted-foreground">
                        {suggestion.considerations.map((item) => (
                          <li key={item}>• {item}</li>
                        ))}
                      </ul>
                      <div className="max-h-64 space-y-2 overflow-y-auto">
                        {suggestion.assignments.map((item) => (
                          <div
                            key={item.userId}
                            className="rounded-md bg-background p-2 text-xs"
                          >
                            <p className="font-semibold">
                              {students.get(item.userId)?.name ??
                                `Student ${item.userId}`}
                            </p>
                            <p className="mt-1 text-muted-foreground">
                              {item.reason}
                            </p>
                          </div>
                        ))}
                      </div>
                      <Button
                        size="sm"
                        className="w-full"
                        onClick={useSuggestionDraft}
                      >
                        Use as editable draft
                      </Button>
                      <p className="text-[11px] text-muted-foreground">
                        Saving the layout is still required.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function PaletteGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function PaletteButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={onClick}
      className="capitalize"
    >
      <span className="mr-1.5 text-primary">{icon}</span>
      {label}
      <Plus className="ml-1.5 size-3 text-muted-foreground" />
    </Button>
  );
}

function ClassroomElement({
  element,
  seatNumberStart,
  selected,
  showHandles,
  readOnly,
  deskSeats,
  students,
  selectedStudentId,
  onBeginMove,
  onBeginChairMove,
  onBeginResize,
  onBeginRotate,
  onAssignSeat,
}: {
  element: ClassroomDesk;
  seatNumberStart: number;
  selected: boolean;
  showHandles: boolean;
  readOnly: boolean;
  deskSeats: ReadonlyMap<string, number>;
  students: ReadonlyMap<number, SeatStudent>;
  selectedStudentId: number | null;
  onBeginMove: (
    event: ReactPointerEvent<HTMLDivElement>,
    element: ClassroomDesk,
  ) => void;
  onBeginChairMove: (
    event: ReactPointerEvent<HTMLButtonElement>,
    element: ClassroomDesk,
    seatIndex: number,
  ) => void;
  onBeginResize: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onBeginRotate: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onAssignSeat: (target: { deskId: string; deskSeat: number }) => void;
}) {
  const kind = elementKind(element);
  const elementStyle: CSSProperties = {
    left: `${element.x}%`,
    top: `${element.y}%`,
    width: `${element.width}%`,
    height: `${element.height}%`,
    transform: `rotate(${element.rotation}deg)`,
    zIndex: selected ? 30 : kind === "text" ? 8 : 10,
  };

  return (
    <div
      className={`group absolute select-none ${readOnly ? "cursor-default" : "cursor-move"}`}
      style={elementStyle}
      onPointerDown={
        readOnly ? undefined : (event) => onBeginMove(event, element)
      }
      role={readOnly ? undefined : "button"}
      aria-label={`${kindLabel(kind)}: ${element.label}`}
      aria-selected={readOnly ? undefined : selected}
    >
      <ElementGraphic element={element} />

      {kind === "desk" &&
        Array.from({ length: element.capacity }, (_, seatIndex) => {
          const occupant = deskSeats.get(`${element.id}:${seatIndex}`);
          const student =
            occupant == null ? null : (students.get(occupant) ?? null);
          const angle = chairAngles(element)[seatIndex];
          const placement = chairPlacement(angle);
          return (
            <SeatControl
              key={seatIndex}
              style={placement.style}
              facingRotation={placement.facingRotation}
              student={student}
              seatNumber={seatNumberStart + seatIndex}
              selected={occupant === selectedStudentId}
              readOnly={readOnly}
              connected
              onPointerDown={(event) =>
                onBeginChairMove(event, element, seatIndex)
              }
              onClick={() =>
                onAssignSeat({ deskId: element.id, deskSeat: seatIndex })
              }
            />
          );
        })}

      {kind === "chair" && (
        <SeatControl
          style={{
            left: "50%",
            top: "54%",
            width: "74%",
            height: "58%",
            transform: "translate(-50%, -50%)",
          }}
          facingRotation={0}
          student={
            deskSeats.get(`${element.id}:0`) == null
              ? null
              : (students.get(deskSeats.get(`${element.id}:0`)!) ?? null)
          }
          seatNumber={seatNumberStart}
          selected={deskSeats.get(`${element.id}:0`) === selectedStudentId}
          readOnly={readOnly}
          integrated
          onClick={() => onAssignSeat({ deskId: element.id, deskSeat: 0 })}
        />
      )}

      {selected && (
        <div className="pointer-events-none absolute -inset-1.5 rounded-xl border-2 border-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.14)]" />
      )}

      {showHandles && (
        <>
          <div className="pointer-events-none absolute -top-8 left-1/2 h-7 w-px -translate-x-1/2 bg-primary" />
          <button
            type="button"
            onPointerDown={onBeginRotate}
            className="absolute -top-11 left-1/2 z-50 flex size-7 -translate-x-1/2 items-center justify-center rounded-full border-2 border-primary bg-background text-primary shadow-md hover:scale-105"
            title="Drag to rotate"
            aria-label="Rotate element"
          >
            <RotateCw className="size-3.5" />
          </button>
          <button
            type="button"
            onPointerDown={onBeginResize}
            className="absolute -bottom-2.5 -right-2.5 z-50 flex size-6 items-center justify-center rounded-md border-2 border-primary bg-background text-primary shadow-md hover:scale-105"
            title="Drag to resize"
            aria-label="Resize element"
          >
            <Maximize2 className="size-3" />
          </button>
        </>
      )}
    </div>
  );
}

/**
 * The furniture, drawn from above.
 *
 * These colours are fixed on purpose, and are the one place in this app that
 * does not follow the palette. A desk is a desk: paper is white, a monitor is
 * dark, a mug is not repainted because somebody chose a dark background. The
 * room plan reads as a picture of a room on either polarity, and the parts of
 * it that are interface rather than furniture -- the label chip, the selection
 * ring, the canvas behind it all -- do follow the palette.
 *
 * It used to hedge: `via-card` on the desk with a `dark:via-slate-800` beside
 * it. That variant never fired -- this app has no `.dark` class, see
 * darkVariantsCannotMatch.test.ts -- so the desk went half-dark on a dark
 * palette while every other surface of it stayed light. One object, one set of
 * colours.
 */
function ElementGraphic({ element }: { element: ClassroomDesk }) {
  const kind = elementKind(element);
  if (kind === "chair") {
    return <ChairGraphic />;
  }
  if (kind === "teacherDesk") {
    return (
      <div className="absolute inset-[2%] overflow-hidden rounded-xl border-2 border-slate-500/90 bg-gradient-to-b from-slate-50 via-slate-100 to-slate-200 shadow-[0_8px_16px_-10px_rgba(15,23,42,0.75)]">
        <div className="absolute inset-[4%] rounded-lg border border-slate-400/65 bg-white/25" />
        <div className="absolute left-[9%] top-[15%] h-[29%] w-[19%] -rotate-3 rounded-sm border border-slate-300 bg-white shadow-sm">
          <div className="absolute inset-x-[18%] top-[28%] h-px bg-slate-300" />
          <div className="absolute inset-x-[18%] top-[51%] h-px bg-slate-300" />
        </div>
        <div className="absolute left-1/2 top-[9%] h-[34%] w-[28%] -translate-x-1/2 rounded-md border-2 border-slate-700 bg-slate-800 shadow-sm">
          <div className="absolute inset-[8%] rounded-sm border border-sky-300/60 bg-gradient-to-br from-sky-100 to-slate-300" />
          <div className="absolute left-1/2 top-[5%] size-[3%] -translate-x-1/2 rounded-full bg-slate-400" />
        </div>
        <div className="absolute left-1/2 top-[45%] h-[11%] w-[34%] -translate-x-1/2 rounded-sm border border-slate-500 bg-slate-300 shadow-sm">
          <div className="absolute inset-x-[8%] top-1/2 border-t border-dashed border-slate-500/60" />
        </div>
        <div className="absolute right-[10%] top-[17%] size-[19%] rounded-full border-2 border-slate-400 bg-slate-100 shadow-sm">
          <div className="absolute inset-[23%] rounded-full border border-slate-400/70 bg-slate-50" />
          <div className="absolute -right-[19%] top-[31%] h-[38%] w-[28%] rounded-r-full border-2 border-l-0 border-slate-400" />
        </div>
        <span className="pointer-events-none absolute inset-x-[8%] bottom-[8%] truncate rounded-md border border-slate-400/60 bg-background/85 px-2 py-[3%] text-center text-[10px] font-bold text-foreground shadow-sm">
          {element.label}
        </span>
      </div>
    );
  }
  if (kind === "podium") {
    return (
      <div className="absolute inset-[1%] drop-shadow-[0_8px_7px_rgba(15,23,42,0.3)]">
        <svg
          aria-hidden="true"
          viewBox="0 0 180 130"
          preserveAspectRatio="none"
          className="absolute inset-0 size-full overflow-visible"
        >
          <polygon
            points="26,6 154,6 176,122 4,122"
            fill="#6f3e24"
            stroke="#422719"
            strokeWidth="5"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <polygon
            points="31,12 149,12 163,76 17,76"
            fill="#b97945"
            stroke="#d6a06f"
            strokeWidth="2"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <polygon
            points="17,76 163,76 169,116 11,116"
            fill="#87502f"
            stroke="#5d331f"
            strokeWidth="2"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d="M18 78 H162"
            fill="none"
            stroke="#e0ad79"
            strokeWidth="4"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          <g transform="rotate(-3 82 42)">
            <rect
              x="48"
              y="21"
              width="68"
              height="42"
              rx="4"
              fill="#fffdf8"
              stroke="#d8dee8"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d="M59 35 H104 M59 44 H101 M59 53 H91"
              fill="none"
              stroke="#a8b4c5"
              strokeWidth="2"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </g>
          <path
            d="M137 55 C137 35 139 23 151 21"
            fill="none"
            stroke="#26364b"
            strokeWidth="4"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          <ellipse
            cx="154"
            cy="19"
            rx="7"
            ry="5"
            fill="#26364b"
            transform="rotate(-12 154 19)"
          />
        </svg>
        <span className="pointer-events-none absolute inset-x-[15%] bottom-[10%] truncate text-center text-[10px] font-extrabold tracking-wide text-amber-50 drop-shadow-[0_1px_1px_rgba(30,15,8,0.9)]">
          {element.label}
        </span>
      </div>
    );
  }
  if (kind === "board") {
    return (
      <div className="absolute inset-0 rounded-md border-[3px] border-slate-500 bg-gradient-to-br from-white via-sky-50 to-slate-200 shadow-[0_6px_15px_-8px_rgba(15,23,42,0.8)]">
        <div className="absolute inset-[6%] rounded-sm border border-sky-200/60 bg-white/60" />
        <div className="absolute -bottom-[9%] left-[12%] right-[12%] h-[10%] rounded-b bg-slate-500 shadow-sm" />
        <ElementLabel label={element.label} className="text-slate-700" />
      </div>
    );
  }
  if (kind === "text") {
    return (
      <div className="absolute inset-0 flex items-center justify-center rounded-lg border border-dashed border-primary/35 bg-background/75 px-3 text-center shadow-sm backdrop-blur-sm">
        <span className="line-clamp-3 text-xs font-semibold text-foreground">
          {element.label || "Text label"}
        </span>
      </div>
    );
  }

  const rounding =
    element.shape === "round"
      ? "50%"
      : element.shape === "oval"
        ? "45%"
        : "12px";
  return (
    <div
      className="absolute inset-0 overflow-hidden border-2 border-border bg-card shadow-md"
      style={{ borderRadius: rounding, clipPath: deskClipPath(element) }}
    >
      <div
        className="absolute inset-[5%] border border-border/60 bg-muted/15"
        style={{ borderRadius: rounding }}
      />
      <ElementLabel label={element.label} />
    </div>
  );
}

function ChairGraphic({
  occupied = false,
  selected = false,
}: {
  occupied?: boolean;
  selected?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 rounded-[28%] border-2 bg-gradient-to-b from-slate-100 via-slate-200 to-slate-400 shadow-[0_7px_12px_-7px_rgba(15,23,42,0.75)] ${
        selected
          ? "border-primary ring-2 ring-primary/35"
          : occupied
            ? "border-primary/70"
            : "border-slate-500/80"
      }`}
    >
      <span className="absolute inset-x-[17%] top-[18%] bottom-[22%] rounded-[24%] border border-white/50 bg-white/25 shadow-inner" />
      <span className="absolute left-1/2 top-[5%] h-0 w-0 -translate-x-1/2 border-x-[5px] border-b-[7px] border-x-transparent border-b-primary/80 drop-shadow-sm" />
      <span className="absolute inset-x-[8%] bottom-[5%] h-[17%] rounded-full border border-slate-700/70 bg-slate-600 shadow-sm" />
      <span className="absolute bottom-[14%] left-[11%] h-[18%] w-[7%] rounded-full bg-slate-600" />
      <span className="absolute bottom-[14%] right-[11%] h-[18%] w-[7%] rounded-full bg-slate-600" />
    </span>
  );
}

function ElementLabel({
  label,
  className = "",
}: {
  label: string;
  className?: string;
}) {
  return (
    <span
      className={`pointer-events-none absolute inset-x-[8%] top-1/2 -translate-y-1/2 truncate text-center text-[10px] font-bold text-slate-950 drop-shadow-[0_1px_0_rgba(255,255,255,0.65)] ${className}`}
    >
      {label}
    </span>
  );
}

function SeatControl({
  style,
  facingRotation,
  student,
  seatNumber,
  selected,
  readOnly,
  integrated = false,
  connected = false,
  onPointerDown,
  onClick,
}: {
  style: CSSProperties;
  facingRotation: number;
  student: SeatStudent | null;
  seatNumber: number;
  selected: boolean;
  readOnly: boolean;
  integrated?: boolean;
  connected?: boolean;
  onPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onClick: () => void;
}) {
  const label = student?.name ?? `Empty chair ${seatNumber}`;
  return (
    <button
      type="button"
      disabled={readOnly}
      onPointerDown={(event) => {
        event.stopPropagation();
        onPointerDown?.(event);
      }}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      title={connected ? `${label} · facing desk · drag to reposition` : label}
      aria-label={
        connected ? `${label}, facing desk. Drag to reposition.` : label
      }
      className={`absolute z-40 flex items-center justify-center overflow-visible text-[9px] font-bold transition disabled:cursor-default ${
        connected
          ? "size-9 cursor-grab border-0 bg-transparent shadow-none active:cursor-grabbing"
          : integrated
            ? "rounded-[24%] border border-slate-400 bg-background/80 shadow-sm"
            : "size-8 rounded-[28%] border border-slate-400 bg-background shadow-md"
      }`}
      style={style}
    >
      {connected && (
        <ChairGraphic occupied={Boolean(student)} selected={selected} />
      )}
      <span
        className={`relative z-10 flex items-center justify-center ${
          connected
            ? "size-5 rounded-full bg-background/90 text-[8px] text-foreground shadow-sm"
            : "size-full"
        }`}
        style={
          connected ? { transform: `rotate(${-facingRotation}deg)` } : undefined
        }
      >
        {student?.avatarUrl ? (
          <img
            src={student.avatarUrl}
            alt=""
            className="size-full rounded-[inherit] object-cover"
          />
        ) : student ? (
          student.name.slice(0, 2).toUpperCase()
        ) : (
          seatNumber
        )}
      </span>
    </button>
  );
}

function StudentSeat({ student }: { student?: SeatStudent | null }) {
  if (!student) {
    return (
      <span className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Empty seat
      </span>
    );
  }
  return (
    <div className="flex items-center gap-2">
      {student.avatarUrl ? (
        <img
          src={student.avatarUrl}
          alt=""
          className="size-8 rounded-full object-cover"
        />
      ) : (
        <span className="flex size-8 items-center justify-center rounded-full bg-primary/10">
          <UserRound className="size-4" />
        </span>
      )}
      <span translate="no" className="line-clamp-2 text-xs font-semibold">{student.name}</span>
    </div>
  );
}
