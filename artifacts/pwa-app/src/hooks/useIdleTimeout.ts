import { useEffect, useRef, useCallback } from "react";

const IDLE_EVENTS = ["mousemove", "keydown", "mousedown", "touchstart", "scroll"] as const;

export function useIdleTimeout(timeoutMs: number, onTimeout: () => void): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  const reset = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onTimeoutRef.current(), timeoutMs);
  }, [timeoutMs]);

  useEffect(() => {
    reset();
    IDLE_EVENTS.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      IDLE_EVENTS.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [reset]);
}
