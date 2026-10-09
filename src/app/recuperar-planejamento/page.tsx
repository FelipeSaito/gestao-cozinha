"use client";

import { useRef, useState } from "react";
import {
  importarPlanejamentoLocal,
  type SaborPlanejado,
} from "@/services/planejamentosFirestore";

const CHAVE = "2026-10-08:laranjeira";

const ITENS: SaborPlanejado[] = [
  { id: "padrao-carne", nome: "carne", quantidade: 40 },
  { id: "padrao-queijo", nome: "queijo", quantidade: 40 },
  { id: "padrao-pizza", nome: "pizza", quantidade: 40 },
  { id: "padrao-fc", nome: "fc", quantidade: 40 },
  { id: "padrao-calabresa", nome: "calabresa", quantidade: 20 },
  { id: "padrao-cq", nome: "c/q", quantidade: 30 },
  { id: "padrao-ovo", nome: "ovo", quantidade: 8 },
  { id: "padrao-cchded", nome: "c.chded", quantidade: 8 },
  { id: "padrao-bauru", nome: "bauru", quantidade: 15 },
  { id: "padrao-seca", nome: "seca", quantidade: 12 },
  { id: "padrao-poro", nome: "poro", quantidade: 10 },
  { id: "padrao-escarola", nome: "escarola", quantidade: 4 },
  { id: "padrao-pernil", nome: "pernil", quantidade: 5 },
  { id: "padrao-costela", nome: "costela", quantidade: 12 },
  { id: "padrao-especial", nome: "especial", quantidade: 12 },
];

export default function RecuperarPlanejamentoPage() {
  const bloqueio = useRef(false);
  const [salvando, setSalvando] = useState(false);
  const [finalizado, setFinalizado] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  async function restaurar() {
    if (bloqueio.current || finalizado) return;

    bloqueio.current = true;
    setSalvando(true);
    setMensagem("");
    setErro("");

    try {
      const criado = await importarPlanejamentoLocal(CHAVE, ITENS);

      setMensagem(
        criado
          ? "Planejamento de Laranjeira restaurado: 296 pastéis."
          : "Esse planejamento já existe. Nenhum dado foi substituído.",
      );

      setFinalizado(true);
    } catch (falha) {
      setErro(
        falha instanceof Error
          ? falha.message
          : "Não foi possível restaurar o planejamento.",
      );
    } finally {
      bloqueio.current = false;
      setSalvando(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 680,
        margin: "40px auto",
        padding: 24,
        fontFamily: "sans-serif",
      }}
    >
      <h1>Restaurar planejamento</h1>

      <p>
        <strong>Laranjeira — 08/10/2026</strong>
      </p>

      <p>15 sabores · 296 pastéis</p>

      <ul>
        {ITENS.map((item) => (
          <li key={item.id}>
            {item.nome}: {item.quantidade}
          </li>
        ))}
      </ul>

      <p>
        Esta ação recria somente o planejamento ausente.
        Saídas, fechamentos e sobras serão preservados.
      </p>

      <button
        type="button"
        onClick={restaurar}
        disabled={salvando || finalizado}
        style={{
          padding: "12px 20px",
          marginTop: 16,
          cursor: salvando || finalizado ? "default" : "pointer",
        }}
      >
        {salvando
          ? "Restaurando..."
          : finalizado
            ? "Verificação concluída"
            : "Restaurar Laranjeira"}
      </button>

      {mensagem && <p role="status">{mensagem}</p>}
      {erro && <p role="alert">{erro}</p>}
    </main>
  );
}