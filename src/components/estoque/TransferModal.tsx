"use client";

import { useId, useRef, useState } from "react";
import type { Product } from "@/types";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { QuantityInput } from "@/components/ui/QuantityInput";
import { Alert } from "@/components/ui/Alert";
import { formatQuantity } from "@/lib/format";
import { validarTransferencia } from "@/schemas/transferencia";
import styles from "./TransferModal.module.css";

export interface TransferPayload {
  produto: Product;
  quantidade: number;
  observacao: string;
}

interface TransferModalProps {
  open: boolean;
  produto: Product | null;
  onClose: () => void;
  onConfirm: (payload: TransferPayload) => Promise<void>;
}

export function TransferModal({ open, produto, onClose, onConfirm }: TransferModalProps) {
  const observacaoId = useId();
  const [quantidade, setQuantidade] = useState(1);
  const [observacao, setObservacao] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const trava = useRef(false);

  function fechar() {
    if (!trava.current) onClose();
  }

  async function handleConfirm() {
    if (!produto || trava.current) return;
    const validationError = validarTransferencia(
      quantidade, produto.quantidade, produto.unidade,
    );
    if (validationError) {
      setError(validationError);
      return;
    }

    trava.current = true;
    setSalvando(true);
    setError(null);
    try {
      await onConfirm({ produto, quantidade, observacao: observacao.trim() });
    } catch (falha) {
      setError(falha instanceof Error ? falha.message : "Não foi possível criar a transferência.");
    } finally {
      trava.current = false;
      setSalvando(false);
    }
  }

  return (
    <Modal
      open={open && produto !== null}
      onClose={fechar}
      title="Transferir para a cozinha"
      footer={
        <>
          <Button variant="secondary" onClick={fechar} disabled={salvando}>Cancelar</Button>
          <Button variant="primary" onClick={handleConfirm} disabled={salvando}>
            {salvando ? "Criando..." : "Criar transferência"}
          </Button>
        </>
      }
    >
      {produto && (
        <div className={styles.form}>
          <dl className={styles.summary}>
            <div className={styles.summaryRow}><dt>Ingrediente</dt><dd>{produto.nome}</dd></div>
            <div className={styles.summaryRow}><dt>Lote</dt><dd>{produto.lote}</dd></div>
            <div className={styles.summaryRow}>
              <dt>Saldo disponível</dt>
              <dd>{formatQuantity(produto.quantidade, produto.unidade)}</dd>
            </div>
          </dl>
          <div className={styles.field}>
            <span className={styles.label}>Quantidade a transferir</span>
            <QuantityInput
              value={quantidade}
              onChange={(value) => {
                if (trava.current) return;
                setQuantidade(value);
                setError(null);
              }}
              min={0}
              max={produto.quantidade}
              step={1}
              unidade={produto.unidade}
              aria-label="Quantidade a transferir"
            />
          </div>
          <div className={styles.field}>
            <span className={styles.label}>Destino</span>
            <div className={styles.readonly}>Estoque da cozinha</div>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor={observacaoId}>
              Observação <span className={styles.optional}>(opcional)</span>
            </label>
            <textarea
              id={observacaoId}
              className={styles.textarea}
              rows={3}
              value={observacao}
              onChange={(event) => setObservacao(event.target.value)}
              placeholder="Ex.: separar para o preparo do almoço"
              disabled={salvando}
            />
          </div>
          {error && <Alert variant="danger">{error}</Alert>}
        </div>
      )}
    </Modal>
  );
}
