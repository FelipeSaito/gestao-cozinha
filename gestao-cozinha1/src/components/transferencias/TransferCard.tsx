import { ArrowRight, Package, User as UserIcon } from "lucide-react";
import type { Transfer } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import styles from "./TransferCard.module.css";

interface TransferCardProps {
  transfer: Transfer;
  selected?: boolean;
  onSelect: (id: string) => void;
}

export function TransferCard({
  transfer,
  selected = false,
  onSelect,
}: TransferCardProps) {
  const totalItens = transfer.itens.length;

  return (
    <button
      type="button"
      className={cn(styles.card, selected && styles.selected)}
      onClick={() => onSelect(transfer.id)}
      aria-pressed={selected}
    >
      <div className={styles.top}>
        <span className={styles.code}>{transfer.codigo}</span>
        <Badge variant="warning">Pendente</Badge>
      </div>

      <div className={styles.route}>
        <span>{transfer.origem}</span>
        <ArrowRight size={15} aria-hidden="true" />
        <span>{transfer.destino}</span>
      </div>

      <div className={styles.meta}>
        <span className={styles.metaItem}>
          <UserIcon size={14} aria-hidden="true" />
          {transfer.responsavel}
        </span>
        <span className={styles.metaItem}>
          <Package size={14} aria-hidden="true" />
          {totalItens} {totalItens === 1 ? "item" : "itens"}
        </span>
        <span className={styles.date}>{formatDate(transfer.criadaEm)}</span>
      </div>
    </button>
  );
}
