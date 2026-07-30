// Coarse device label for the admin dashboard — mirrors the same
// browser/OS-labeling spirit as the-daily-cock/js/storage.js's detectDevice()
// for its web target (react-native-web really does run in a DOM, so the
// same UA parsing applies there); native iOS/Android use Platform instead.
import { Platform } from "react-native";

export function detectDevice(): string {
  if (Platform.OS === "ios") return `iOS ${Platform.Version}`;
  if (Platform.OS === "android") return `Android ${Platform.Version}`;
  if (Platform.OS === "web" && typeof navigator !== "undefined") {
    try {
      const ua = navigator.userAgent;
      let browser = "Unknown browser";
      if (/Edg\//.test(ua)) browser = "Edge";
      else if (/OPR\//.test(ua)) browser = "Opera";
      else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser = "Chrome";
      else if (/Firefox\//.test(ua)) browser = "Firefox";
      else if (/Safari\//.test(ua)) browser = "Safari";
      let os = "unknown OS";
      if (/iPhone|iPad|iPod/.test(ua)) os = "iOS";
      else if (/Android/.test(ua)) os = "Android";
      else if (/Mac OS X/.test(ua)) os = "macOS";
      else if (/Windows/.test(ua)) os = "Windows";
      else if (/Linux/.test(ua)) os = "Linux";
      return `${browser} on ${os} (web)`;
    } catch {
      return "web";
    }
  }
  return Platform.OS;
}
