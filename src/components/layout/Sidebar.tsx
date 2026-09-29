"use client";

import {
  useEffect,
  useMemo,
  useRef,
} from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ProducaoSubmenu } from "./ProducaoSubmenu";
import type { Route } from "next";
import type { LucideIcon } from "lucide-react";

import {
  ArrowLeftRight,
  BarChart3,
  ChefHat,
  LogOut,
  MapPinned,
  Package,
  Soup,
  Truck,
  UsersRound,
  Utensils,
  Wine,
  X,
} from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/cn";

import styles from "./Sidebar.module.css";

interface NavItem {
  label: string;
  href: Route;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Estoque principal",
    href: "/estoque-principal",
    icon: Package,
  },
  {
    label: "Bar",
    href: "/bar",
    icon: Wine,
  },
  {
    label: "Transferências",
    href: "/transferencias",
    icon: ArrowLeftRight,
  },
  {
    label: "Estoque da cozinha",
    href: "/estoque-cozinha",
    icon: Utensils,
  },
  {
    label: "Produção",
    href: "/producao",
    icon: Soup,
  },
  {
    label: "Feiras",
    href: "/feiras",
    icon: MapPinned,
  },
  {
    label: "Fornecedores",
    href: "/fornecedores",
    icon: Truck,
  },
  {
    label: "Relatórios",
    href: "/relatorios",
    icon: BarChart3,
  },
  {
  label: "Equipe",
  href: "/equipe",
  icon: UsersRound,
},
];

interface SidebarProps {
  open: boolean;
  onNavigate: () => void;
}

export function Sidebar({
  open,
  onNavigate,
}: SidebarProps) {
  const pathname = usePathname();
  const closeRef =
    useRef<HTMLButtonElement>(null);

  const {
    usuario,
    podeAcessar,
    sair,
  } = useAuth();

  const itensVisiveis = useMemo(
    () =>
      NAV_ITEMS.filter((item) =>
        podeAcessar(item.href),
      ),
    [podeAcessar],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    if (
      closeRef.current?.getClientRects()
        .length
    ) {
      closeRef.current.focus();
    }

    function handleKeyDown(
      event: KeyboardEvent,
    ) {
      if (event.key === "Escape") {
        event.preventDefault();
        onNavigate();
      }
    }

    document.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      document.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [open, onNavigate]);

  function handleLogout() {
    sair();
    onNavigate();
  }

  return (
    <aside
      id="menu-principal"
      className={cn(
        styles.sidebar,
        open && styles.open,
      )}
      aria-label="Navegação do sistema"
    >
      <div className={styles.brand}>
        <span
          className={styles.brandMark}
          aria-hidden="true"
        >
          <ChefHat size={24} />
        </span>

        <div>
          <p className={styles.brandName}>
            Gestão de Cozinha
          </p>

          <p
            className={
              styles.brandDescription
            }
          >
            Organização do dia a dia
          </p>
        </div>
      </div>

      <button
        ref={closeRef}
        type="button"
        className={styles.closeButton}
        onClick={onNavigate}
        aria-label="Fechar menu principal"
      >
        <X
          size={22}
          aria-hidden="true"
        />
        Fechar menu
      </button>

      <nav
        className={styles.nav}
        aria-label="Menu principal"
      >
        <p
          className={styles.navLabel}
          id="menu-operacao"
        >
          Operação
        </p>

        <ul
          className={styles.navList}
          aria-labelledby="menu-operacao"
        >
          {itensVisiveis.map((item) => {
            const Icon = item.icon;

            const active =
              pathname === item.href ||
              pathname.startsWith(
                `${item.href}/`,
              );

            return (
             <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                className={cn(styles.link, active && styles.linkActive)}
                aria-current={pathname === item.href ? "page" : undefined}
              >
                <Icon size={22} aria-hidden="true" />
                <span>{item.label}</span>
              </Link>

              {item.href === "/producao" && (
                <ProducaoSubmenu onNavigate={onNavigate} />
              )}
            </li>
            );
          })}
        </ul>
      </nav>

      <div className={styles.bottom}>
        {usuario && (
          <div
            className={styles.currentUser}
            aria-label={`Usuário conectado: ${usuario.nome}`}
          >
            <span
              className={styles.userInitials}
              aria-hidden="true"
            >
              {usuario.iniciais}
            </span>

            <span
              className={
                styles.currentUserInfo
              }
            >
              <strong>
                {usuario.nome}
              </strong>
              <small>
                {usuario.cargo}
              </small>
            </span>
          </div>
        )}

        <Link
          href="/login"
          className={styles.logout}
          onClick={handleLogout}
        >
          <LogOut
            size={22}
            aria-hidden="true"
          />
          <span>Sair</span>
        </Link>
      </div>
    </aside>
  );
}