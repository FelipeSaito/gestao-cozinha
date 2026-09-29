"use client";

import { useState } from "react";
import { consultarConsumosDaOrdem, type ConsumoRegistrado } from "@/services/consumosEstoque";
import { formatQuantity } from "@/lib/format";
import styles from "./ConsumosDaOrdem.module.css";

interface Props { ordemId: string }

export function ConsumosDaOrdem({ ordemId }: Props) {
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [consumos, setConsumos] = useState<ConsumoRegistrado[]>([]);

  async function alternar() {
    if (aberto) { setAberto(false); return; }
    setAberto(true);
    setCarregando(true);
    setErro(null);
    try {
      setConsumos(await consultarConsumosDaOrdem(ordemId));
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível carregar os ingredientes.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className={styles.container}>
      <button type="button" className={styles.toggle} onClick={() => void alternar()} aria-expanded={aberto}>
        {aberto ? "Ocultar ingredientes usados" : "Ver ingredientes usados"}
      </button>
      {aberto && (
        <div className={styles.content}>
          {carregando && <p role="status">Carregando consumos...</p>}
          {erro && <p role="alert">{erro}</p>}
          {!carregando && !erro && consumos.length === 0 && <p>Nenhum ingrediente consumido nesta ordem.</p>}
          {!erro && consumos.length > 0 && (
            <ul className={styles.list}>
              {consumos.map((item) => (
                <li key={item.id}>
                  <strong>{item.nome}</strong> · {formatQuantity(item.quantidade, item.unidade)}
                  <span>Lote {item.lote} · {item.registradoPor}</span>
                  <span>{item.finalidade}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
