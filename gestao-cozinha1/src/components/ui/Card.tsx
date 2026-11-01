import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import styles from "./Card.module.css";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** "surface" = branco (padrão), "secondary" = azulado. */
  tone?: "surface" | "secondary";
  padding?: "none" | "small" | "medium" | "large";
}

export function Card({
  tone = "surface",
  padding = "medium",
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        styles.card,
        tone === "secondary" && styles.secondary,
        styles[`padding-${padding}`],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
