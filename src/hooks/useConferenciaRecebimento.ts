"use client";

import { useMemo, useRef, useState } from "react";

import type { Transfer, TransferItem } from "@/types";
import type {
  ReceiptItemState,
} from "@/components/transferencias/ReceiptCheck";

import { useInventory } from "@/contexts/InventoryContext";
import { useAuth } from "@/contexts/AuthContext";
import { firebaseClient } from "@/lib/firebase";

type ItensState = Record<string, ReceiptItemState>;
type OverridesMap = Record<string, ItensState>;
type Acao = "receber" | "cancelar" | null;

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
  feedback: ConferenciaFeedback | null;
  mobileView: "list" | "detail";
  processando: boolean;
  acaoProcessando: Acao;
  podeCancelar: boolean;
  carregando: boolean;
  erroInventario: string | null;
  selecionar: (id: string) => void;
  atualizarItem: (
    itemId: string,
    next: ReceiptItemState,
  ) => void;
  voltarParaLista: () => void;
  limparFeedback: () => void;
  confirmar: () => Promise<void>;
  cancelar: () => Promise<void>;
}

function estadoPadrao(item: TransferItem): ReceiptItemState {
  return {
    quantidadeRecebida: item.quantidadeEnviada,
    recebidoCorretamente: true,
    observacao: "",
  };
}

function itemDiverge(
  estado: ReceiptItemState,
  quantidadeEnviada: number,
) {
  return (
    !estado.recebidoCorretamente ||
    estado.quantidadeRecebida !== quantidadeEnviada
  );
}

export function useConferenciaRecebimento():
  UseConferenciaRecebimento {
  const {
    transferencias,
    confirmarRecebimento,
    removerTransferencia,
    carregando,
    erro,
  } = useInventory();

  const { usuario } = useAuth();
  const uid = usuario?.id ?? null;

  const [selecionadaIdRaw, setSelecionadaIdRaw] =
    useState<string | null>(null);

  const [overrides, setOverrides] =
    useState<OverridesMap>({});

  const [feedback, setFeedback] =
    useState<ConferenciaFeedback | null>(null);

  const [mobileView, setMobileView] =
    useState<"list" | "detail">("list");

  const [acaoProcessando, setAcaoProcessando] =
    useState<Acao>(null);

  const trava = useRef(false);
  const processando = acaoProcessando !== null;

  const podeCancelar = Boolean(
    usuario &&
      (
        usuario.perfil === "dono" ||
        usuario.perfil === "administracao" ||
        usuario.perfis?.some(
          (perfil) =>
            perfil === "dono" ||
            perfil === "administracao",
        )
      ),
  );

  const selecionadaId = useMemo(() => {
    if (
      selecionadaIdRaw &&
      transferencias.some(
        (transferencia) =>
          transferencia.id === selecionadaIdRaw,
      )
    ) {
      return selecionadaIdRaw;
    }

    return transferencias[0]?.id ?? null;
  }, [selecionadaIdRaw, transferencias]);

  const selecionada = useMemo(
    () =>
      transferencias.find(
        (transferencia) =>
          transferencia.id === selecionadaId,
      ) ?? null,
    [transferencias, selecionadaId],
  );

  // As edições ficam somente na memória desta tela,
  // separadas por usuário e transferência.
  const chaveEdicao =
    uid && selecionada
      ? `${uid}|${selecionada.id}`
      : null;

  const itensState = useMemo<ItensState | undefined>(() => {
    if (!selecionada) return undefined;

    const edicoes = chaveEdicao
      ? overrides[chaveEdicao] ?? {}
      : {};

    const resultado: ItensState = {};

    for (const item of selecionada.itens) {
      resultado[item.id] =
        edicoes[item.id] ?? estadoPadrao(item);
    }

    return resultado;
  }, [selecionada, overrides, chaveEdicao]);

  const temDivergencia = useMemo(() => {
    if (!selecionada || !itensState) return false;

    return selecionada.itens.some((item) =>
      itemDiverge(
        itensState[item.id],
        item.quantidadeEnviada,
      ),
    );
  }, [selecionada, itensState]);

  function sessaoAtual() {
    return Boolean(
      uid &&
        firebaseClient().auth.currentUser?.uid === uid,
    );
  }

  function selecionar(id: string) {
    if (trava.current) return;

    setSelecionadaIdRaw(id);
    setFeedback(null);
    setMobileView("detail");
  }

  function atualizarItem(
    itemId: string,
    next: ReceiptItemState,
  ) {
    if (
      !chaveEdicao ||
      trava.current ||
      !sessaoAtual()
    ) {
      return;
    }

    setOverrides((prev) => ({
      ...prev,
      [chaveEdicao]: {
        ...(prev[chaveEdicao] ?? {}),
        [itemId]: next,
      },
    }));
  }

  function finalizarSelecao(id: string) {
    const proximaId =
      transferencias.find(
        (transferencia) => transferencia.id !== id,
      )?.id ?? null;

    setOverrides((prev) => {
      const proximo = { ...prev };
      delete proximo[`${uid}|${id}`];
      return proximo;
    });

    setSelecionadaIdRaw(proximaId);
    setMobileView("list");
  }

  async function confirmar() {
    if (
      trava.current ||
      !selecionada ||
      !itensState ||
      !sessaoAtual()
    ) {
      return;
    }

    const faltaJustificativa =
      selecionada.itens.some((item) => {
        const estado = itensState[item.id];

        return (
          itemDiverge(
            estado,
            item.quantidadeEnviada,
          ) &&
          !estado.observacao.trim()
        );
      });

    if (faltaJustificativa) {
      setFeedback({
        tipo: "danger",
        texto:
          "Informe a justificativa em todos os itens com divergência antes de confirmar.",
      });
      return;
    }

    const houveDivergencia = temDivergencia;
    const codigo = selecionada.codigo;
    const confirmadaId = selecionada.id;

    trava.current = true;
    setAcaoProcessando("receber");
    setFeedback(null);

    try {
      await confirmarRecebimento({
        transferenciaId: confirmadaId,
        itens: selecionada.itens.map((item) => {
          const estado = itensState[item.id];

          return {
            itemId: item.id,
            quantidadeRecebida:
              estado.quantidadeRecebida,
            recebidoCorretamente:
              estado.recebidoCorretamente,
            observacao: estado.observacao,
          };
        }),
      });

      if (!sessaoAtual()) return;

      finalizarSelecao(confirmadaId);

      setFeedback({
        tipo: "success",
        texto: houveDivergencia
          ? `Recebimento da ${codigo} confirmado com divergência registrada.`
          : `Recebimento da ${codigo} confirmado com sucesso.`,
      });
    } catch (falha) {
      if (!sessaoAtual()) return;

      setFeedback({
        tipo: "danger",
        texto:
          falha instanceof Error
            ? falha.message
            : "Não foi possível confirmar o recebimento.",
      });
    } finally {
      trava.current = false;
      setAcaoProcessando(null);
    }
  }

  async function cancelar() {
    if (
      trava.current ||
      !selecionada ||
      !sessaoAtual()
    ) {
      return;
    }

    if (!podeCancelar) {
      setFeedback({
        tipo: "danger",
        texto:
          "Somente o Dono ou a Administração podem cancelar transferências.",
      });
      return;
    }

    const canceladaId = selecionada.id;
    const codigo = selecionada.codigo;

    const confirmou = window.confirm(
      `Cancelar a transferência ${codigo}?\n\n` +
        "As quantidades enviadas serão devolvidas ao estoque principal.",
    );

    if (!confirmou) return;

    trava.current = true;
    setAcaoProcessando("cancelar");
    setFeedback(null);

    try {
      await removerTransferencia(canceladaId);

      if (!sessaoAtual()) return;

      finalizarSelecao(canceladaId);

      setFeedback({
        tipo: "success",
        texto:
          `Transferência ${codigo} cancelada. ` +
          "As quantidades enviadas foram devolvidas ao estoque principal.",
      });
    } catch (falha) {
      if (!sessaoAtual()) return;

      setFeedback({
        tipo: "danger",
        texto:
          falha instanceof Error
            ? falha.message
            : "Não foi possível cancelar a transferência.",
      });
    } finally {
      trava.current = false;
      setAcaoProcessando(null);
    }
  }

  return {
    transferencias,
    selecionadaId,
    selecionada,
    itensState,
    temDivergencia,
    feedback,
    mobileView,
    processando,
    acaoProcessando,
    podeCancelar,
    carregando,
    erroInventario: erro,
    selecionar,
    atualizarItem,
    voltarParaLista: () => {
      if (!trava.current) setMobileView("list");
    },
    limparFeedback: () => setFeedback(null),
    confirmar,
    cancelar,
  };
}