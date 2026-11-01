"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

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

import styles from "./page.module.css";

type ItemStates = Record<string, ReceiptItemState>;
type StatesMap = Record<string, ItemStates>;

type Feedback = {
  tipo: "success" | "info" | "danger";
  texto: string;
};

function criarEstadosDosItens(
  transferencia: Transfer,
  estadosSalvos: ItemStates = {},
): ItemStates {
  const estados: ItemStates = {};

  for (const item of transferencia.itens) {
    estados[item.id] = estadosSalvos[item.id] ?? {
      quantidadeRecebida: item.quantidadeEnviada,
      recebidoCorretamente: true,
      observacao: "",
    };
  }

  return estados;
}

export default function TransferenciasPage() {
  const {
    produtos,
    transferencias,
    confirmarRecebimento,
  } = useInventory();

  const [selecionadaId, setSelecionadaId] = useState<string | null>(
    transferencias[0]?.id ?? null,
  );

  const [states, setStates] = useState<StatesMap>({});
  const [fotoNome, setFotoNome] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const [mobileView, setMobileView] = useState<"list" | "detail">(
    "list",
  );

  // Se a seleção não existir mais, mostra a primeira pendência.
  const selecionada = useMemo(() => {
    return (
      transferencias.find(
        (transferencia) => transferencia.id === selecionadaId,
      ) ??
      transferencias[0] ??
      null
    );
  }, [transferencias, selecionadaId]);

  // Novas transferências recebem seus estados iniciais automaticamente,
  // preservando os valores que já foram editados.
  const itensState = useMemo<ItemStates>(() => {
    if (!selecionada) {
      return {};
    }

    return criarEstadosDosItens(
      selecionada,
      states[selecionada.id],
    );
  }, [selecionada, states]);

  const temDivergencia = useMemo(() => {
    if (!selecionada) {
      return false;
    }

    return selecionada.itens.some((item) => {
      const estado = itensState[item.id];

      if (!estado) {
        return false;
      }

      return (
        !estado.recebidoCorretamente ||
        estado.quantidadeRecebida !== item.quantidadeEnviada
      );
    });
  }, [selecionada, itensState]);

  function selecionar(id: string) {
    setSelecionadaId(id);
    setFotoNome(null);
    setFeedback(null);
    setMobileView("detail");
  }

  function atualizarItem(
    itemId: string,
    proximoEstado: ReceiptItemState,
  ) {
    if (!selecionada) {
      return;
    }

    const transferenciaId = selecionada.id;

    setStates((estadoAtual) => ({
      ...estadoAtual,
      [transferenciaId]: {
        ...estadoAtual[transferenciaId],
        [itemId]: proximoEstado,
      },
    }));
  }

  function salvarRascunho() {
    if (!selecionada) {
      return;
    }

    const transferenciaId = selecionada.id;

    setStates((estadoAtual) => ({
      ...estadoAtual,
      [transferenciaId]: { ...itensState },
    }));

    setFeedback({
      tipo: "info",
      texto:
        "Conferência mantida enquanto esta página estiver aberta. O rascunho ainda não é salvo após sair ou atualizar a página.",
    });
  }

  function confirmar() {
    if (!selecionada) {
      return;
    }

    if (selecionada.itens.length === 0) {
      setFeedback({
        tipo: "danger",
        texto: "Esta transferência não possui itens para receber.",
      });
      return;
    }

    // O contexto precisa encontrar o produto original para dar entrada
    // no estoque da cozinha. Não finalize se esse vínculo estiver faltando.
    const itemSemProduto = selecionada.itens.find(
      (item) =>
        !produtos.some(
          (produto) =>
            produto.id === item.produtoId &&
            produto.lote === item.lote &&
            produto.unidade === item.unidade,
        ),
    );

    if (itemSemProduto) {
      setFeedback({
        tipo: "danger",
        texto:
          `O item ${itemSemProduto.nome} não possui um vínculo válido ` +
          "com o produto, lote e unidade do estoque principal. " +
          "Confira o cadastro da transferência antes de recebê-la.",
      });
      return;
    }

    for (const item of selecionada.itens) {
      const estado = itensState[item.id];

      if (!estado) {
        setFeedback({
          tipo: "danger",
          texto: `Confira o item ${item.nome} antes de confirmar.`,
        });
        return;
      }

      if (
        !Number.isFinite(estado.quantidadeRecebida) ||
        estado.quantidadeRecebida < 0 ||
        estado.quantidadeRecebida > item.quantidadeEnviada
      ) {
        setFeedback({
          tipo: "danger",
          texto:
            `A quantidade recebida de ${item.nome} deve ficar entre ` +
            `0 e ${item.quantidadeEnviada} ${item.unidade}.`,
        });
        return;
      }

      const diverge =
        !estado.recebidoCorretamente ||
        estado.quantidadeRecebida !== item.quantidadeEnviada;

      if (diverge && estado.observacao.trim() === "") {
        setFeedback({
          tipo: "danger",
          texto:
            `Informe a justificativa da divergência de ${item.nome} ` +
            "antes de confirmar.",
        });
        return;
      }
    }

    const transferenciaId = selecionada.id;
    const codigo = selecionada.codigo;
    const possuiDivergencia = temDivergencia;

    const proximaId =
      transferencias.find(
        (transferencia) => transferencia.id !== transferenciaId,
      )?.id ?? null;

    try {
      confirmarRecebimento({
        transferenciaId,
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

    setStates((estadoAtual) => {
      const proximoEstado = { ...estadoAtual };
      delete proximoEstado[transferenciaId];
      return proximoEstado;
    });

    setSelecionadaId(proximaId);
    setFotoNome(null);
    setMobileView("list");

    setFeedback({
      tipo: "success",
      texto: possuiDivergencia
        ? `Recebimento da ${codigo} concluído com divergência. As quantidades aceitas foram adicionadas ao estoque da cozinha.`
        : `Recebimento da ${codigo} concluído. Os ingredientes foram adicionados ao estoque da cozinha.`,
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
      {/* Fora das colunas para continuar visível no celular. */}
      {feedback && (
        <Alert
          variant={feedback.tipo}
          onClose={() => setFeedback(null)}
          className={styles.feedback}
        >
          {feedback.texto}
        </Alert>
      )}

      <div className={styles.layout}>
        <aside
          className={cn(
            styles.listColumn,
            mobileView === "detail" && styles.hiddenMobile,
          )}
        >
          <div className={styles.listHeader}>
            <h2 className={styles.listTitle}>Pendentes</h2>

            <span className={styles.listCount}>
              {transferencias.length}
            </span>
          </div>

          <div className={styles.list}>
            {transferencias.length === 0 ? (
              <div className={styles.listEmpty}>
                <CheckCircle2 size={28} aria-hidden="true" />
                Nenhuma transferência pendente.
              </div>
            ) : (
              transferencias.map((transferencia) => (
                <TransferCard
                  key={transferencia.id}
                  transfer={transferencia}
                  selected={transferencia.id === selecionada?.id}
                  onSelect={selecionar}
                />
              ))
            )}
          </div>
        </aside>

        <section
          className={cn(
            styles.detailColumn,
            mobileView === "list" && styles.hiddenMobile,
          )}
        >
          {selecionada ? (
            <div className={styles.detailCard}>
              <div className={styles.detailHeader}>
                <button
                  type="button"
                  className={styles.backButton}
                  onClick={() => setMobileView("list")}
                >
                  <ArrowLeft size={16} aria-hidden="true" />
                  Voltar à lista
                </button>

                <span className={styles.detailCode}>
                  {selecionada.codigo}
                </span>
              </div>

              <div className={styles.infoGrid}>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>
                    <MapPin size={14} aria-hidden="true" />
                    Origem
                  </span>

                  <span className={styles.infoValue}>
                    {selecionada.origem}
                  </span>
                </div>

                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>
                    <ArrowRight size={14} aria-hidden="true" />
                    Destino
                  </span>

                  <span className={styles.infoValue}>
                    {selecionada.destino}
                  </span>
                </div>

                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>
                    <UserRound size={14} aria-hidden="true" />
                    Responsável
                  </span>

                  <span className={styles.infoValue}>
                    {selecionada.responsavel}
                  </span>
                </div>
              </div>

              <div className={styles.itemsHeader}>
                <ClipboardCheck size={18} aria-hidden="true" />
                Produtos recebidos
              </div>

              <div className={styles.items}>
                {selecionada.itens.map((item) => {
                  const estado = itensState[item.id];

                  if (!estado) {
                    return null;
                  }

                  return (
                    <ReceiptCheck
                      key={item.id}
                      item={item}
                      state={estado}
                      onChange={(next) =>
                        atualizarItem(item.id, next)
                      }
                    />
                  );
                })}
              </div>

              <label className={styles.upload}>
                <ImageUp size={20} aria-hidden="true" />

                <span>
                  {fotoNome
                    ? `${fotoNome} — selecionada, ainda não enviada`
                    : "Selecionar foto do recebimento (opcional)"}
                </span>

                <input
                  key={selecionada.id}
                  type="file"
                  accept="image/*"
                  className={styles.uploadInput}
                  onChange={(event) =>
                    setFotoNome(
                      event.target.files?.[0]?.name ?? null,
                    )
                  }
                />
              </label>

              <div className={styles.footer}>
                <Button
                  type="button"
                  variant="ghost"
                  leftIcon={<Save size={18} />}
                  onClick={salvarRascunho}
                >
                  Salvar rascunho
                </Button>

                <Button
                  type="button"
                  variant={temDivergencia ? "danger" : "success"}
                  leftIcon={<CheckCircle2 size={18} />}
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
              <CheckCircle2 size={36} aria-hidden="true" />

              <p className={styles.detailEmptyTitle}>
                Tudo conferido por aqui
              </p>

              <p className={styles.detailEmptyText}>
                Não há transferências pendentes de recebimento
                no momento.
              </p>

              <Link href="/estoque-cozinha">
                Ver estoque da cozinha
              </Link>
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}