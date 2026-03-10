import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box, CircularProgress } from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";

interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void;
  /** Ref to the Virtuoso element so we can check scrollTop before activating */
  scrollRef?: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
}

const PULL_THRESHOLD = 72; // px of pull needed to trigger refresh
const MAX_PULL = 100;       // cap the visual pull distance

/**
 * PullToRefresh — wraps a feed and detects a downward pull gesture.
 *
 * Activation rules:
 *  - Only activates when the inner scroll container is at the very top (scrollTop ≈ 0)
 *  - Works with both touch (mobile) and mouse (desktop)
 *  - Shows a growing CircularProgress / RefreshIcon indicator
 *  - Calls onRefresh() when pull exceeds PULL_THRESHOLD and finger is released
 */
const PullToRefresh: React.FC<PullToRefreshProps> = ({
  onRefresh,
  scrollRef,
  children,
}) => {
  const [pullY, setPullY] = useState(0);       // current visual pull distance (0–MAX_PULL)
  const [refreshing, setRefreshing] = useState(false);

  const startYRef = useRef<number | null>(null);
  const activeRef = useRef(false); // true once we've confirmed a downward pull at top

  const isAtTop = useCallback(() => {
    const el = scrollRef?.current;
    return !el || el.scrollTop <= 2;
  }, [scrollRef]);

  const startPull = useCallback((clientY: number) => {
    if (!isAtTop()) return;
    startYRef.current = clientY;
    activeRef.current = false;
  }, [isAtTop]);

  const movePull = useCallback((clientY: number) => {
    if (startYRef.current === null || refreshing) return;
    const delta = clientY - startYRef.current;
    if (delta <= 0) {
      activeRef.current = false;
      setPullY(0);
      return;
    }
    // Only lock in pull direction once we've confirmed downward motion at top
    if (!activeRef.current) {
      if (!isAtTop()) { startYRef.current = null; return; }
      activeRef.current = true;
    }
    setPullY(Math.min(delta * 0.5, MAX_PULL)); // dampen with 0.5x ratio
  }, [refreshing, isAtTop]);

  const endPull = useCallback(async () => {
    if (!activeRef.current) { startYRef.current = null; return; }
    const triggered = pullY >= PULL_THRESHOLD;
    activeRef.current = false;
    startYRef.current = null;
    setPullY(0);
    if (triggered && !refreshing) {
      setRefreshing(true);
      try { await onRefresh(); } finally { setRefreshing(false); }
    }
  }, [pullY, refreshing, onRefresh]);

  // Touch events
  const onTouchStart = useCallback((e: TouchEvent) => startPull(e.touches[0].clientY), [startPull]);
  const onTouchMove = useCallback((e: TouchEvent) => {
    if (activeRef.current) e.preventDefault(); // block native scroll while pulling
    movePull(e.touches[0].clientY);
  }, [movePull]);
  const onTouchEnd = useCallback(() => endPull(), [endPull]);

  // Mouse events (desktop)
  const onMouseDown = useCallback((e: MouseEvent) => startPull(e.clientY), [startPull]);
  const onMouseMove = useCallback((e: MouseEvent) => movePull(e.clientY), [movePull]);
  const onMouseUp = useCallback(() => endPull(), [endPull]);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("mousedown", onMouseDown);

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("mousedown", onMouseDown);
    };
  }, [onTouchStart, onTouchMove, onTouchEnd, onMouseDown]);

  useEffect(() => {
    if (pullY > 0 || refreshing) {
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [pullY, refreshing, onMouseMove, onMouseUp]);

  const indicatorProgress = Math.min(pullY / PULL_THRESHOLD, 1);
  const showIndicator = pullY > 4 || refreshing;

  return (
    <div ref={containerRef} style={{ height: "100%", position: "relative" }}>
      {/* Pull indicator */}
      <Box
        sx={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: showIndicator ? Math.max(pullY, refreshing ? 48 : 0) : 0,
          overflow: "hidden",
          transition: pullY === 0 ? "height 0.25s ease" : "none",
          zIndex: 10,
          pointerEvents: "none",
        }}
      >
        {refreshing ? (
          <CircularProgress size={28} thickness={4} />
        ) : (
          <RefreshIcon
            sx={{
              fontSize: 28,
              opacity: indicatorProgress,
              transform: `rotate(${indicatorProgress * 360}deg) scale(${0.5 + indicatorProgress * 0.5})`,
              color: indicatorProgress >= 1 ? "primary.main" : "text.secondary",
              transition: "color 0.15s",
            }}
          />
        )}
      </Box>

      {/* Feed content, pushed down by pull distance */}
      <Box
        sx={{
          height: "100%",
          transform: `translateY(${refreshing ? 48 : pullY}px)`,
          transition: pullY === 0 ? "transform 0.25s ease" : "none",
        }}
      >
        {children}
      </Box>
    </div>
  );
};

export default PullToRefresh;
