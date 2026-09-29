import { ArrowRightLeft, PackageSearch } from "lucide-react";
import type { Product } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatCurrency, formatDate, formatQuantity } from "@/lib/format";
import { getStatusInfo } from "@/lib/produto-status";
import styles from "./StockTable.module.css";

interface StockTableProps {
  produtos: Product[];
  onTransferir: (produto: Product) => void;
}

export function StockTable({ produtos, onTransferir }: StockTableProps) {
  if (produtos.length === 0) {
    return (
      <div className={styles.empty}>
        <PackageSearch size={32} aria-hidden="true" />
        <p className={styles.emptyTitle}>Nenhum insumo encontrado</p>
        <p className={styles.emptyText}>
          Ajuste a busca ou os filtros para ver outros itens do estoque.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Ingrediente</th>
            <th scope="col">Categoria</th>
            <th scope="col">Lote</th>
            <th scope="col">Validade</th>
            <th scope="col" className={styles.numeric}>Quantidade</th>
            <th scope="col" className={styles.numeric}>Custo unitário</th>
            <th scope="col">Situação</th>
            <th scope="col"><span className={styles.srOnly}>Ações</span></th>
          </tr>
        </thead>
        <tbody>
          {produtos.map((produto) => {
            const status = getStatusInfo(produto.situacao);
            return (
              <tr key={produto.id}>
                <td className={styles.name}>{produto.nome}</td>
                <td>{produto.categoria}</td>
                <td className={styles.mono}>{produto.lote}</td>
                <td>{formatDate(produto.validade)}</td>
                <td className={styles.numeric}>
                  {formatQuantity(produto.quantidade, produto.unidade)}
                </td>
                <td className={styles.numeric}>
                  {formatCurrency(produto.custoUnitario)}
                </td>
                <td>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </td>
                <td className={styles.actions}>
                  <Button
                    size="small"
                    variant="secondary"
                    leftIcon={<ArrowRightLeft size={16} />}
                    onClick={() => onTransferir(produto)}
                    disabled={produto.situacao === "vencido"}
                  >
                    Transferir
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
