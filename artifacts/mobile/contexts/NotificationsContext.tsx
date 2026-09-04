import React, { createContext, useCallback, useContext, useEffect, useMemo } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { apiOrigin } from "@/utils/api-host";

export type NotificationPreferences = {
  enabled: boolean;
  messages: boolean;
  classes: boolean;
  activities: boolean;
  goals: boolean;
  schedule: boolean;
  account: boolean;
  announcements: boolean;
};

type NotificationsContextValue = {
  /**
   * Bring the device's push registration in line with the account's saved
   * preferences. `promptIfNeeded` decides whether the system permission
   * sheet may be raised: only a deliberate action by the person — turning
   * notifications on in Settings — passes true.
   */
  sync: (
    preferences: NotificationPreferences,
    options?: { promptIfNeeded?: boolean },
  ) => Promise<void>;
};
const NotificationsContext = createContext<NotificationsContextValue>({ sync: async () => {} });

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { token, isAuthenticated } = useAuth();
  const router = useRouter();
  const headers = useMemo(() => ({
    "content-type": "application/json",
    Authorization: `Bearer ${token ?? ""}`,
  }), [token]);

  const sync = useCallback(async (
    preferences: NotificationPreferences,
    options?: { promptIfNeeded?: boolean },
  ) => {
    if (!token || Platform.OS === "web") return;
    if (!preferences.enabled) {
      await fetch(`${apiOrigin}/api/users/me/push-token`, { method: "DELETE", headers }).catch(() => undefined);
      return;
    }
    /*
     * Android may only be asked once, so the ask has to be worth spending.
     *
     * This used to run on every launch straight after sign-in, which put the
     * system sheet in front of somebody who had not yet seen the app and had
     * no idea what they were being asked to allow. Declining there is
     * permanent for practical purposes.
     *
     * So a launch only ever registers a token for permission the person has
     * already granted; the sheet is raised when they turn notifications on in
     * Settings, which is the moment they have said what they want.
     */
    const current = await Notifications.getPermissionsAsync();
    const permission = current.granted
      ? current
      : options?.promptIfNeeded && current.canAskAgain !== false
        ? await Notifications.requestPermissionsAsync()
        : current;
    if (!permission.granted) return;
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Casparel",
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 180, 120, 180],
      });
    }
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return;
    const pushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await fetch(`${apiOrigin}/api/users/me/push-token`, {
      method: "POST",
      headers,
      body: JSON.stringify({ token: pushToken, platform: Platform.OS === "ios" ? "ios" : "android" }),
    });
  }, [headers, token]);

  useEffect(() => {
    if (!isAuthenticated || !token) return;
    void fetch(`${apiOrigin}/api/users/me/preferences`, { headers })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => sync(data.notificationPreferences))
      .catch(() => undefined);
  }, [headers, isAuthenticated, sync, token]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const path = response.notification.request.content.data?.path;
      if (typeof path === "string" && path.startsWith("/") && !path.startsWith("//")) {
        router.push({ pathname: "/mobile", params: { path } });
      }
    });
    return () => subscription.remove();
  }, [router]);

  return <NotificationsContext.Provider value={{ sync }}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  return useContext(NotificationsContext);
}
