"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Product } from "@/types";
import type { Production } from "@/types";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { registrarConsumoCozinha } from "@/services/consumosEstoque";
import { listarOrdens } from "@/services/ordensProducao";
import { formatQuantity } from "@/lib/format";
import styles from "./ConsumoCozinhaModal.module.css";

interface Props {
  produto: Product;
  onClose: () => void;
  onConcluido: () => Promise<void>;
}

export function ConsumoCozinhaModal({ produto, onClose, onConcluido }: Props) {
  const quantidadeId = useId();
  const finalidadeId = useId();
  const ordemCampoId = useId();
  const [quantidade, setQuantidade] = useState("");
  const [finalidade, setFinalidade] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [carregandoOrdens, setCarregandoOrdens] = useState(true);
  const [ordens, setOrdens] = useState<Production[]>([]);
  const [ordemId, setOrdemId] = useState("");
  const operacaoId = useRef<string | null>(null);

  useEffect(() => {
    let ativo = true;
    void listarOrdens().then((lista) => {
      if (ativo) setOrdens(lista.filter((ordem) => ordem.status === "em-andamento"));
    }).catch((falha: unknown) => {
      if (ativo) setErro(falha instanceof Error ? falha.message : "Não foi possível carregar as ordens.");
    }).finally(() => {
      if (ativo) setCarregandoOrdens(false);
    });
    return () => { ativo = false; };
  }, []);

  function alterarCampo(atualizar: (valor: string) => void, valor: string) {
    atualizar(valor);
    operacaoId.current = null;
    setErro(null);
  }

  async function confirmar() {
    if (salvando) return;
    if (!ordemId || !ordens.some((ordem) => ordem.id === ordemId)) {
      setErro("Selecione uma ordem em preparo antes de registrar o consumo.");
      return;
    }
    const numero = Number(quantidade.replace(",", "."));
    if (!quantidade.trim() || !Number.isFinite(numero) || numero <= 0 ||
      numero > produto.quantidade ||
      Math.abs(numero * 1000 - Math.round(numero * 1000)) > 1e-7) {
      setErro("Informe uma quantidade maior que zero e até o saldo disponível, com no máximo três casas decimais.");
      return;
    }
    if (finalidade.trim().length < 3 || finalidade.trim().length > 200) {
      setErro("Informe a finalidade do consumo (de 3 a 200 caracteres).");
      return;
    }

    setSalvando(true);
    setErro(null);
    try {
      operacaoId.current ??= crypto.randomUUID();
      await registrarConsumoCozinha({
        operacaoId: operacaoId.current,
        produtoId: produto.id,
        ordemId,
        quantidade: numero,
        finalidade: finalidade.trim(),
      });
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível registrar o consumo.");
      setSalvando(false);
      return;
    }

    // A gravação já ocorreu: não reenvie o consumo se a atualização falhar.
    try { await onConcluido(); }
    catch { /* O inventário será atualizado na próxima consulta. */ }
    onClose();
  }

  return (
    <Modal
      open
      onClose={() => { if (!salvando) onClose(); }}
      title="Registrar consumo da cozinha"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button variant="primary" onClick={() => void confirmar()} disabled={salvando}>
            {salvando ? "Registrando..." : "Confirmar consumo"}
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <p><strong>{produto.nome}</strong> · lote {produto.lote}</p>
        <p>Saldo na cozinha: {formatQuantity(produto.quantidade, produto.unidade)}</p>

        <div className={styles.field}>
          <label htmlFor={ordemCampoId}>Ordem de produção</label>
          <select
            id={ordemCampoId}
            value={ordemId}
            disabled={salvando || carregandoOrdens}
            onChange={(evento) => alterarCampo(setOrdemId, evento.target.value)}
          >
            <option value="">Selecione uma ordem em preparo</option>
            {ordens.map((ordem) => (
              <option key={ordem.id} value={ordem.id}>
                {ordem.codigo} · {ordem.prato}
              </option>
            ))}
          </select>
          {!carregandoOrdens && ordens.length === 0 && (
            <p>Inicie uma ordem na tela Produção para registrar o consumo.</p>
          )}
        </div>

        <div className={styles.field}>
          <label htmlFor={quantidadeId}>Quantidade consumida ({produto.unidade})</label>
          <input
            id={quantidadeId}
            type="number"
            inputMode="decimal"
            min="0.001"
            max={produto.quantidade}
            step="0.001"
            value={quantidade}
            disabled={salvando}
            onChange={(evento) => alterarCampo(setQuantidade, evento.target.value)}
            placeholder="Digite a quantidade"
          />
        </div>

        <div className={styles.field}>
          <label htmlFor={finalidadeId}>Finalidade</label>
          <input
            id={finalidadeId}
            type="text"
            maxLength={200}
            value={finalidade}
            disabled={salvando}
            onChange={(evento) => alterarCampo(setFinalidade, evento.target.value)}
            placeholder="Ex.: preparo da massa de pastel"
          />
        </div>

        {erro && <Alert variant="danger">{erro}</Alert>}
      </div>
    </Modal>
  );
}
