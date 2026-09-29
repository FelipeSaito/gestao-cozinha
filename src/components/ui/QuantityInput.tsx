"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import styles from "./QuantityInput.module.css";

interface QuantityInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unidade?: string;
  disabled?: boolean;
  "aria-label"?: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function QuantityInput({
  value,
  onChange,
  min = 0,
  max = Number.POSITIVE_INFINITY,
  step = 1,
  unidade,
  disabled = false,
  "aria-label": ariaLabel = "Quantidade",
}: QuantityInputProps) {
  function commit(next: number) {
    onChange(Number.isNaN(next) ? min : clamp(next, min, max));
  }

  return (
    <div className={cn(styles.wrapper, disabled && styles.disabled)}>
      <button
        type="button"
        className={styles.button}
        onClick={() => commit(value - step)}
        disabled={disabled || value <= min}
        aria-label="Diminuir quantidade"
      >
        <Minus size={18} aria-hidden="true" />
      </button>

      <input
        type="number"
        className={styles.input}
        value={Number.isFinite(value) ? value : ""}
        min={min}
        max={Number.isFinite(max) ? max : undefined}
        step={step}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => {
          const parsed = event.target.valueAsNumber;
          onChange(Number.isNaN(parsed) ? min : parsed);
        }}
        onBlur={(event) => commit(event.target.valueAsNumber)}
      />

      {unidade && <span className={styles.unit}>{unidade}</span>}

      <button
        type="button"
        className={styles.button}
        onClick={() => commit(value + step)}
        disabled={disabled || value >= max}
        aria-label="Aumentar quantidade"
      >
        <Plus size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
