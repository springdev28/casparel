/** Byte-based storage accounting and enforcement for persisted uploads. */
import type { Response } from "express";
import { pool } from "@workspace/db";
import {
  INSTITUTIONAL_STARTER,
  PLAN_CATALOG,
  formatStorage,
} from "@workspace/plan-economics";
import { resolveAccountPlan, TIER_LABELS } from "./entitlements";

export interface StorageDecision {
  allowed: boolean;
  usedBytes: number;
  limitBytes: number | null;
  remainingBytes: number | null;
}

/** Physical characters stored by a base64 field for a binary upload. */
export function base64StoredBytes(binaryBytes: number): number {
  return Math.ceil(Math.max(0, binaryBytes) / 3) * 4;
}

async function ownedStorageBytes(
  userId: number,
  allInstitutionalSeats: boolean,
): Promise<number> {
  const result = await pool.query<{ bytes: string }>(
    `WITH owners AS (
       SELECT id FROM users
       WHERE ($2::boolean = FALSE AND id = $1)
          OR ($2::boolean = TRUE
              AND plan = 'institutional'
              AND (plan_expires_at IS NULL OR plan_expires_at > NOW()))
     ), stored AS (
       SELECT COALESCE(SUM(octet_length(COALESCE(avatar_url, ''))), 0)::bigint AS bytes
         FROM users WHERE id IN (SELECT id FROM owners)
       UNION ALL
       SELECT COALESCE(SUM(pg_column_size(cards)), 0)::bigint
         FROM study_activities WHERE owner_id IN (SELECT id FROM owners)
       UNION ALL
       SELECT COALESCE(SUM(pg_column_size(document)), 0)::bigint
         FROM canvases WHERE owner_id IN (SELECT id FROM owners)
       UNION ALL
       SELECT COALESCE(SUM(octet_length(COALESCE(file_base64, ''))), 0)::bigint
         FROM forum_materials WHERE uploader_id IN (SELECT id FROM owners)
       UNION ALL
       SELECT COALESCE(SUM(octet_length(COALESCE(attachment_file_base64, ''))), 0)::bigint
         FROM forum_posts WHERE author_id IN (SELECT id FROM owners)
     ) SELECT COALESCE(SUM(bytes), 0)::text AS bytes FROM stored`,
    [userId, allInstitutionalSeats],
  );
  return Number(result.rows[0]?.bytes ?? 0);
}

export async function accountStorage(
  userId: number,
  additionalBytes = 0,
): Promise<StorageDecision> {
  const { entitlements, isAdmin } = await resolveAccountPlan(userId);
  if (isAdmin) {
    return { allowed: true, usedBytes: 0, limitBytes: null, remainingBytes: null };
  }
  const institutional = entitlements.tier === "institutional";
  const limitBytes = institutional
    ? INSTITUTIONAL_STARTER.storageBytes
    : PLAN_CATALOG[entitlements.tier].storageBytes;
  const usedBytes = await ownedStorageBytes(userId, institutional);
  return {
    allowed: usedBytes + Math.max(0, additionalBytes) <= limitBytes,
    usedBytes,
    limitBytes,
    remainingBytes: Math.max(0, limitBytes - usedBytes),
  };
}

export async function ensureStorageCapacity(
  res: Response,
  userId: number,
  additionalBytes: number,
): Promise<boolean> {
  const decision = await accountStorage(userId, additionalBytes);
  if (decision.allowed) return true;
  const { entitlements } = await resolveAccountPlan(userId);
  res.status(402).json({
    error:
      `Casparel ${TIER_LABELS[entitlements.tier]} includes ` +
      `${formatStorage(decision.limitBytes ?? 0)} of stored uploads. ` +
      "Remove files or upgrade before adding this upload.",
    code: "STORAGE_LIMIT_REACHED",
    usedBytes: decision.usedBytes,
    limitBytes: decision.limitBytes,
    requiredBytes: additionalBytes,
  });
  return false;
}
