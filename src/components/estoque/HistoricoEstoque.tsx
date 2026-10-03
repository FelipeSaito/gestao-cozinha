"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Product } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import { firebaseClient } from "@/lib/firebase";

interface Movimento {
  id: string;
  tipo: string;
  quantidade: number;
  saldoAnterior: number;
  saldoNovo: number;
  justificativa: string | null;
  transferenciaId: string | null;
  registradoPor: string;
  registradoEm: string | null;
}

const TITULOS: Record<string, string> = {
  entrada: "Entrada", transferencia: "Transferência para a cozinha",
  "cancelamento-transferencia": "Cancelamento de transferência", correcao: "Correção de saldo",
};

export function HistoricoEstoque({ produtos, onCorrigido }: {
  produtos: Product[];
  onCorrigido: () => Promise<void>;
}) {
  const { usuario } = useAuth();
  const autorizado = Boolean(usuario?.perfil === "dono" || usuario?.perfil === "administracao" ||
    usuario?.perfis?.includes("dono") || usuario?.perfis?.includes("administracao"));
  const [produtoId, setProdutoId] = useState("");
  const produto = produtos.find((item) => item.id === produtoId);
  const [movimentos, setMovimentos] = useState<Movimento[]>([]);
  const [novoSaldo, setNovoSaldo] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const operacaoId = useRef<string | null>(null);
  const enviando = useRef(false);

  async function requisitar(url: string, init?: RequestInit) {
    const conta = firebaseClient().auth.currentUser;
    if (!conta) throw new Error("Faça login novamente.");
    const resposta = await fetch(url, {
      ...init, cache: "no-store",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await conta.getIdToken()}` },
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro ?? "Não foi possível consultar o estoque.");
    return dados;
  }

  useEffect(() => {
    if (!produtoId || !autorizado) return;
    let ativo = true;

    const temporizador = window.setTimeout(() => {
      setCarregando(true);
      setErro("");

      void requisitar(`/api/inventario/movimentacoes?produtoId=${encodeURIComponent(produtoId)}`)
        .then((dados) => {
          if (ativo) setMovimentos(dados.movimentos);
        })
        .catch((falha) => {
          if (ativo) setErro(falha.message);
        })
        .finally(() => {
          if (ativo) setCarregando(false);
        });
    }, 0);

    return () => {
      ativo = false;
      window.clearTimeout(temporizador);
    };
  }, [produtoId, autorizado]);

  async function corrigir(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!produto || enviando.current) return;
    const numero = Number(novoSaldo.replace(",", "."));
    if (!novoSaldo.trim() || !Number.isFinite(numero) || numero < 0 ||
      Math.abs(numero * 1000 - Math.round(numero * 1000)) > 1e-7 ||
      justificativa.trim().length < 10) {
      setErro("Informe o novo saldo e uma justificativa de pelo menos 10 caracteres.");
      return;
    }
    enviando.current = true;
    setSalvando(true);
    setErro("");
    setSucesso("");
    operacaoId.current ??= crypto.randomUUID();
    try {
      await requisitar("/api/inventario/movimentacoes", {
        method: "POST", body: JSON.stringify({
          operacaoId: operacaoId.current, produtoId: produto.id,
          saldoEsperado: produto.quantidade, novoSaldo: numero, justificativa: justificativa.trim(),
        }),
      });
      operacaoId.current = null;
      setNovoSaldo("");
      setJustificativa("");
      setSucesso("Correção registrada no histórico.");
      await onCorrigido();
      const dados = await requisitar(`/api/inventario/movimentacoes?produtoId=${encodeURIComponent(produto.id)}`);
      setMovimentos(dados.movimentos);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível corrigir o saldo.");
    } finally {
      enviando.current = false;
      setSalvando(false);
    }
  }

  if (!autorizado) return null;
  return (
    <section aria-labelledby="titulo-historico-estoque" style={{ padding: 20, border: "1px solid var(--color-border)", borderRadius: 16, background: "var(--color-surface)", display: "grid", gap: 16 }}>
      <div>
        <h2 id="titulo-historico-estoque">Histórico e correção do estoque principal</h2>
        <p>Selecione um ingrediente para consultar entradas, transferências e ajustes.</p>
      </div>
      <label style={{ display: "grid", gap: 6 }}>Ingrediente e lote
        <select value={produtoId} onChange={(event) => {
          setProdutoId(event.target.value); setMovimentos([]); setErro(""); setSucesso("");
          setNovoSaldo(""); setJustificativa(""); operacaoId.current = null;
        }} style={{ minHeight: 44, padding: 8, maxWidth: 480 }}>
          <option value="">Selecione um ingrediente</option>
          {produtos.map((item) => <option key={item.id} value={item.id}>{item.nome} — lote {item.lote}</option>)}
        </select>
      </label>
      {produto && <>
        <p>Saldo atual: <strong>{produto.quantidade} {produto.unidade}</strong></p>
        <form onSubmit={corrigir} style={{ display: "grid", gap: 12, maxWidth: 480 }}>
          <label style={{ display: "grid", gap: 6 }}>Novo saldo ({produto.unidade})
            <input type="number" inputMode="decimal" min="0" step="0.001" required value={novoSaldo}
              onChange={(event) => { setNovoSaldo(event.target.value); operacaoId.current = null; }}
              style={{ minHeight: 44, padding: 8 }} />
          </label>
          <label style={{ display: "grid", gap: 6 }}>Motivo da correção
            <textarea required minLength={10} maxLength={500} rows={3} value={justificativa}
              onChange={(event) => { setJustificativa(event.target.value); operacaoId.current = null; }}
              placeholder="Ex.: contagem física encontrou diferença no lote"
              style={{ padding: 8 }} />
          </label>
          <button type="submit" disabled={salvando} style={{ minHeight: 44, padding: "8px 16px", cursor: "pointer" }}>
            {salvando ? "Salvando..." : "Registrar correção"}
          </button>
        </form>
        {carregando && <p role="status">Carregando histórico...</p>}
        {erro && <p role="alert" style={{ color: "#b42318" }}>{erro}</p>}
        {sucesso && <p role="status">{sucesso}</p>}
        {!carregando && <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead><tr><th>Data</th><th>Operação</th><th>Variação</th><th>Saldo</th><th>Responsável / motivo</th></tr></thead>
            <tbody>{movimentos.map((item) => <tr key={item.id}>
              <td>{item.registradoEm ? new Date(item.registradoEm).toLocaleString("pt-BR") : "—"}</td>
              <td>{TITULOS[item.tipo] ?? item.tipo}</td>
              <td>{item.quantidade > 0 ? "+" : ""}{item.quantidade} {produto.unidade}</td>
              <td>{item.saldoAnterior} → {item.saldoNovo}</td>
              <td>{item.registradoPor}{item.justificativa ? ` · ${item.justificativa}` : ""}</td>
            </tr>)}</tbody>
          </table>
          {movimentos.length === 0 && <p>Nenhuma movimentação registrada para este ingrediente.</p>}
        </div>}
      </>}
    </section>
  );
}
