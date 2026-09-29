"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import type { ReactNode } from "react";
import type { User } from "@/types";

import {
  usePathname,
  useRouter,
} from "next/navigation";

import {
  getRotaInicial,
  useAuth,
} from "@/contexts/AuthContext";

import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

import styles from "./AppLayout.module.css";


interface AppLayoutProps {
  /**
   * Temporariamente opcional para não quebrar as páginas
   * que ainda enviam usuários dos arquivos de serviço.
   *
   * O usuário exibido será o usuário autenticado.
   */
  user?: User;
  title: string;
  subtitle?: string;
  headerActions?: ReactNode;
  children: ReactNode;
}

export function AppLayout({
  title,
  subtitle,
  headerActions,
  children,
}: AppLayoutProps) {
  const [menuOpen, setMenuOpen] =
    useState(false);

  const navigationRef =
    useRef<HTMLDivElement>(null);

  const mainRef =
    useRef<HTMLDivElement>(null);

  const router = useRouter();
  const pathname = usePathname();

  const {
    usuario,
    carregando,
    podeAcessar,
  } = useAuth();

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
  }, []);

  const toggleMenu = useCallback(() => {
    setMenuOpen((current) => !current);
  }, []);

  /*
   * Verifica se o funcionário está autenticado
   * e se possui permissão para acessar a página.
   */
  useEffect(() => {
    if (carregando) {
      return;
    }

    if (!usuario) {
      router.replace("/login");
      return;
    }

    if (!podeAcessar(pathname)) {
      router.replace(
        getRotaInicial(usuario.perfil),
      );
    }
  }, [
    carregando,
    usuario,
    pathname,
    podeAcessar,
    router,
  ]);

  /*
   * Fecha o menu compacto quando a tela volta
   * para o tamanho de desktop.
   */
  useEffect(() => {
    const media = window.matchMedia(
      "(max-width: 900px)",
    );

    function handleResize(
      event: MediaQueryListEvent,
    ) {
      if (!event.matches) {
        closeMenu();
      }
    }

    media.addEventListener(
      "change",
      handleResize,
    );

    return () => {
      media.removeEventListener(
        "change",
        handleResize,
      );
    };
  }, [closeMenu]);

  /*
   * Controla o foco do teclado e bloqueia
   * o conteúdo enquanto o menu mobile estiver aberto.
   */
  useLayoutEffect(() => {
    if (!menuOpen) {
      return;
    }

    const navigation =
      navigationRef.current;

    const main = mainRef.current;

    if (!navigation || !main) {
      return;
    }

    const trigger =
      main.querySelector<HTMLButtonElement>(
        "#botao-menu-principal",
      );

    const previousOverflow =
      document.body.style.overflow;

    const previousInert = main.inert;

    main.inert = true;
    document.body.style.overflow = "hidden";

    function getFocusableElements() {
      if (!navigation) {
        return [];
      }

      return Array.from(
        navigation.querySelectorAll<HTMLElement>(
          [
            "a[href]",
            "button:not(:disabled)",
            "input:not(:disabled)",
            "select:not(:disabled)",
            "textarea:not(:disabled)",
            '[tabindex]:not([tabindex="-1"])',
          ].join(","),
        ),
      ).filter(
        (element) =>
          element.tabIndex >= 0 &&
          element.getClientRects().length >
            0 &&
          !element.closest("[inert]"),
      );
    }

    function focusFirstElement() {
      const first =
        getFocusableElements()[0];

      (first ?? navigation)?.focus();
    }

    focusFirstElement();

    function handleKeyDown(
      event: KeyboardEvent,
    ) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const elements =
        getFocusableElements();

      const first = elements[0];
      const last =
        elements[elements.length - 1];

      if (!first || !last) {
        event.preventDefault();
        navigation?.focus();
        return;
      }

      const active =
        document.activeElement;

      const isOutside =
        !navigation?.contains(active);

      if (
        event.shiftKey &&
        (active === first || isOutside)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (active === last || isOutside)
      ) {
        event.preventDefault();
        first.focus();
      }
    }

    function handleFocusIn(
      event: FocusEvent,
    ) {
      if (
        event.target instanceof Node &&
        !navigation?.contains(event.target)
      ) {
        focusFirstElement();
      }
    }

    document.addEventListener(
      "keydown",
      handleKeyDown,
    );

    document.addEventListener(
      "focusin",
      handleFocusIn,
    );

    return () => {
      document.removeEventListener(
        "keydown",
        handleKeyDown,
      );

      document.removeEventListener(
        "focusin",
        handleFocusIn,
      );

      main.inert = previousInert;

      document.body.style.overflow =
        previousOverflow;

      if (
        trigger?.isConnected &&
        trigger.getClientRects().length
      ) {
        trigger.focus();
      }
    };
  }, [menuOpen, closeMenu]);

  /*
   * Impede que uma página protegida apareça
   * rapidamente antes do redirecionamento.
   */
  if (
    carregando ||
    !usuario ||
    !podeAcessar(pathname)
  ) {
    return (
      <main
        className={styles.authLoading}
        aria-live="polite"
        aria-busy="true"
      >
        <span
          className={styles.loadingSpinner}
          aria-hidden="true"
        />

        <p>Verificando acesso...</p>
      </main>
    );
  }

  return (
    <div className={styles.shell}>
      <div
        ref={navigationRef}
        className={styles.navigation}
        role={
          menuOpen ? "dialog" : undefined
        }
        aria-modal={
          menuOpen ? true : undefined
        }
        aria-label={
          menuOpen
            ? "Menu principal"
            : undefined
        }
        tabIndex={-1}
      >
        <Sidebar
          open={menuOpen}
          onNavigate={closeMenu}
        />
      </div>

      {menuOpen && (
        <div
          className={styles.backdrop}
          aria-hidden="true"
          onClick={closeMenu}
        />
      )}

      <div
        ref={mainRef}
        className={styles.main}
      >
        <a
          href="#conteudo-principal"
          className={styles.skipLink}
        >
          Pular para o conteúdo
        </a>

        <Header
          title={title}
          subtitle={subtitle}
          user={usuario}
          actions={headerActions}
          menuOpen={menuOpen}
          onToggleMenu={toggleMenu}
        />

        {headerActions && (
          <div
            className={styles.mobileActions}
          >
            {headerActions}
          </div>
        )}

        <main
          id="conteudo-principal"
          tabIndex={-1}
          className={styles.content}
        >
          {children}
        </main>
      </div>
    </div>
  );
}