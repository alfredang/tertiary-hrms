"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const THRESHOLD = 80;
const MAX_PULL = 120;

export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startY = useRef(0);
  const pulling = useRef(false);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (isRefreshing) return;
      // Only activate when scrolled to top
      if (window.scrollY <= 0) {
        startY.current = e.touches[0].clientY;
        pulling.current = true;
      }
    },
    [isRefreshing]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!pulling.current || isRefreshing) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta > 0) {
        setPullDistance(Math.min(delta * 0.4, MAX_PULL));
      } else {
        // Scrolling up — cancel pull
        pulling.current = false;
        setPullDistance(0);
      }
    },
    [isRefreshing]
  );

  const handleTouchEnd = useCallback(() => {
    if (!pulling.current) return;
    pulling.current = false;

    if (pullDistance >= THRESHOLD) {
      setIsRefreshing(true);
      setPullDistance(0);
      router.refresh();
      setTimeout(() => setIsRefreshing(false), 1000);
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, router]);

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ overscrollBehaviorY: "contain" }}
    >
      {/* Pull indicator */}
      <div
        className={cn(
          "flex items-center justify-center overflow-hidden transition-[height] duration-200",
          isRefreshing && "h-10",
          !isRefreshing && pullDistance === 0 && "h-0"
        )}
        style={
          !isRefreshing && pullDistance > 0
            ? { height: pullDistance, transition: "none" }
            : undefined
        }
      >
        <RefreshCw
          className={cn(
            "h-5 w-5 text-gray-400",
            isRefreshing && "animate-spin text-primary",
            !isRefreshing && pullDistance >= THRESHOLD && "text-primary"
          )}
          style={
            !isRefreshing
              ? { transform: `rotate(${pullDistance * 3}deg)` }
              : undefined
          }
        />
        {!isRefreshing && pullDistance >= THRESHOLD && (
          <span className="ml-2 text-xs text-primary">Release to refresh</span>
        )}
      </div>
      {children}
    </div>
  );
}
