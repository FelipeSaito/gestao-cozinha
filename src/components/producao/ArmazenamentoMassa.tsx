"use client";

import type { LocalMassa } from "@/services/ordensProducao";
import styles from "./ArmazenamentoMassa.module.css";

export const LOCAIS: { id: LocalMassa; nome: string; equipamento: string }[] = [
  { id: "freezer-1", nome: "Freezer 1", equipamento: "Equipamento A" },
  { id: "freezer-2", nome: "Freezer 2", equipamento: "Equipamento A" },
  { id: "freezer-3", nome: "Freezer 3", equipamento: "Equipamento B" },
  { id: "freezer-4", nome: "Freezer 4", equipamento: "Equipamento B" },
];

interface Props {
  selecionados: LocalMassa[];
  onChange: (locais: LocalMassa[]) => void;
  quantidades: Partial<Record<LocalMassa, string>>;
  onQuantidadeChange: (local: LocalMassa, quantidade: string) => void;
  disabled?: boolean;
}

export function ArmazenamentoMassa({
  selecionados, onChange, quantidades, onQuantidadeChange, disabled,
}: Props) {
  return (
    <fieldset className={styles.fieldset} disabled={disabled}>
      <legend>Onde a massa foi guardada?</legend>
      <p>Marque os lados utilizados e digite quantos sacos de 3 rolos foram guardados em cada um.</p>
      <div className={styles.grid}>
        {LOCAIS.map((local) => (
          <div key={local.id} className={styles.option}>
            <label className={styles.choice}>
              <input
                type="checkbox"
                checked={selecionados.includes(local.id)}
                onChange={(evento) => onChange(evento.target.checked
                  ? [...selecionados, local.id]
                  : selecionados.filter((id) => id !== local.id))}
              />
              <span>{local.nome}<small>{local.equipamento}</small></span>
            </label>
            {selecionados.includes(local.id) && (
              <label className={styles.quantity}>
                Sacos armazenados
                <input
                  type="number" min="1" step="1" inputMode="numeric"
                  value={quantidades[local.id] ?? ""}
                  onChange={(evento) => onQuantidadeChange(local.id, evento.target.value)}
                  placeholder="Digite a quantidade"
                />
              </label>
            )}
          </div>
        ))}
      </div>
    </fieldset>
  );
}
