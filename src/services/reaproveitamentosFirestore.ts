"use client";

import { onAuthStateChanged } from "firebase/auth";
import {
  collection, doc, getDoc, onSnapshot, runTransaction,
  serverTimestamp, waitForPendingWrites, type Unsubscribe,
} from "firebase/firestore";
import { firebaseClient } from "@/lib/firebase";
import type { ItemRetorno } from "@/services/fechamentosFirestore";
import type { SaborPlanejado } from "@/services/planejamentosFirestore";

export type Reaproveitamentos = Record<string, Record<string, number>>;
const CHAVE = /^\d{4}-\d{2}-\d{2}:[a-z0-9-]+$/;
const ORIGEM = /^\d{4}-\d{2}-\d{2}:[a-z0-9-]+\|[a-zA-Z0-9-]+$/;

function nomeNormalizado(nome: string) {
  return nome.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

function alocacoesValidas(valor: unknown): valor is Record<string, number> {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor) &&
    Object.entries(valor).every(([origem, quantidade]) =>
      ORIGEM.test(origem) && Number.isSafeInteger(quantidade) && quantidade > 0);
}

function destinosValidos(valor: unknown): valor is Record<string, number> {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor) &&
    Object.entries(valor).every(([destino, quantidade]) =>
      CHAVE.test(destino) && Number.isSafeInteger(quantidade) && quantidade > 0);
}

export function escutarReaproveitamentos(
  receber: (dados: Reaproveitamentos) => void,
  falhar: (erro: Error) => void,
): Unsubscribe {
  const { auth, db } = firebaseClient();
  let pararDados: Unsubscribe | undefined;
  const pararAuth = onAuthStateChanged(auth, (usuario) => {
    pararDados?.();
    pararDados = undefined;
    if (!usuario) {
      falhar(new Error("Entre com sua conta para consultar o reaproveitamento."));
      return;
    }
    pararDados = onSnapshot(collection(db, "reaproveitamentosFeira"),
      { includeMetadataChanges: true }, (snapshot) => {
        if (snapshot.metadata.fromCache) {
          falhar(new Error("Sem conexão com o Firestore. Os saldos podem estar desatualizados."));
          return;
        }
        const proximos: Reaproveitamentos = {};
        snapshot.forEach((documento) => {
          const itens = documento.data().itens;
          if (CHAVE.test(documento.id) && alocacoesValidas(itens)) {
            proximos[documento.id] = itens;
          }
        });
        receber(proximos);
      }, falhar);
  }, falhar);
  return () => { pararAuth(); pararDados?.(); };
}

export async function salvarReaproveitamentoFirestore(
  destino: string,
  propostos: Record<string, number>,
  /** Preenchido somente para importar o registro antigo sem substituir o remoto. */
  somenteSeAusente = false,
) {
  if (!CHAVE.test(destino) || !alocacoesValidas(propostos) || Object.keys(propostos).length > 40) {
    throw new Error("Confira os lotes e as quantidades antes de salvar.");
  }
  const { auth, db } = firebaseClient();
  const usuario = auth.currentUser;
  if (!usuario) throw new Error("Entre com sua conta para salvar.");
  const perfil = (await getDoc(doc(db, "perfis", usuario.uid))).data();
  if (perfil?.perfil !== "dono" &&
    !(Array.isArray(perfil?.perfis) && perfil.perfis.includes("dono"))) {
    throw new Error("Somente o Dono pode destinar sobras.");
  }
  const destinoRef = doc(db, "reaproveitamentosFeira", destino);
  const planoRef = doc(db, "planejamentosFeira", destino);
  const saidaRef = doc(db, "saidasFeira", destino);
  const gravou = await runTransaction(db, async (transacao) => {
    const destinoAtual = await transacao.get(destinoRef);
    const plano = await transacao.get(planoRef);
    const saida = await transacao.get(saidaRef);
    if (somenteSeAusente && destinoAtual.exists()) return false;
    if (!plano.exists()) throw new Error("O Dono precisa planejar a feira de destino antes de usar as sobras.");
    if (saida.exists() && !somenteSeAusente) {
      throw new Error("A saída da feira de destino já foi conferida. O reaproveitamento precisa ser definido antes da saída.");
    }
    const antigos = destinoAtual.exists() ? destinoAtual.data().itens : {};
    if (!alocacoesValidas(antigos)) throw new Error("Reaproveitamento existente inválido.");
    const origens = [...new Set([...Object.keys(antigos), ...Object.keys(propostos)])];
    if (origens.length > 40 || origens.some((origem) => !ORIGEM.test(origem))) {
      throw new Error("Há lotes demais ou um lote inválido.");
    }
    const lotes = [];
    for (const origem of origens) {
      const indice = origem.lastIndexOf("|");
      const feiraOrigem = origem.slice(0, indice);
      const saborId = origem.slice(indice + 1);
      const fechamentoRef = doc(db, "fechamentosFeira", feiraOrigem);
      const saldoRef = doc(db, "saldoSobrasFeira", origem);
      const fechamento = await transacao.get(fechamentoRef);
      const saldo = await transacao.get(saldoRef);
      if (!fechamento.exists()) throw new Error(`Fechamento de ${feiraOrigem} não encontrado.`);
      const item = (fechamento.data().itens as ItemRetorno[]).find((i) => i.saborId === saborId);
      if (!item || feiraOrigem.slice(0, 10) >= destino.slice(0, 10)) {
        throw new Error("O lote precisa vir de uma feira anterior com sobras registradas.");
      }
      const alocacoes = saldo.exists() ? saldo.data().alocacoes : {};
      if (!destinosValidos(alocacoes)) throw new Error("Saldo do lote inválido.");
      lotes.push({ origem, item, fechamentoRef, saldoRef, fechamento, alocacoes });
    }
    const sabores = plano.data().itens as SaborPlanejado[];
    if (!Array.isArray(sabores)) throw new Error("Planejamento inválido.");
    const marcados = new Set<string>();
    for (const lote of lotes) {
      const novoValor = propostos[lote.origem] ?? 0;
      const outrasFeiras = Object.entries(lote.alocacoes).reduce((soma, [chave, quantidade]) =>
        soma + (chave === destino ? 0 : quantidade), 0);
      if (novoValor + outrasFeiras > lote.item.sobraram ||
        (novoValor > 0 && !sabores.some((s) => nomeNormalizado(s.nome) === nomeNormalizado(lote.item.nome)))) {
        throw new Error(`Saldo insuficiente ou sabor incompatível: ${lote.item.nome}. Atualize a página e revise.`);
      }
    }
    for (const sabor of sabores) {
      const usado = lotes.reduce((soma, lote) => soma +
        (nomeNormalizado(lote.item.nome) === nomeNormalizado(sabor.nome) ? (propostos[lote.origem] ?? 0) : 0), 0);
      if (usado > sabor.quantidade) throw new Error(`O uso de ${sabor.nome} supera o planejamento da feira.`);
    }
    // Todas as leituras ocorreram acima; gravações e saldo mudam juntos.
    for (const lote of lotes) {
      const alocacoes = { ...lote.alocacoes };
      if (propostos[lote.origem]) alocacoes[destino] = propostos[lote.origem];
      else delete alocacoes[destino];
      const totalAlocado = Object.values(alocacoes).reduce((soma, numero) => soma + numero, 0);
      transacao.set(lote.saldoRef, {
        origem: lote.origem,
        totalSobras: lote.item.sobraram,
        alocacoes,
        totalAlocado,
        alteradoPor: usuario.uid,
        atualizadoEm: serverTimestamp(),
      });
      const feiraOrigem = lote.origem.slice(0, lote.origem.lastIndexOf("|"));
      if (propostos[lote.origem] && !lote.fechamento.data().reaproveitado && !marcados.has(feiraOrigem)) {
        transacao.update(lote.fechamentoRef, { reaproveitado: true });
        marcados.add(feiraOrigem);
      }
    }
    transacao.set(destinoRef, {
      destino,
      itens: propostos,
      alteradoPor: usuario.uid,
      atualizadoEm: serverTimestamp(),
    });
    return true;
  });
  if (gravou) await waitForPendingWrites(db);
  return gravou;
}
