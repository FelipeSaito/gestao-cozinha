"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { listarFeirasCadastradas, type FeiraCadastrada } from "./feirasCadastradas";

/** Lê as feiras criadas pelo Dono quando a tela é aberta. */
export function useFeirasCadastradas(uid?: string) {
  const pathname = usePathname();
  const [feirasCadastradas, setFeirasCadastradas] = useState<FeiraCadastrada[]>([]);
  const [erroFeirasCadastradas, setErroFeirasCadastradas] = useState<string | null>(null);
  useEffect(() => {
    if (!uid) return;
    let ativo = true;
    function atualizar() {
      void listarFeirasCadastradas().then((feiras) => {
        if (ativo) { setFeirasCadastradas(feiras); setErroFeirasCadastradas(null); }
      }).catch((erro: unknown) => {
        if (ativo) setErroFeirasCadastradas(erro instanceof Error ? erro.message : "Não foi possível carregar as feiras.");
      });
    }
    atualizar();
    window.addEventListener("focus", atualizar);
    return () => { ativo = false; window.removeEventListener("focus", atualizar); };
  }, [uid, pathname]);
  return { feirasCadastradas, erroFeirasCadastradas };
}

export function feirasExtrasNaData(feiras: FeiraCadastrada[], dataIso: string) {
  const [ano, mes, dia] = dataIso.split("-").map(Number);
  const data = new Date(ano, mes - 1, dia);
  if (!ano || !mes || !dia || Number.isNaN(data.getTime()) ||
      data.getFullYear() !== ano || data.getMonth() !== mes - 1 ||
      data.getDate() !== dia) return [];
  return feiras.filter((feira) => {
    if (!feira.ativo && (!feira.desativadaEm || dataIso >= feira.desativadaEm)) return false;
    return feira.tipo === "evento"
      ? feira.data === dataIso : feira.diaSemana === data.getDay();
  });
}
