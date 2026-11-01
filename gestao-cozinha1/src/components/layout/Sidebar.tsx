"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import type { LucideIcon } from "lucide-react";
import { ArrowLeftRight, BarChart3, ChefHat, LogOut, Package, Soup, Truck, Wine, X } from "lucide-react";
import { cn } from "@/lib/cn";
import styles from "./Sidebar.module.css";

interface NavItem { label: string; href: Route; icon: LucideIcon }
const NAV_ITEMS: NavItem[] = [
  { label: "Estoque principal", href: "/estoque-principal", icon: Package },
  { label: "Bar", href: "/bar", icon: Wine },
  { label: "Transferências", href: "/transferencias", icon: ArrowLeftRight },
  { label: "Produção", href: "/producao", icon: Soup },
  { label: "Fornecedores", href: "/fornecedores", icon: Truck },
  // Prévia visual: aplicar a permissão de Chef/Dono com o login.
  { label: "Relatórios", href: "/relatorios", icon: BarChart3 },
];
interface SidebarProps { open: boolean; onNavigate: () => void }
export function Sidebar({ open, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    if (closeRef.current?.getClientRects().length) closeRef.current.focus();
    function handleKeyDown(e: KeyboardEvent) { if (e.key === "Escape") { e.preventDefault(); onNavigate(); } }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onNavigate]);
  return <aside id="menu-principal" className={cn(styles.sidebar, open && styles.open)} aria-label="Navegação do sistema">
    <div className={styles.brand}><span className={styles.brandMark} aria-hidden="true"><ChefHat size={24} /></span><div><p className={styles.brandName}>Gestão de Cozinha</p><p className={styles.brandDescription}>Organização do dia a dia</p></div></div>
    <button ref={closeRef} type="button" className={styles.closeButton} onClick={onNavigate} aria-label="Fechar menu principal"><X size={22} aria-hidden="true" />Fechar menu</button>
    <nav className={styles.nav} aria-label="Menu principal"><p className={styles.navLabel} id="menu-operacao">Operação</p><ul className={styles.navList} aria-labelledby="menu-operacao">{NAV_ITEMS.map((item) => { const Icon = item.icon; const active = pathname === item.href || pathname.startsWith(`${item.href}/`); return <li key={item.href}><Link href={item.href} onClick={onNavigate} className={cn(styles.link, active && styles.linkActive)} aria-current={active ? "page" : undefined}><Icon size={22} aria-hidden="true" /><span>{item.label}</span></Link></li>; })}</ul></nav>
    <div className={styles.bottom}><Link href="/login" className={styles.logout} onClick={onNavigate}><LogOut size={22} aria-hidden="true" /><span>Sair</span></Link></div>
  </aside>;
}
