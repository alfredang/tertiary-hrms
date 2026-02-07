import { Capacitor } from "@capacitor/core";

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

export function getPlatform(): "ios" | "android" | "web" {
  return Capacitor.getPlatform() as "ios" | "android" | "web";
}
