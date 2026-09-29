"use client";

import { useMemo, useRef, useState } from "react";
import type { Transfer, TransferItem } from "@/types";
import type { ReceiptItemState } from "@/components/transferencias/ReceiptCheck";
import { useInventory } from "@/contexts/InventoryContext";

type ItensState = Record<string, ReceiptItemState>;
type OverridesMap = Record<string, ItensState>;

export interface ConferenciaFeedback {
  tipo: "success" | "info" | "danger";
  texto: string;
}

export interface UseConferenciaRecebimento {
  transferencias: Transfer[];
  selecionadaId: string | null;
  selecionada: Transfer | null;
  itensState: ItensState | undefined;
  temDivergencia: boolean;
  fotoNome: string | null;
  feedback: ConferenciaFeedback | null;
  mobileView: "list" | "detail";
  processando: boolean;
  carregando: boolean;
  erroInventario: string | null;
  selecionar: (id: string) => void;
  atualizarItem: (itemId: string, next: ReceiptItemState) => void;
  definirFoto: (nome: string | null) => void;
  voltarParaLista: () => void;
  limparFeedback: () => void;
  salvarRascunho: () => void;
  confirmar: () => Promise<void>;
}

function estadoPadrao(item: TransferItem): ReceiptItemState {
  return {
    quantidadeRecebida: item.quantidadeEnviada,
    recebidoCorretamente: true,
    observacao: "",
  };
}

function itemDiverge(estado: ReceiptItemState, quantidadeEnviada: number) {
  return !estado.recebidoCorretamente || estado.quantidadeRecebida !== quantidadeEnviada;
}

export function useConferenciaRecebimento(): UseConferenciaRecebimento {
  const { transferencias, confirmarRecebimento, carregando, erro } = useInventory();
  const [selecionadaIdRaw, setSelecionadaIdRaw] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<OverridesMap>({});
  const [fotoNome, setFotoNome] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<ConferenciaFeedback | null>(null);
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");
  const [processando, setProcessando] = useState(false);
  const trava = useRef(false);

  const selecionadaId = useMemo(() => {
    if (selecionadaIdRaw && transferencias.some((t) => t.id === selecionadaIdRaw)) {
      return selecionadaIdRaw;
    }
    return transferencias[0]?.id ?? null;
  }, [selecionadaIdRaw, transferencias]);

  const selecionada = useMemo(
    () => transferencias.find((t) => t.id === selecionadaId) ?? null,
    [transferencias, selecionadaId],
  );

  const itensState = useMemo<ItensState | undefined>(() => {
    if (!selecionada) return undefined;
    const edicoes = overrides[selecionada.id] ?? {};
    const resultado: ItensState = {};
    for (const item of selecionada.itens) {
      resultado[item.id] = edicoes[item.id] ?? estadoPadrao(item);
    }
    return resultado;
  }, [selecionada, overrides]);

  const temDivergencia = useMemo(() => {
    if (!selecionada || !itensState) return false;
    return selecionada.itens.some((item) =>
      itemDiverge(itensState[item.id], item.quantidadeEnviada),
    );
  }, [selecionada, itensState]);

  function selecionar(id: string) {
    if (trava.current) return;
    setSelecionadaIdRaw(id);
    setFotoNome(null);
    setFeedback(null);
    setMobileView("detail");
  }

  function atualizarItem(itemId: string, next: ReceiptItemState) {
    if (!selecionadaId || trava.current) return;
    setOverrides((prev) => ({
      ...prev,
      [selecionadaId]: { ...(prev[selecionadaId] ?? {}), [itemId]: next },
    }));
  }

  function salvarRascunho() {
    setFeedback({
      tipo: "info",
      texto: "Conferência mantida nesta tela até você fechar ou recarregar a página.",
    });
  }

  async function confirmar() {
    if (trava.current || !selecionada || !itensState) return;

    const faltaJustificativa = selecionada.itens.some((item) => {
      const estado = itensState[item.id];
      return itemDiverge(estado, item.quantidadeEnviada) && !estado.observacao.trim();
    });

    if (faltaJustificativa) {
      setFeedback({
        tipo: "danger",
        texto: "Informe a justificativa em todos os itens com divergência antes de confirmar.",
      });
      return;
    }

    const houveDivergencia = temDivergencia;
    const codigo = selecionada.codigo;
    const confirmadaId = selecionada.id;
    const proximaId = transferencias.find((t) => t.id !== confirmadaId)?.id ?? null;

    trava.current = true;
    setProcessando(true);
    setFeedback(null);
    try {
      await confirmarRecebimento({
        transferenciaId: confirmadaId,
        itens: selecionada.itens.map((item) => {
          const estado = itensState[item.id];
          return {
            itemId: item.id,
            quantidadeRecebida: estado.quantidadeRecebida,
            recebidoCorretamente: estado.recebidoCorretamente,
            observacao: estado.observacao,
          };
        }),
      });

      setOverrides((prev) => {
        const proximo = { ...prev };
        delete proximo[confirmadaId];
        return proximo;
      });
      setSelecionadaIdRaw(proximaId);
      setFotoNome(null);
      setMobileView("list");
      setFeedback({
        tipo: "success",
        texto: houveDivergencia
          ? `Recebimento da ${codigo} confirmado com divergência registrada.`
          : `Recebimento da ${codigo} confirmado com sucesso.`,
      });
    } catch (falha) {
      setFeedback({
        tipo: "danger",
        texto: falha instanceof Error ? falha.message : "Não foi possível confirmar o recebimento.",
      });
    } finally {
      trava.current = false;
      setProcessando(false);
    }
  }

  return {
    transferencias, selecionadaId, selecionada, itensState, temDivergencia,
    fotoNome, feedback, mobileView, processando, carregando, erroInventario: erro,
    selecionar, atualizarItem, definirFoto: setFotoNome,
    voltarParaLista: () => setMobileView("list"),
    limparFeedback: () => setFeedback(null), salvarRascunho, confirmar,
  };
}
