"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";

export function ThemeCard() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const current = mounted ? (theme === "light" ? "light" : "dark") : "dark";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Theme</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-400 mb-4">
          Choose your appearance preference. Dark mode is the default.
        </p>
        <div className="grid grid-cols-2 gap-3 max-w-md">
          <Button
            variant={current === "dark" ? "default" : "outline"}
            onClick={() => setTheme("dark")}
            className="justify-start gap-2"
          >
            <Moon className="h-4 w-4" />
            Dark
          </Button>
          <Button
            variant={current === "light" ? "default" : "outline"}
            onClick={() => setTheme("light")}
            className="justify-start gap-2"
          >
            <Sun className="h-4 w-4" />
            Light
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
