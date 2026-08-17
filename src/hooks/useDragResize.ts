"use client";

import { useCallback, useRef, useState } from "react";

interface Options {
  /** Drag axis: 'x' for a vertical divider, 'y' for a horizontal one. */
  axis: "x" | "y";
  initial: number;
  min: number;
  max: number;
  /** Invert delta (e.g. a pane docked on the right/bottom grows as you drag toward it). */
  invert?: boolean;
}

/**
 * Minimal pointer-driven resize for split panes. Returns the current size and a
 * pointer-down handler to attach to the divider.
 */
export function useDragResize({ axis, initial, min, max, invert }: Options) {
  const [size, setSize] = useState(initial);
  const startPos = useRef(0);
  const startSize = useRef(initial);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      startPos.current = axis === "x" ? e.clientX : e.clientY;
      startSize.current = size;
      const move = (ev: PointerEvent) => {
        const cur = axis === "x" ? ev.clientX : ev.clientY;
        let delta = cur - startPos.current;
        if (invert) delta = -delta;
        const next = Math.max(min, Math.min(max, startSize.current + delta));
        setSize(next);
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      document.body.style.userSelect = "none";
      document.body.style.cursor = axis === "x" ? "col-resize" : "row-resize";
    },
    [axis, size, min, max, invert],
  );

  return { size, setSize, onPointerDown };
}
