"use client";

import {
  useMemo,
  useState,
} from "react";

import type {
  LocalMassa,
  OrdemRemota,
  SacosPorLocal,
} from "@/services/ordensProducao";

import { ArmazenamentoMassa } from "@/components/producao/ArmazenamentoMassa";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

import styles from "./ConclusaoMassaModal.module.css";

const PESO_REFERENCIA_BLOCO_KG =
  1.53;

const ROLOS_POR_SACO = 3;

export interface ConclusaoMassaPayload {
  locaisArmazenamento: LocalMassa[];
  sacosPorLocal: SacosPorLocal;
  quantidadeBlocos: number;
}

interface ConclusaoMassaModalProps {
  open: boolean;
  producao: OrdemRemota;
  processando?: boolean;
  onClose: () => void;
  onConfirm: (
    payload: ConclusaoMassaPayload,
  ) => void | Promise<void>;
}

function formatarNumero(
  valor: number,
  casas = 2,
) {
  return valor.toLocaleString(
    "pt-BR",
    {
      minimumFractionDigits: casas,
      maximumFractionDigits: casas,
    },
  );
}

export function ConclusaoMassaModal({
  open,
  producao,
  processando = false,
  onClose,
  onConfirm,
}: ConclusaoMassaModalProps) {
  const [
    quantidadeBlocos,
    setQuantidadeBlocos,
  ] = useState("");

  const [
    locaisSelecionados,
    setLocaisSelecionados,
  ] = useState<LocalMassa[]>([]);

  const [
    quantidades,
    setQuantidades,
  ] = useState<
    Partial<Record<LocalMassa, string>>
  >({});

  const [erro, setErro] =
    useState<string | null>(null);

  const totalSacos = useMemo(
    () =>
      locaisSelecionados.reduce(
        (total, local) => {
          const quantidade = Number(
            quantidades[local] ?? 0,
          );

          return (
            total +
            (Number.isFinite(quantidade)
              ? quantidade
              : 0)
          );
        },
        0,
      ),
    [
      locaisSelecionados,
      quantidades,
    ],
  );

  const totalRolos =
    totalSacos * ROLOS_POR_SACO;

  const blocosNumericos = Number(
    quantidadeBlocos,
  );

  const pesoEstimadoKg =
    Number.isSafeInteger(
      blocosNumericos,
    ) && blocosNumericos > 0
      ? blocosNumericos *
        PESO_REFERENCIA_BLOCO_KG
      : 0;

  function alterarLocais(
    proximos: LocalMassa[],
  ) {
    setLocaisSelecionados(
      proximos,
    );

    setQuantidades((atual) => {
      const resultado: Partial<
        Record<LocalMassa, string>
      > = {};

      for (const local of proximos) {
        resultado[local] =
          atual[local] ?? "";
      }

      return resultado;
    });

    setErro(null);
  }

  function alterarQuantidade(
    local: LocalMassa,
    quantidade: string,
  ) {
    setQuantidades((atual) => ({
      ...atual,
      [local]: quantidade,
    }));

    setErro(null);
  }

  function confirmar() {
    if (
      !Number.isSafeInteger(
        blocosNumericos,
      ) ||
      blocosNumericos <= 0 ||
      blocosNumericos > 100_000
    ) {
      setErro(
        "Informe uma quantidade inteira de blocos maior que zero.",
      );

      return;
    }

    if (
      locaisSelecionados.length === 0
    ) {
      setErro(
        "Selecione pelo menos um lado do freezer.",
      );

      return;
    }

    const sacosPorLocal: SacosPorLocal =
      {};

    for (
      const local of locaisSelecionados
    ) {
      const quantidade = Number(
        quantidades[local],
      );

      if (
        !Number.isSafeInteger(
          quantidade,
        ) ||
        quantidade <= 0 ||
        quantidade > 100_000
      ) {
        setErro(
          "Informe uma quantidade inteira de sacos para cada lado selecionado.",
        );

        return;
      }

      sacosPorLocal[local] =
        quantidade;
    }

    setErro(null);

    void onConfirm({
      quantidadeBlocos:
        blocosNumericos,

      locaisArmazenamento:
        locaisSelecionados,

      sacosPorLocal,
    });
  }

  const pesoBaseKg =
    Number.isFinite(
      producao.quantidade,
    )
      ? producao.quantidade
      : 0;

  return (
    <Modal
      open={open}
      onClose={
        processando
          ? () => undefined
          : onClose
      }
      title="Concluir produção de massa"
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={processando}
          >
            Cancelar
          </Button>

          <Button
            type="button"
            variant="primary"
            onClick={confirmar}
            disabled={processando}
          >
            {processando
              ? "Concluindo..."
              : "Concluir produção"}
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <div
          className={
            styles.introduction
          }
        >
          <p>
            Informe quantos blocos a
            produção rendeu e onde os
            sacos de rolos foram
            armazenados.
          </p>

          <p className={styles.note}>
            Não é necessário pesar a
            massa. O sistema utiliza{" "}
            <strong>
              1,53 kg por bloco
            </strong>{" "}
            apenas como referência.
          </p>
        </div>

        <dl className={styles.summary}>
          <div>
            <dt>Ordem</dt>
            <dd>{producao.codigo}</dd>
          </div>

          <div>
            <dt>Produção planejada</dt>
            <dd>
              {formatarNumero(
                pesoBaseKg,
                0,
              )}{" "}
              {producao.unidade}
            </dd>
          </div>

          <div>
            <dt>Responsável</dt>
            <dd>
              {producao.responsavel}
            </dd>
          </div>
        </dl>

        <div className={styles.field}>
          <label
            htmlFor="quantidade-blocos"
            className={styles.label}
          >
            Quantos blocos de massa
            foram produzidos?
          </label>

          <input
            id="quantidade-blocos"
            type="number"
            min="1"
            max="100000"
            step="1"
            inputMode="numeric"
            className={styles.input}
            value={quantidadeBlocos}
            disabled={processando}
            onChange={(event) => {
              setQuantidadeBlocos(
                event.target.value,
              );

              setErro(null);
            }}
            placeholder="Ex.: 135"
          />

          <small
            className={styles.help}
          >
            Digite somente a quantidade
            de blocos, sem informar o
            peso.
          </small>
        </div>

        <div
          className={styles.metrics}
          aria-live="polite"
        >
          <div>
            <span>Blocos produzidos</span>

            <strong>
              {Number.isSafeInteger(
                blocosNumericos,
              ) &&
              blocosNumericos > 0
                ? blocosNumericos
                : 0}
            </strong>
          </div>

          <div>
            <span>
              Peso estimado
            </span>

            <strong>
              {formatarNumero(
                pesoEstimadoKg,
                2,
              )}{" "}
              kg
            </strong>
          </div>

          <div>
            <span>
              Sacos armazenados
            </span>

            <strong>
              {totalSacos}
            </strong>
          </div>

          <div>
            <span>
              Rolos armazenados
            </span>

            <strong>
              {totalRolos}
            </strong>
          </div>
        </div>

        <ArmazenamentoMassa
          selecionados={
            locaisSelecionados
          }
          onChange={alterarLocais}
          quantidades={quantidades}
          onQuantidadeChange={
            alterarQuantidade
          }
          disabled={processando}
        />

        {erro && (
          <Alert variant="danger">
            {erro}
          </Alert>
        )}
      </div>
    </Modal>
  );
}