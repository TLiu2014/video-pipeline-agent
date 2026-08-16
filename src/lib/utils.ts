import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind-aware className combiner (reused pattern from the wrangler apps). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
