"use client";

import { useId, useState } from "react";
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
  onConfirm: (payload: TransferPayload) => void;
}

export function TransferModal({
  open,
  produto,
  onClose,
  onConfirm,
}: TransferModalProps) {
  const observacaoId = useId();
  const [quantidade, setQuantidade] = useState(1);
  const [observacao, setObservacao] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleConfirm() {
    if (!produto) return;
    const validationError = validarTransferencia(
      quantidade,
      produto.quantidade,
      produto.unidade,
    );
    if (validationError) {
      setError(validationError);
      return;
    }
    onConfirm({ produto, quantidade, observacao: observacao.trim() });
  }

  return (
    <Modal
      open={open && produto !== null}
      onClose={onClose}
      title="Transferir para a cozinha"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleConfirm}>
            Criar transferência
          </Button>
        </>
      }
    >
      {produto && (
        <div className={styles.form}>
          <dl className={styles.summary}>
            <div className={styles.summaryRow}>
              <dt>Ingrediente</dt>
              <dd>{produto.nome}</dd>
            </div>
            <div className={styles.summaryRow}>
              <dt>Lote</dt>
              <dd>{produto.lote}</dd>
            </div>
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
                setQuantidade(value);
                if (error) setError(null);
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
            />
          </div>

          {error && <Alert variant="danger">{error}</Alert>}
        </div>
      )}
    </Modal>
  );
}
