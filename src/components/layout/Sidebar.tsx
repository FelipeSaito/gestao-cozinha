"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ProducaoSubmenu } from "./ProducaoSubmenu";
import type { Route } from "next";
import type { LucideIcon } from "lucide-react";

import {
  ChevronDown,
  ArrowLeftRight,
  BarChart3,
  ChefHat,
  BookOpen,
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

interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: "estoque", label: "Estoque",
    items: [
      { label: "Estoque principal", href: "/estoque-principal", icon: Package },
      { label: "Estoque da cozinha", href: "/estoque-cozinha", icon: Utensils },
      { label: "Transferências", href: "/transferencias", icon: ArrowLeftRight },
      { label: "Bar", href: "/bar", icon: Wine },
    ],
  },
  {
    id: "producao", label: "Produção",
    items: [
      { label: "Produção", href: "/producao", icon: Soup },
      { label: "Ficha técnica", href: "/ficha-tecnica" as Route, icon: BookOpen },
    ],
  },
  {
    id: "feiras", label: "Feiras",
    items: [
      { label: "Feiras", href: "/feiras", icon: MapPinned },
    ],
  },
  {
    id: "gestao", label: "Gestão",
    items: [
      { label: "Fornecedores", href: "/fornecedores", icon: Truck },
      { label: "Relatórios", href: "/relatorios", icon: BarChart3 },
      { label: "Equipe", href: "/equipe", icon: UsersRound },
    ],
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

  const gruposVisiveis = useMemo(
    () => NAV_GROUPS.map((grupo) => ({
      ...grupo,
      items: grupo.items.filter((item) => podeAcessar(item.href)),
    })).filter((grupo) => grupo.items.length > 0),
    [podeAcessar],
  );

  // Ao mudar de página, abre a seção correspondente.
  const [expansao, setExpansao] = useState<{
    pathname: string;
    grupos: Record<string, boolean>;
  }>({ pathname, grupos: {} });

  function grupoAberto(id: string, ativo: boolean) {
    return expansao.pathname === pathname
      ? expansao.grupos[id] ?? ativo
      : ativo;
  }

  function alternarGrupo(id: string, aberto: boolean) {
    setExpansao((anterior) => ({
      pathname,
      grupos: {
        ...(anterior.pathname === pathname ? anterior.grupos : {}),
        [id]: !aberto,
      },
    }));
  }

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
            Painel de operações
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
        {gruposVisiveis.map((grupo) => {
          const ativo = grupo.items.some((item) =>
            pathname === item.href || pathname.startsWith(`${item.href}/`),
          );

          // Uma seção com apenas uma opção vira um atalho direto.
          if (grupo.items.length === 1) {
            const item = grupo.items[0];
            const Icon = item.icon;
            return (
              <div key={grupo.id}>
              <Link href={item.href} onClick={onNavigate}
                className={cn(styles.link, styles.singleLink, ativo && styles.linkActive)}
                aria-current={pathname === item.href ? "page" : undefined}>
                <Icon size={19} aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
              {item.href === "/producao" && ativo && (
                <ProducaoSubmenu onNavigate={onNavigate} />
              )}
              </div>
            );
          }

          const aberto = grupoAberto(grupo.id, ativo);
          return (
            <div key={grupo.id} className={styles.group}>
              <button type="button"
                className={cn(styles.groupButton, ativo && styles.groupActive)}
                aria-expanded={aberto}
                aria-controls={`sidebar-grupo-${grupo.id}`}
                onClick={() => alternarGrupo(grupo.id, aberto)}>
                <span>{grupo.label}</span>
                <ChevronDown size={16} aria-hidden="true"
                  className={cn(styles.chevron, aberto && styles.chevronOpen)} />
              </button>
              <ul id={`sidebar-grupo-${grupo.id}`} className={styles.navList} hidden={!aberto}>
                {grupo.items.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <li key={item.href}>
                      <Link href={item.href} onClick={onNavigate}
                        className={cn(styles.link, active && styles.linkActive)}
                        aria-current={pathname === item.href ? "page" : undefined}>
                        <Icon size={19} aria-hidden="true" />
                        <span>{item.label}</span>
                      </Link>
                      {item.href === "/producao" && active && (
                        <ProducaoSubmenu onNavigate={onNavigate} />
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
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
