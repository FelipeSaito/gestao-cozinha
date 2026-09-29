import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import styles from "./StockCard.module.css";

export type StockCardTone =
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info";

interface StockCardProps {
  label: string;
  value: string;
  icon: ReactNode;
  tone?: StockCardTone;
  hint?: string;
}

export function StockCard({
  label,
  value,
  icon,
  tone = "primary",
  hint,
}: StockCardProps) {
  return (
    <div className={styles.card}>
      <span className={cn(styles.iconBox, styles[tone])} aria-hidden="true">
        {icon}
      </span>
      <div className={styles.body}>
        <span className={styles.label}>{label}</span>
        <span className={styles.value}>{value}</span>
        {hint && <span className={styles.hint}>{hint}</span>}
      </div>
    </div>
  );
}
