"use client";

import { useId } from "react";
import { AlertTriangle } from "lucide-react";
import type { TransferItem } from "@/types";
import { QuantityInput } from "@/components/ui/QuantityInput";
import { formatQuantity } from "@/lib/format";
import { cn } from "@/lib/cn";
import styles from "./ReceiptCheck.module.css";

export interface ReceiptItemState {
  quantidadeRecebida: number;
  recebidoCorretamente: boolean;
  observacao: string;
}

interface ReceiptCheckProps {
  item: TransferItem;
  state: ReceiptItemState;
  onChange: (next: ReceiptItemState) => void;
}

export function ReceiptCheck({ item, state, onChange }: ReceiptCheckProps) {
  const checkboxId = useId();
  const justificativaId = useId();
  const hasDivergencia =
  !state.recebidoCorretamente || state.quantidadeRecebida !== item.quantidadeEnviada;

  function handleQuantidade(value: number) {
    onChange({
      ...state,
      quantidadeRecebida: value,
      recebidoCorretamente: value === item.quantidadeEnviada,
    });
  }

  function handleCheckbox(checked: boolean) {
    onChange({
      ...state,
      recebidoCorretamente: checked,
      quantidadeRecebida: checked
        ? item.quantidadeEnviada
        : state.quantidadeRecebida,
    });
  }

  return (
    <div className={cn(styles.item, hasDivergencia && styles.divergente)}>
      <div className={styles.header}>
        <div className={styles.identity}>
          <span className={styles.name}>{item.nome}</span>
          <span className={styles.lote}>Lote {item.lote}</span>
        </div>
        <div className={styles.enviado}>
          <span className={styles.enviadoLabel}>Enviado</span>
          <span className={styles.enviadoValue}>
            {formatQuantity(item.quantidadeEnviada, item.unidade)}
          </span>
        </div>
      </div>

      <div className={styles.controls}>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Quantidade recebida</span>
          <QuantityInput
            value={state.quantidadeRecebida}
            onChange={handleQuantidade}
            min={0}
            step={1}
            unidade={item.unidade}
            aria-label={`Quantidade recebida de ${item.nome}`}
          />
        </div>

        <label className={styles.checkbox} htmlFor={checkboxId}>
          <input
            id={checkboxId}
            type="checkbox"
            checked={state.recebidoCorretamente}
            onChange={(event) => handleCheckbox(event.target.checked)}
          />
          Recebido corretamente
        </label>
      </div>

      {hasDivergencia ? (
        <div className={styles.divergenceBox}>
          <p className={styles.divergenceTitle}>
            <AlertTriangle size={16} aria-hidden="true" />
            Divergência de quantidade — justificativa obrigatória
          </p>
          <textarea
            id={justificativaId}
            className={styles.textarea}
            rows={2}
            value={state.observacao}
            onChange={(event) =>
              onChange({ ...state, observacao: event.target.value })
            }
            placeholder="Descreva o motivo (ex.: item avariado, faltou peso)"
            aria-label={`Justificativa da divergência de ${item.nome}`}
          />
        </div>
      ) : (
        <textarea
          className={styles.textarea}
          rows={2}
          value={state.observacao}
          onChange={(event) =>
            onChange({ ...state, observacao: event.target.value })
          }
          placeholder="Observação (opcional)"
          aria-label={`Observação sobre ${item.nome}`}
        />
      )}
    </div>
  );
}
