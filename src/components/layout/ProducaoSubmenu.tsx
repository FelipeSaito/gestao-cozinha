"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CookingPot } from "lucide-react";
import styles from "./ProducaoSubmenu.module.css";

interface ProducaoSubmenuProps {
  onNavigate: () => void;
}

export function ProducaoSubmenu({ onNavigate }: ProducaoSubmenuProps) {
  const pathname = usePathname();
  const ativo = pathname === "/producao/pasteis" ||
    pathname.startsWith("/producao/pasteis/");

  return (
    <ul className={styles.list} aria-label="Páginas de produção">
      <li>
        <Link
          href="/producao/pasteis"
          className={`${styles.link} ${ativo ? styles.active : ""}`}
          aria-current={ativo ? "page" : undefined}
          onClick={onNavigate}
        >
          <CookingPot size={18} aria-hidden="true" />
          <span>Pastéis</span>
        </Link>
      </li>
    </ul>
  );
}
