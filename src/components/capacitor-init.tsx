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

          // Initialize Google Auth plugin for native sign-in
          try {
            const { GoogleAuth } = await import(
              "@codetrix-studio/capacitor-google-auth"
            );
            GoogleAuth.initialize();
          } catch {
            console.warn("Google Auth plugin not available");
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
