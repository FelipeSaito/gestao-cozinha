"use client";

import { type FormEvent, useId, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { registrarEntrada, type NovaEntrada } from "@/services/entradasFirestore";
import styles from "./EntradaProdutoModal.module.css";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (nome: string) => Promise<void>;
}

const VAZIO = {
  nome: "", categoria: "", lote: "", validade: "", quantidade: "",
  unidade: "kg", custoUnitario: "",
};

export function EntradaProdutoModal({ open, onClose, onSaved }: Props) {
  const formId = useId();
  const [campos, setCampos] = useState(VAZIO);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const trava = useRef(false);
  const operacaoId = useRef<string | null>(null);

  function alterar(campo: keyof typeof VAZIO, valor: string) {
    if (trava.current) return;
    setCampos((anterior) => ({ ...anterior, [campo]: valor }));
    setErro(null);
  }

  function fechar() {
    if (trava.current) return;
    setCampos(VAZIO);
    setErro(null);
    operacaoId.current = null;
    onClose();
  }

  async function salvar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (trava.current) return;
    const quantidade = Number(campos.quantidade.replace(",", "."));
    const custoUnitario = Number(campos.custoUnitario.replace(",", "."));
    if (!campos.nome.trim() || !campos.categoria.trim() || !campos.lote.trim() ||
      !campos.validade || !campos.unidade.trim() ||
      !Number.isFinite(quantidade) || quantidade <= 0 ||
      !Number.isFinite(custoUnitario) || custoUnitario < 0) {
      setErro("Preencha todos os campos com valores válidos.");
      return;
    }

    const entrada: NovaEntrada = {
      nome: campos.nome.trim(), categoria: campos.categoria.trim(),
      lote: campos.lote.trim(), validade: campos.validade,
      quantidade, unidade: campos.unidade.trim(), custoUnitario,
    };
    operacaoId.current ??= crypto.randomUUID();
    trava.current = true;
    setSalvando(true);
    setErro(null);
    try {
      await registrarEntrada(entrada, operacaoId.current);
      // A gravação já foi confirmada, mesmo se a atualização da lista falhar.
      try { await onSaved(entrada.nome); } catch { /* A lista será atualizada ao voltar à tela. */ }
      setCampos(VAZIO);
      operacaoId.current = null;
      onClose();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível registrar a entrada.");
    } finally {
      trava.current = false;
      setSalvando(false);
    }
  }

  function campo(
    chave: keyof typeof VAZIO,
    rotulo: string,
    opcoes: { type?: string; placeholder?: string; step?: string } = {},
  ) {
    return (
      <label className={styles.campo}>
        <span>{rotulo}</span>
        <input
          type={opcoes.type ?? "text"}
          placeholder={opcoes.placeholder}
          step={opcoes.step}
          required
          value={campos[chave]}
          onChange={(event) => alterar(chave, event.target.value)}
          disabled={salvando}
        />
      </label>
    );
  }

  return (
    <Modal open={open} onClose={fechar} title="Registrar entrada no estoque" size="large"
      footer={
        <>
          <Button variant="secondary" onClick={fechar} disabled={salvando}>Cancelar</Button>
          <Button variant="primary" type="submit" form={formId} disabled={salvando}>
            {salvando ? "Salvando..." : "Registrar entrada"}
          </Button>
        </>
      }>
      <form id={formId} onSubmit={salvar} className={styles.formulario}>
        <p>Informe o lote e o saldo real. Uma nova entrada do mesmo produto e lote soma a quantidade ao estoque.</p>
        <div className={styles.grade}>
          {campo("nome", "Ingrediente", { placeholder: "Ex.: Óleo de soja" })}
          {campo("categoria", "Categoria", { placeholder: "Ex.: Óleos" })}
          {campo("lote", "Lote", { placeholder: "Código impresso na embalagem" })}
          {campo("validade", "Validade", { type: "date" })}
          {campo("quantidade", "Quantidade", { type: "number", step: "0.001" })}
          <label className={styles.campo}>
            <span>Unidade</span>
            <select required disabled={salvando} value={campos.unidade}
              onChange={(event) => alterar("unidade", event.target.value)}>
              <option value="kg">kg</option>
              <option value="litros">litros</option>
              <option value="unidades">unidades</option>
            </select>
          </label>
          {campo("custoUnitario", "Custo por unidade (R$)", { type: "number", step: "0.0001" })}
        </div>
        {erro && <Alert variant="danger">{erro}</Alert>}
      </form>
    </Modal>
  );
}
