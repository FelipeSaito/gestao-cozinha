import type {
  ButtonHTMLAttributes,
  ReactNode,
} from "react";

import styles from "./Button.module.css";

type ButtonVariant =
  | "primary"
  | "secondary"
  | "success"
  | "danger"
  | "ghost";

type ButtonSize = "small" | "medium" | "large";

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  leftIcon?: ReactNode;
}

export function Button({
  children,
  variant = "primary",
  size = "medium",
  fullWidth = false,
  loading = false,
  leftIcon,
  disabled = false,
  type = "button",
  className = "",
  "aria-busy": ariaBusy,
  ...props
}: ButtonProps) {
  const buttonClasses = [
    styles.button,
    styles[variant],
    styles[size],
    fullWidth ? styles.fullWidth : "",
    loading ? styles.loading : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      {...props}
      type={type}
      className={buttonClasses}
      disabled={disabled || loading}
      aria-busy={loading || ariaBusy}
    >
      {loading ? (
        <span
          className={styles.spinner}
          aria-hidden="true"
        />
      ) : (
        leftIcon && (
          <span
            className={styles.icon}
            aria-hidden="true"
          >
            {leftIcon}
          </span>
        )
      )}

      <span className={styles.label}>
        {children}
      </span>
    </button>
  );
}