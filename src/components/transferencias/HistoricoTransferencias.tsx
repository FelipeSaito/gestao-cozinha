"use client";

import { useEffect, useState } from "react";
import { firebaseClient } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import styles from "./HistoricoTransferencias.module.css";

interface Item {
  id: string; nome: string; lote: string; unidade: string; quantidadeEnviada: number;
}
interface Recebimento {
  itemId: string; quantidadeRecebida: number; observacao: string; recebidoCorretamente: boolean;
}
interface TransferenciaEncerrada {
  id: string; codigo: string; status: "conferida" | "divergencia" | "cancelada";
  criadaEm: string | null; encerradaEm: string | null;
  responsavel: string; recebidoPor: string | null; observacao: string | null;
  itens: Item[]; recebimento: Recebimento[];
}

function dataHora(valor: string | null) {
  if (!valor) return "Data indisponível";
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? valor :
    new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(data);
}

export function HistoricoTransferencias({ atualizacao }: { atualizacao: string | null }) {
  const { usuario } = useAuth();
  const [registros, setRegistros] = useState<TransferenciaEncerrada[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!usuario?.id) return;
    let ativo = true;

    const temporizador = window.setTimeout(() => {
      setCarregando(true);

      void (async () => {
        const conta = firebaseClient().auth.currentUser;
        if (!conta) throw new Error("Faça login para consultar o histórico.");
        const resposta = await fetch("/api/inventario/transferencias/historico", {
          cache: "no-store", headers: { Authorization: `Bearer ${await conta.getIdToken()}` },
        });
        const tipo = resposta.headers.get("content-type") ?? "";
        if (!tipo.includes("application/json")) {
          throw new Error(`A rota /api/inventario/transferencias/historico respondeu HTTP ${resposta.status} em vez de JSON. Confira se o arquivo src/app/api/inventario/transferencias/historico/route.ts está no projeto e veja o terminal do Next.js.`);
        }
        const dados = await resposta.json();
        if (!resposta.ok) throw new Error(dados.erro ?? "Não foi possível carregar o histórico.");
        return dados.transferencias as TransferenciaEncerrada[];
      })().then((dados) => { if (ativo) { setRegistros(dados); setErro(""); } })
        .catch((falha) => { if (ativo) setErro(falha instanceof Error ? falha.message : "Erro ao consultar histórico."); })
        .finally(() => { if (ativo) setCarregando(false); });
    }, 0);

    return () => {
      ativo = false;
      window.clearTimeout(temporizador);
    };
  }, [usuario?.id, atualizacao]);

  return <section className={styles.card} aria-labelledby="titulo-historico-transferencias">
    <div className={styles.heading}>
      <div><h2 id="titulo-historico-transferencias">Histórico de transferências</h2>
        <p>Recebimentos conferidos, divergências e cancelamentos.</p></div>
      <strong>{registros.length}</strong>
    </div>
    {carregando && <p role="status">Carregando histórico...</p>}
    {erro && <p role="alert" className={styles.error}>{erro}</p>}
    {!carregando && !erro && registros.length === 0 && <p>Nenhuma transferência encerrada.</p>}
    {!erro && registros.map((transferencia) => <details key={transferencia.id} className={styles.registro}>
      <summary>
        <span><strong>{transferencia.codigo}</strong> · {transferencia.status === "conferida" ? "Conferida" :
          transferencia.status === "cancelada" ? "Cancelada" : "Com divergência"}</span>
        <time dateTime={transferencia.encerradaEm ?? undefined}>{dataHora(transferencia.encerradaEm)}</time>
      </summary>
      <div className={styles.conteudo}>
        <p>Enviada por {transferencia.responsavel}{transferencia.recebidoPor ?
          ` · recebida por ${transferencia.recebidoPor}` : ""}</p>
        {transferencia.observacao && <p>Observação da transferência: {transferencia.observacao}</p>}
        <ul>{transferencia.itens.map((item) => {
          const recebido = transferencia.recebimento.find((registro) => registro.itemId === item.id);
          const diferenca = recebido ? item.quantidadeEnviada - recebido.quantidadeRecebida : null;
          return <li key={item.id}>
            <strong>{item.nome}</strong> · lote {item.lote}: enviados {item.quantidadeEnviada} {item.unidade}
            {recebido && <> · recebidos {recebido.quantidadeRecebida} {item.unidade}
              {diferenca !== null && diferenca > 0 && <> · diferença {diferenca} {item.unidade}</>}
              {recebido.observacao && <p>Justificativa: {recebido.observacao}</p>}</>}
          </li>;
        })}</ul>
      </div>
    </details>)}
  </section>;
}
