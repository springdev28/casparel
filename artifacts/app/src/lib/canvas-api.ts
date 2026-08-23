/**
 * @fileOverview Web domain role: gives Canvas graph concepts concise names while reusing the generated API contract types.
 * System connection: CanvasPage consumes these aliases for React Flow state; network operations come directly from @workspace/api-client-react.
 */
import type {
  CanvasCollaborator as GeneratedCanvasCollaborator,
  CanvasDocument as GeneratedCanvasDocument,
  CanvasEdge as GeneratedCanvasEdge,
  CanvasNode as GeneratedCanvasNode,
  CanvasNodeData,
  CanvasView,
} from "@workspace/api-client-react";

export type StudyNodeData = CanvasNodeData & Record<string, unknown>;
export type StoredCanvasNode = GeneratedCanvasNode;
export type StoredCanvasEdge = GeneratedCanvasEdge;
export type CanvasDocument = GeneratedCanvasDocument;
export type CanvasCollaborator = GeneratedCanvasCollaborator;

/**
 * Both authenticated and public Canvas responses share this shape. Public links
 * intentionally omit the secret token, so callers must treat it as optional.
 */
export type SchoolarCanvas = CanvasView & { shareToken?: string | null };
