"use client";

import { forwardRef, useId } from "react";
import type {
  InputHTMLAttributes,
  ReactNode,
} from "react";

import { cn } from "@/lib/cn";
import styles from "./Input.module.css";

interface InputProps
  extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: ReactNode;
  /** Exemplo: botão de mostrar ou ocultar senha. */
  rightSlot?: ReactNode;
}

export const Input = forwardRef<
  HTMLInputElement,
  InputProps
>(function Input(
  {
    label,
    error,
    hint,
    leftIcon,
    rightSlot,
    className,
    id,
    disabled,
    required,
    "aria-describedby": externalDescribedBy,
    "aria-invalid": externalInvalid,
    ...props
  },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;

  const describedBy =
    [
      externalDescribedBy,
      hint ? hintId : undefined,
      error ? errorId : undefined,
    ]
      .filter(Boolean)
      .join(" ") || undefined;

  const invalid = error ? true : externalInvalid;
  const hasError =
    Boolean(error) ||
    externalInvalid === true ||
    externalInvalid === "true";

  return (
    <div className={cn(styles.wrapper, className)}>
      {label && (
        <label
          htmlFor={inputId}
          className={styles.label}
        >
          {label}

          {required && (
            <span className={styles.required}>
              {" "}(obrigatório)
            </span>
          )}
        </label>
      )}

      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}

      <div
        className={cn(
          styles.field,
          hasError && styles.fieldError,
          disabled && styles.fieldDisabled,
        )}
      >
        {leftIcon && (
          <span
            className={styles.leftIcon}
            aria-hidden="true"
          >
            {leftIcon}
          </span>
        )}

        <input
          {...props}
          ref={ref}
          id={inputId}
          className={styles.input}
          disabled={disabled}
          required={required}
          aria-invalid={invalid}
          aria-describedby={describedBy}
        />

        {rightSlot && (
          <span className={styles.rightSlot}>
            {rightSlot}
          </span>
        )}
      </div>

      {error && (
        <p
          id={errorId}
          className={styles.error}
          role="alert"
        >
          <strong>Erro:</strong> {error}
        </p>
      )}
    </div>
  );
});