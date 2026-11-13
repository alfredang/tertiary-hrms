"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function ThemeCard() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const current = mounted && resolvedTheme === "dark" ? "dark" : "light";
  return (
    <Card className="bg-gray-950 border-gray-800">
      <CardHeader><CardTitle>Appearance</CardTitle></CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-gray-400">Light is the default. Your choice is saved on this device.</p>
        <div className="grid max-w-md grid-cols-2 gap-3" role="group" aria-label="Appearance">
          <Button disabled={!mounted} variant={current === "light" ? "default" : "outline"} aria-pressed={current === "light"}
            className="justify-start gap-2" onClick={() => setTheme("light")}>
            <Sun className="h-4 w-4" />Light (default)
          </Button>
          <Button disabled={!mounted} variant={current === "dark" ? "default" : "outline"} aria-pressed={current === "dark"}
            className="justify-start gap-2" onClick={() => setTheme("dark")}>
            <Moon className="h-4 w-4" />Dark
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
