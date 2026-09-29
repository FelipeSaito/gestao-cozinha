"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import styles from "./CadastrarFeiraLink.module.css";

export function CadastrarFeiraLink({ onNavigate }: { onNavigate: () => void }) {
  const { usuario } = useAuth();
  const pathname = usePathname();
  if (!(usuario?.perfil === "dono" || usuario?.perfis?.includes("dono"))) return null;
  return (
    <ul className={styles.list} aria-label="Administração das feiras">
      <li>
        <Link href="/feiras/cadastrar" onClick={onNavigate}
          aria-current={pathname === "/feiras/cadastrar" ? "page" : undefined}
          className={`${styles.link} ${pathname === "/feiras/cadastrar" ? styles.active : ""}`}>
          <Plus size={18} aria-hidden="true" />
          <span>Cadastrar feira</span>
        </Link>
      </li>
    </ul>
  );
}
