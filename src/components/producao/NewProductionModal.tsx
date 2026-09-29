"use client";

import { useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ChefHat, ClipboardCheck } from "lucide-react";

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";

import styles from "./NewProductionModal.module.css";

export interface NewProductionPayload {
  prato: string;
  categoria: string;
  quantidade: number;
  unidade: string;
  observacao: string;
}

interface NewProductionModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (payload: NewProductionPayload) => void;
}

const UNIDADES = ["unidades", "porções", "kg", "litros"];

interface Erros {
  prato?: string;
  quantidade?: string;
}

export function NewProductionModal(props: NewProductionModalProps) {
  if (!props.open) return null;

  return (
    <ProductionForm
      onClose={props.onClose}
      onConfirm={props.onConfirm}
    />
  );
}

function ProductionForm({
  onClose,
  onConfirm,
}: Omit<NewProductionModalProps, "open">) {
  const formId = useId();
  const unidadeId = useId();
  const observacaoId = useId();
  const observacaoHintId = useId();

  const pratoRef = useRef<HTMLInputElement>(null);
  const quantidadeRef = useRef<HTMLInputElement>(null);
  const enviandoRef = useRef(false);

  const [prato, setPrato] = useState("");
  const [categoria, setCategoria] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [unidade, setUnidade] = useState(UNIDADES[0]);
  const [observacao, setObservacao] = useState("");
  const [erros, setErros] = useState<Erros>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);

  const permiteFracao = unidade === "kg" || unidade === "litros";
  const quantidadeNumerica = Number(quantidade);

  const quantidadeValida =
    quantidade.trim() !== "" &&
    Number.isFinite(quantidadeNumerica) &&
    quantidadeNumerica > 0 &&
    quantidadeNumerica <= Number.MAX_SAFE_INTEGER &&
    (permiteFracao || Number.isSafeInteger(quantidadeNumerica));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (enviandoRef.current) return;

    const novosErros: Erros = {};

    if (!prato.trim()) {
      novosErros.prato = "Informe o nome do produto que será preparado.";
    }

    if (!quantidadeValida) {
      novosErros.quantidade = permiteFracao
        ? "Informe uma quantidade válida maior que zero."
        : "Informe uma quantidade inteira maior que zero.";
    }

    setErros(novosErros);
    setErroGeral(null);

    if (novosErros.prato) {
      pratoRef.current?.focus();
      return;
    }

    if (novosErros.quantidade) {
      quantidadeRef.current?.focus();
      return;
    }

    enviandoRef.current = true;

    try {
      onConfirm({
        prato: prato.trim(),
        categoria: categoria.trim() || "Geral",
        quantidade: quantidadeNumerica,
        unidade,
        observacao: observacao.trim(),
      });
    } catch (error) {
      enviandoRef.current = false;

      setErroGeral(
        error instanceof Error
          ? error.message
          : "Não foi possível registrar. Confira os dados e tente novamente.",
      );
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Nova produção"
      footer={
        <div className={styles.footer}>
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
          >
            Cancelar
          </Button>

          <Button
            type="submit"
            form={formId}
            leftIcon={<ClipboardCheck size={20} />}
          >
            Registrar produção
          </Button>
        </div>
      }
    >
      <form
        id={formId}
        className={styles.form}
        onSubmit={handleSubmit}
        noValidate
      >
        <div className={styles.intro}>
          <span className={styles.introIcon} aria-hidden="true">
            <ChefHat size={28} />
          </span>

          <p>
            Informe o que será preparado e a quantidade.
            A produção ficará como <strong>Planejada</strong>.
          </p>
        </div>

        <Input
          ref={pratoRef}
          name="prato"
          label="O que vamos preparar?"
          placeholder="Ex.: Pastel de carne"
          required
          maxLength={120}
          value={prato}
          error={erros.prato}
          onChange={(event) => {
            setPrato(event.target.value);
            setErros((atual) => ({ ...atual, prato: undefined }));
          }}
        />

        <Input
          name="categoria"
          label="Categoria (opcional)"
          placeholder="Ex.: Pastéis ou recheios"
          hint="Se não preencher, a categoria será Geral."
          maxLength={80}
          value={categoria}
          onChange={(event) => setCategoria(event.target.value)}
        />

        <div className={styles.row}>
          <Input
            ref={quantidadeRef}
            name="quantidade"
            label="Quantidade a produzir"
            type="number"
            inputMode={permiteFracao ? "decimal" : "numeric"}
            min={permiteFracao ? 0 : 1}
            step={permiteFracao ? "any" : 1}
            required
            value={quantidade}
            error={erros.quantidade}
            hint={
              permiteFracao
                ? "Pode informar uma quantidade fracionada."
                : "Use números inteiros, como 50 ou 100."
            }
            onChange={(event) => {
              setQuantidade(event.target.value);
              setErros((atual) => ({
                ...atual,
                quantidade: undefined,
              }));
            }}
          />

          <div className={styles.field}>
            <label className={styles.label} htmlFor={unidadeId}>
              Unidade de medida
            </label>

            <select
              id={unidadeId}
              name="unidade"
              className={styles.select}
              value={unidade}
              onChange={(event) => {
                setUnidade(event.target.value);
                setErros((atual) => ({
                  ...atual,
                  quantidade: undefined,
                }));
              }}
            >
              {UNIDADES.map((opcao) => (
                <option key={opcao} value={opcao}>
                  {opcao}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor={observacaoId}>
            Observação{" "}
            <span className={styles.optional}>(opcional)</span>
          </label>

          <textarea
            id={observacaoId}
            name="observacao"
            className={styles.textarea}
            rows={3}
            maxLength={500}
            aria-describedby={observacaoHintId}
            value={observacao}
            onChange={(event) => setObservacao(event.target.value)}
            placeholder="Ex.: separar 20 unidades sem cebola."
          />

          <p id={observacaoHintId} className={styles.hint}>
            Inclua orientações para o preparo. Até 500 caracteres.
          </p>
        </div>

        <div className={styles.summary}>
          <span className={styles.summaryLabel}>
            Resumo da produção
          </span>

          <strong>{prato.trim() || "Informe o produto acima"}</strong>

          <p>
            {quantidadeValida
              ? `${quantidadeNumerica.toLocaleString("pt-BR")} ${unidade}`
              : "Informe uma quantidade válida"}
          </p>
        </div>

        {erroGeral && (
          <div role="alert">
            <Alert variant="danger">{erroGeral}</Alert>
          </div>
        )}
      </form>
    </Modal>
  );
}