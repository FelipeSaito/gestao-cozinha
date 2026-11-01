import type { ReactNode } from "react";
import { Menu } from "lucide-react";
import type { User } from "@/types";

import styles from "./Header.module.css";

interface HeaderProps {
  title: string;
  subtitle?: string;
  user: User;
  actions?: ReactNode;
  onToggleMenu: () => void;
  menuOpen?: boolean;
}

export function Header({
  title,
  subtitle,
  user,
  actions,
  onToggleMenu,
  menuOpen,
}: HeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <button
          id="botao-menu-principal"
          type="button"
          className={styles.menuButton}
          onClick={onToggleMenu}
          aria-label={
            menuOpen
              ? "Fechar menu principal"
              : "Abrir menu principal"
          }
          aria-controls="menu-principal"
          aria-expanded={menuOpen}
        >
          <Menu size={24} aria-hidden="true" />
          <span>Menu</span>
        </button>

        <div className={styles.titles}>
          <h1 className={styles.title}>{title}</h1>

          {subtitle && (
            <p className={styles.subtitle}>
              {subtitle}
            </p>
          )}
        </div>
      </div>

      <div className={styles.right}>
        {actions && (
          <div className={styles.actions}>
            {actions}
          </div>
        )}

        <div className={styles.user}>
          <span
            className={styles.avatar}
            aria-hidden="true"
          >
            {user.iniciais}
          </span>

          <span className={styles.userInfo}>
            <span className={styles.userName}>
              {user.nome}
            </span>

            <span className={styles.userRole}>
              {user.cargo}
            </span>
          </span>
        </div>
      </div>
    </header>
  );
}