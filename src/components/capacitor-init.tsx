"use client";

import { useEffect } from "react";

export function CapacitorInit() {
  useEffect(() => {
    async function init() {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (Capacitor.isNativePlatform()) {
          document.body.classList.add("capacitor");
          document.body.classList.add(`platform-${Capacitor.getPlatform()}`);

          // Configure status bar on native platforms
          const { StatusBar, Style } = await import("@capacitor/status-bar");
          await StatusBar.setStyle({ style: Style.Light });

          if (Capacitor.getPlatform() === "android") {
            await StatusBar.setBackgroundColor({ color: "#6366f1" });
          }
        }
      } catch {
        // Not running in Capacitor - silently ignore
      }
    }

    init();
  }, []);

  return null;
}
