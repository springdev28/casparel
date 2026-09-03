import { eq } from "drizzle-orm";
import {
  db,
  pushDeviceTokensTable,
  userPreferencesTable,
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from "@workspace/db";

export type NotificationCategory = Exclude<keyof NotificationPreferences, "enabled">;

export async function sendPushNotification(
  userId: number,
  category: NotificationCategory,
  title: string,
  body: string,
  path: string,
): Promise<void> {
  const [preferences] = await db
    .select({ notificationPreferences: userPreferencesTable.notificationPreferences })
    .from(userPreferencesTable)
    .where(eq(userPreferencesTable.userId, userId));
  const selected = { ...DEFAULT_NOTIFICATION_PREFERENCES, ...preferences?.notificationPreferences };
  if (!selected.enabled || !selected[category]) return;
  const devices = await db
    .select({ token: pushDeviceTokensTable.token })
    .from(pushDeviceTokensTable)
    .where(eq(pushDeviceTokensTable.userId, userId));
  if (!devices.length) return;
  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(devices.map(({ token }) => ({
      to: token,
      title,
      body,
      sound: "default",
      data: { path },
      channelId: "default",
    }))),
  });
  if (!response.ok) throw new Error(`Expo push delivery failed with ${response.status}`);
}
