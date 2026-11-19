"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { type Appearance, isAppearance } from "@/lib/appearance";

const OPTIONS: { value: Appearance; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

export function ThemeCard() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  // The saved choice lives in the browser, so it is only known after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const current: Appearance | null = mounted && isAppearance(theme) ? theme : null;

  return (
    <Card className="bg-gray-950 border-gray-800">
      <CardHeader><CardTitle>Appearance</CardTitle></CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-gray-400">
          System follows your device&apos;s light or dark setting. Your choice is saved in this browser.
        </p>
        <div className="grid max-w-lg grid-cols-3 gap-3" role="radiogroup" aria-label="Appearance">
          {OPTIONS.map(({ value, label, icon: Icon }) => (
            <Button key={value} type="button" role="radio" aria-checked={current === value} disabled={!mounted}
              variant={current === value ? "default" : "outline"} className="justify-center gap-2"
              onClick={() => setTheme(value)}>
              <Icon className="h-4 w-4" />{label}
            </Button>
          ))}
        </div>
        {current === "system" && (
          <p className="mt-3 text-xs text-gray-500">Your device is currently set to {resolvedTheme === "dark" ? "dark" : "light"}.</p>
        )}
      </CardContent>
    </Card>
  );
}
