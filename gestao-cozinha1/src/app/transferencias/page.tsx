"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  ImageUp,
  MapPin,
  Save,
  UserRound,
} from "lucide-react";

import type { Transfer } from "@/types";

import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { TransferCard } from "@/components/transferencias/TransferCard";

import {
  ReceiptCheck,
  type ReceiptItemState,
} from "@/components/transferencias/ReceiptCheck";

import { useInventory } from "@/contexts/InventoryContext";
import { usuarioTransferencias } from "@/services/usuarios";
import { cn } from "@/lib/cn";
import Link from "next/link";
import styles from "./page.module.css";

type StatesMap = Record<
  string,
  Record<string, ReceiptItemState>
>;

function criarEstadoTransferencia(
  transferencia: Transfer,
): Record<string, ReceiptItemState> {
  const estadoItens: Record<
    string,
    ReceiptItemState
  > = {};

  for (const item of transferencia.itens) {
    estadoItens[item.id] = {
      quantidadeRecebida:
        item.quantidadeEnviada,
      recebidoCorretamente: true,
      observacao: "",
    };
  }

  return estadoItens;
}

function initStates(
  transferencias: Transfer[],
): StatesMap {
  const states: StatesMap = {};

  for (const transferencia of transferencias) {
    states[transferencia.id] =
      criarEstadoTransferencia(transferencia);
  }

  return states;
}

export default function TransferenciasPage() {
  const {
  transferencias,
  confirmarRecebimento,
  estoqueCozinha,
} = useInventory();

  const [selecionadaId, setSelecionadaId] =
    useState<string | null>(
      transferencias[0]?.id ?? null,
    );

  const [states, setStates] =
    useState<StatesMap>(() =>
      initStates(transferencias),
    );

  const [fotoNome, setFotoNome] =
    useState<string | null>(null);

  const [feedback, setFeedback] = useState<{
    tipo: "success" | "info" | "danger";
    texto: string;
  } | null>(null);

  const [mobileView, setMobileView] =
    useState<"list" | "detail">("list");

  /*
   * Cria o estado de conferência para transferências
   * adicionadas depois que a página foi carregada.
   */
  useEffect(() => {
    setStates((estadoAtual) => {
      const proximoEstado = {
        ...estadoAtual,
      };

      for (const transferencia of transferencias) {
        if (!proximoEstado[transferencia.id]) {
          proximoEstado[transferencia.id] =
            criarEstadoTransferencia(
              transferencia,
            );
        }
      }

      return proximoEstado;
    });

    /*
     * Se nenhuma transferência estiver selecionada,
     * seleciona automaticamente a primeira.
     */
    if (
      selecionadaId === null &&
      transferencias.length > 0
    ) {
      setSelecionadaId(
        transferencias[0].id,
      );
    }
  }, [transferencias, selecionadaId]);

  const selecionada = useMemo(() => {
    return (
      transferencias.find(
        (transferencia) =>
          transferencia.id === selecionadaId,
      ) ?? null
    );
  }, [transferencias, selecionadaId]);

  const itensState = selecionadaId
    ? states[selecionadaId]
    : undefined;

  const temDivergencia = useMemo(() => {
    if (!selecionada || !itensState) {
      return false;
    }

    return selecionada.itens.some(
      (item) => {
        const estado = itensState[item.id];

        if (!estado) {
          return false;
        }

        return (
          !estado.recebidoCorretamente ||
          estado.quantidadeRecebida !==
            item.quantidadeEnviada
        );
      },
    );
  }, [selecionada, itensState]);

  function selecionar(id: string) {
    setSelecionadaId(id);
    setFotoNome(null);
    setFeedback(null);
    setMobileView("detail");
  }

  function atualizarItem(
    itemId: string,
    next: ReceiptItemState,
  ) {
    if (!selecionadaId) {
      return;
    }

    setStates((estadoAtual) => ({
      ...estadoAtual,
      [selecionadaId]: {
        ...estadoAtual[selecionadaId],
        [itemId]: next,
      },
    }));
  }

  function salvarRascunho() {
    setFeedback({
      tipo: "info",
      texto:
        "Rascunho salvo neste dispositivo.",
    });
  }

  function confirmar() {
    if (!selecionada || !itensState) {
      return;
    }

    const divergentesSemJustificativa =
      selecionada.itens.filter((item) => {
        const estado = itensState[item.id];

        if (!estado) {
          return false;
        }

        const diverge =
          !estado.recebidoCorretamente ||
          estado.quantidadeRecebida !==
            item.quantidadeEnviada;

        return (
          diverge &&
          estado.observacao.trim() === ""
        );
      });

    if (
      divergentesSemJustificativa.length > 0
    ) {
      setFeedback({
        tipo: "danger",
        texto:
          "Informe a justificativa em todos os itens com divergência antes de confirmar.",
      });

      return;
    }

    const restantes = transferencias.filter(
      (transferencia) =>
        transferencia.id !== selecionada.id,
    );

    const proximaId =
      restantes[0]?.id ?? null;

    try {
  confirmarRecebimento({
    transferenciaId: selecionada.id,
    itens: selecionada.itens.map((item) => {
      const estado = itensState[item.id];

      if (!estado) {
        throw new Error(
          `Confira o item ${item.nome} antes de confirmar.`,
        );
      }

      return {
        itemId: item.id,
        quantidadeRecebida: estado.quantidadeRecebida,
        recebidoCorretamente: estado.recebidoCorretamente,
        observacao: estado.observacao,
      };
    }),
  });
} catch (error) {
  setFeedback({
    tipo: "danger",
    texto:
      error instanceof Error
        ? error.message
        : "Não foi possível confirmar o recebimento.",
  });

  return;
}

    /*
     * Remove também o estado temporário
     * da conferência finalizada.
     */
    setStates((estadoAtual) => {
      const proximoEstado = {
        ...estadoAtual,
      };

      delete proximoEstado[selecionada.id];

      return proximoEstado;
    });

    setSelecionadaId(proximaId);
    setFotoNome(null);
    setMobileView("list");

    setFeedback({
      tipo: "success",
      texto: temDivergencia
        ? `Recebimento da ${selecionada.codigo} confirmado com divergência registrada.`
        : `Recebimento da ${selecionada.codigo} confirmado com sucesso.`,
    });
  }

  return (
   <AppLayout
        user={usuarioTransferencias}
        title="Transferências pendentes"
        subtitle="Confira os itens recebidos do estoque principal"
        headerActions={
          <Link href="/estoque-cozinha">
            Ver estoque da cozinha →
          </Link>
        }
      >
      <div
        style={{
          padding: "12px",
          marginBottom: "16px",
          background: "#eaf7ef",
          color: "#14532d",
          borderRadius: "8px",
        }}
      >
        <strong>
          Diagnóstico — estoque da cozinha: {estoqueCozinha.length} registros
        </strong>

        {estoqueCozinha.map((produto) => (
          <div key={`${produto.id}-${produto.lote}`}>
            {produto.nome}: {produto.quantidade} {produto.unidade}
          </div>
        ))}
      </div>

      <div className={styles.layout}>
        <aside
          className={cn(
            styles.listColumn,
            mobileView === "detail" &&
              styles.hiddenMobile,
          )}
        >
          <div className={styles.listHeader}>
            <h2 className={styles.listTitle}>
              Pendentes
            </h2>

            <span className={styles.listCount}>
              {transferencias.length}
            </span>
          </div>

          <div className={styles.list}>
            {transferencias.length === 0 ? (
              <div className={styles.listEmpty}>
                <CheckCircle2
                  size={28}
                  aria-hidden="true"
                />

                Nenhuma transferência pendente.
              </div>
            ) : (
              transferencias.map(
                (transferencia) => (
                  <TransferCard
                    key={transferencia.id}
                    transfer={transferencia}
                    selected={
                      transferencia.id ===
                      selecionadaId
                    }
                    onSelect={selecionar}
                  />
                ),
              )
            )}
          </div>
        </aside>

        <section
          className={cn(
            styles.detailColumn,
            mobileView === "list" &&
              styles.hiddenMobile,
          )}
        >
          {feedback && (
            <Alert
              variant={feedback.tipo}
              onClose={() =>
                setFeedback(null)
              }
              className={styles.feedback}
            >
              {feedback.texto}
            </Alert>
          )}

          {selecionada && itensState ? (
            <div className={styles.detailCard}>
              <div
                className={styles.detailHeader}
              >
                <button
                  type="button"
                  className={styles.backButton}
                  onClick={() =>
                    setMobileView("list")
                  }
                >
                  <ArrowLeft
                    size={16}
                    aria-hidden="true"
                  />

                  Voltar à lista
                </button>

                <span
                  className={styles.detailCode}
                >
                  {selecionada.codigo}
                </span>
              </div>

              <div className={styles.infoGrid}>
                <div className={styles.infoItem}>
                  <span
                    className={styles.infoLabel}
                  >
                    <MapPin
                      size={14}
                      aria-hidden="true"
                    />
                    Origem
                  </span>

                  <span
                    className={styles.infoValue}
                  >
                    {selecionada.origem}
                  </span>
                </div>

                <div className={styles.infoItem}>
                  <span
                    className={styles.infoLabel}
                  >
                    <ArrowRight
                      size={14}
                      aria-hidden="true"
                    />
                    Destino
                  </span>

                  <span
                    className={styles.infoValue}
                  >
                    {selecionada.destino}
                  </span>
                </div>

                <div className={styles.infoItem}>
                  <span
                    className={styles.infoLabel}
                  >
                    <UserRound
                      size={14}
                      aria-hidden="true"
                    />
                    Responsável
                  </span>

                  <span
                    className={styles.infoValue}
                  >
                    {selecionada.responsavel}
                  </span>
                </div>
              </div>

              <div className={styles.itemsHeader}>
                <ClipboardCheck
                  size={18}
                  aria-hidden="true"
                />

                Produtos recebidos
              </div>

              <div className={styles.items}>
                {selecionada.itens.map(
                  (item) => {
                    const estado =
                      itensState[item.id];

                    if (!estado) {
                      return null;
                    }

                    return (
                      <ReceiptCheck
                        key={item.id}
                        item={item}
                        state={estado}
                        onChange={(next) =>
                          atualizarItem(
                            item.id,
                            next,
                          )
                        }
                      />
                    );
                  },
                )}
              </div>

              <label className={styles.upload}>
                <ImageUp
                  size={20}
                  aria-hidden="true"
                />

                <span>
                  {fotoNome ??
                    "Anexar foto do recebimento (opcional)"}
                </span>

                <input
                  type="file"
                  accept="image/*"
                  className={
                    styles.uploadInput
                  }
                  onChange={(event) =>
                    setFotoNome(
                      event.target.files?.[0]
                        ?.name ?? null,
                    )
                  }
                />
              </label>

              <div className={styles.footer}>
                <Button
                  variant="ghost"
                  leftIcon={<Save size={18} />}
                  onClick={salvarRascunho}
                >
                  Salvar rascunho
                </Button>

                <Button
                  variant={
                    temDivergencia
                      ? "danger"
                      : "success"
                  }
                  leftIcon={
                    <CheckCircle2 size={18} />
                  }
                  onClick={confirmar}
                >
                  {temDivergencia
                    ? "Confirmar com divergência"
                    : "Confirmar recebimento"}
                </Button>
              </div>
            </div>
          ) : (
            <div className={styles.detailEmpty}>
              <CheckCircle2
                size={36}
                aria-hidden="true"
              />

              <p
                className={
                  styles.detailEmptyTitle
                }
              >
                Tudo conferido por aqui
              </p>

              <p
                className={
                  styles.detailEmptyText
                }
              >
                Não há transferências
                pendentes de recebimento no
                momento.
              </p>
            </div>
          )}
        </section>
      </div>
    </AppLayout>
    
  );
}