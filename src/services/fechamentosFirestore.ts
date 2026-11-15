"use client";

import { onAuthStateChanged } from "firebase/auth";
import {
  collection, doc, getDoc, onSnapshot, runTransaction,
  serverTimestamp, waitForPendingWrites, type Unsubscribe,
} from "firebase/firestore";
import { firebaseClient } from "@/lib/firebase";
import { baixasFechamentoValidas, faturamentoValido } from "@/lib/faturamento-feira";
import type { ItemSaida } from "@/services/saidasFirestore";

export interface ItemRetorno {
  saborId: string;
  nome: string;
  separados: number;
  sobraram: number;
  guardados: number;
  cortesias?: number;
  perdas?: number;
  motivoCortesia?: string;
  motivoPerda?: string;
}

export interface RegistroRetorno {
  itens: ItemRetorno[];
  registradoEm: string;
  registradoPor: string;
  reaproveitado?: boolean;
  faturamentoCentavos?: number;
}

export type Retornos = Record<string, RegistroRetorno>;
const CHAVE = /^\d{4}-\d{2}-\d{2}:[a-z0-9-]+$/;

function itemValido(valor: unknown): valor is ItemRetorno {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return false;
  const item = valor as Record<string, unknown>;
  return typeof item.saborId === "string" && item.saborId.length > 0 &&
    typeof item.nome === "string" && item.nome.trim().length > 0 &&
    item.guardados === item.sobraram &&
    baixasFechamentoValidas({ separados: item.separados, sobraram: item.sobraram,
      cortesias: item.cortesias, perdas: item.perdas,
      motivoCortesia: item.motivoCortesia, motivoPerda: item.motivoPerda });
}

export function escutarFechamentos(
  receber: (dados: Retornos) => void,
  falhar: (erro: Error) => void,
): Unsubscribe {
  const { auth, db } = firebaseClient();
  let pararDados: Unsubscribe | undefined;
  const pararAuth = onAuthStateChanged(auth, (usuario) => {
    pararDados?.(); pararDados = undefined;
    if (!usuario) {
      falhar(new Error("Entre com sua conta para consultar os fechamentos."));
      return;
    }
    pararDados = onSnapshot(collection(db, "fechamentosFeira"),
      { includeMetadataChanges: true }, (snapshot) => {
        if (snapshot.metadata.fromCache) {
          falhar(new Error("Sem conexão com o Firestore. Os fechamentos podem estar desatualizados."));
          return;
        }
        if (snapshot.metadata.hasPendingWrites) return;
        const proximos: Retornos = {};
        for (const documento of snapshot.docs) {
          const dados = documento.data();
          const data = dados.registradoEm?.toDate?.();
          if (!CHAVE.test(documento.id) || !Array.isArray(dados.itens) ||
            dados.itens.length === 0 || dados.itens.length > 40 || !dados.itens.every(itemValido) ||
            new Set(dados.itens.map((item: ItemRetorno) => item.saborId)).size !== dados.itens.length ||
            !(data instanceof Date) || !Number.isFinite(data.getTime()) ||
            typeof dados.registradoPor !== "string") {
            falhar(new Error(`Fechamento inválido: ${documento.id}. Revise as contagens antes de calcular as vendas.`));
            return;
          }
          proximos[documento.id] = {
            itens: dados.itens,
            registradoEm: data.toISOString(),
            registradoPor: dados.registradoPor,
            reaproveitado: dados.reaproveitado === true,
            ...(faturamentoValido(dados.faturamentoCentavos) ? { faturamentoCentavos: dados.faturamentoCentavos } : {}),
          };
        }
        receber(proximos);
      }, falhar);
  }, falhar);
  return () => { pararAuth(); pararDados?.(); };
}

async function registrar(
  chave: string, itens: ItemRetorno[], original?: RegistroRetorno,
  versao?: string, faturamentoCentavos?: number | null,
) {
  if (!CHAVE.test(chave) || itens.length === 0 || itens.length > 40 ||
    !itens.every(itemValido) || new Set(itens.map((i) => i.saborId)).size !== itens.length) {
    throw new Error("Confira as quantidades. Sobras, cortesias e perdas juntas não podem superar a saída. Justifique as cortesias e perdas com 5 a 200 caracteres.");
  }
  if (faturamentoCentavos != null && !faturamentoValido(faturamentoCentavos)) throw new Error("Faturamento inválido.");
  if (original?.faturamentoCentavos !== undefined && !faturamentoValido(original.faturamentoCentavos)) {
    throw new Error("O registro antigo tem um faturamento inválido.");
  }
  const { auth, db } = firebaseClient();
  const usuario = auth.currentUser;
  if (!usuario) throw new Error("Entre com sua conta para fechar a feira.");
  const perfil = (await getDoc(doc(db, "perfis", usuario.uid))).data();
  const perfis = [perfil?.perfil, ...(Array.isArray(perfil?.perfis) ? perfil.perfis : [])];
  if (original ? !perfis.includes("dono") : !perfis.includes("dono") && !perfis.includes("feirantes")) {
    throw new Error("Seu perfil não pode registrar este fechamento.");
  }
  const separador = chave.indexOf(":");
  const saidaRef = doc(db, "saidasFeira", chave);
  const fechamentoRef = doc(db, "fechamentosFeira", chave);
  const criado = await runTransaction(db, async (transacao) => {
    const saida = await transacao.get(saidaRef);
    const fechamento = await transacao.get(fechamentoRef);
    if (!saida.exists()) throw new Error("Confirme primeiro a saída desta feira no Firestore.");
    if (original && fechamento.exists()) return false;
    if (!original && fechamento.exists() && fechamento.data().reaproveitado) {
      throw new Error("Sobras desta feira já foram destinadas. O Dono precisa revisar esses registros antes de corrigir o fechamento.");
    }
    if (!original && (fechamento.exists() ? fechamento.data().registradoEm?.toDate?.().toISOString() !== versao : Boolean(versao))) {
      throw new Error("O fechamento mudou em outro dispositivo. Atualize a página antes de corrigir.");
    }
    const saidaItens = saida.data().itens as ItemSaida[];
    if (!Array.isArray(saidaItens) || saidaItens.length !== itens.length ||
      new Set(saidaItens.map((item) => item.saborId)).size !== saidaItens.length ||
      itens.some((item) => !saidaItens.some((s) => s.saborId === item.saborId && s.nome === item.nome && s.separado === item.separados))) {
      throw new Error("A saída foi alterada. Reabra a contagem e confira os valores.");
    }
    // Mesma ordem da saída para permitir a conferência também nas regras do Firestore.
    const itensOrdenados = saidaItens.map((s) => {
      const item = itens.find((i) => i.saborId === s.saborId)!;
      return { saborId: item.saborId, nome: item.nome, separados: item.separados,
        sobraram: item.sobraram, guardados: item.sobraram,
        cortesias: item.cortesias ?? 0, perdas: item.perdas ?? 0,
        motivoCortesia: (item.motivoCortesia ?? "").trim(), motivoPerda: (item.motivoPerda ?? "").trim() };
    });
    const valor = faturamentoCentavos === undefined
      ? (original?.faturamentoCentavos ?? fechamento.data()?.faturamentoCentavos) : faturamentoCentavos;
    transacao.set(fechamentoRef, {
      data: chave.slice(0, separador), feiraId: chave.slice(separador + 1),
      itens: itensOrdenados, saidaConferidaEm: saida.data().conferidoEm,
      registradoPor: original?.registradoPor || perfil?.nome || "Funcionário",
      registradoPorId: usuario.uid, registradoEm: serverTimestamp(),
      ...(faturamentoValido(valor) ? { faturamentoCentavos: valor } : {}),
      ...(original ? { dataOriginal: original.registradoEm, importadoPorId: usuario.uid } : {}),
    });
    return true;
  });
  if (criado) await waitForPendingWrites(db);
  return criado;
}

export async function salvarFechamentoFirestore(
  chave: string, itens: ItemRetorno[], versao?: string, faturamentoCentavos?: number | null,
) {
  await registrar(chave, itens, undefined, versao, faturamentoCentavos);
}

export async function importarFechamentoLocal(chave: string, registro: RegistroRetorno) {
  return registrar(chave, registro.itens, registro);
}
