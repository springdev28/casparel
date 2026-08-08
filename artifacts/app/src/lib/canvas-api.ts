export type StudyNodeData = {
  kind: "note" | "heading" | "link" | "resource";
  title: string;
  text?: string;
  url?: string;
  resourceId?: number;
  color?: string;
};

export type StoredCanvasNode = {
  id: string;
  type: "study";
  position: { x: number; y: number };
  data: StudyNodeData;
};

export type StoredCanvasEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
};

export type CanvasDocument = {
  nodes: StoredCanvasNode[];
  edges: StoredCanvasEdge[];
  viewport?: { x: number; y: number; zoom: number };
};

export type CanvasPermissions = {
  canView: boolean;
  canEdit: boolean;
  canManage: boolean;
  role: "owner" | "editor" | "viewer" | "class-editor" | "class-viewer";
};

export type SchoolarCanvas = {
  id: number;
  title: string;
  description: string | null;
  ownerId: number;
  classId: number | null;
  visibility: "private" | "people" | "class" | "link";
  classAccess: "view" | "edit";
  shareToken: string | null;
  document: CanvasDocument;
  version: number;
  createdAt: string;
  updatedAt: string;
  owner: { id: number; name: string } | null;
  class: { id: number; name: string } | null;
  collaboratorCount: number;
  permissions: CanvasPermissions;
};

export type CanvasCollaborator = {
  userId: number;
  role: "viewer" | "editor";
  createdAt: string;
  name: string;
  email: string;
  avatarUrl: string | null;
};

export type CanvasConflict = Error & { current?: SchoolarCanvas };

function canvasApiUrl(path: string) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${base}/api${path}`;
}

export async function canvasRequest<T>(
  path: string,
  init: RequestInit = {},
  authenticated = true,
): Promise<T> {
  const response = await fetch(canvasApiUrl(path), {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(authenticated
        ? { Authorization: `Bearer ${localStorage.getItem("schoolar_token")}` }
        : {}),
      ...init.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    current?: SchoolarCanvas;
  };
  if (!response.ok) {
    const error = new Error(payload.error ?? "Canvas request failed") as CanvasConflict;
    error.current = payload.current;
    throw error;
  }
  return payload as T;
}
