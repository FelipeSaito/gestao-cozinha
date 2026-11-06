"use client";

import { onAuthStateChanged } from "firebase/auth";
import {
  collection, doc, getDoc, onSnapshot, runTransaction,
  serverTimestamp, waitForPendingWrites, type Unsubscribe,
} from "firebase/firestore";
import { firebaseClient } from "@/lib/firebase";
import { faturamentoValido } from "@/lib/faturamento-feira";
import type { ItemSaida } from "@/services/saidasFirestore";

export interface ItemRetorno {
  saborId: string;
  nome: string;
  separados: number;
  sobraram: number;
  guardados: number;
}

export interface RegistroRetorno {
  itens: ItemRetorno[];
  registradoEm: string;
  registradoPor: string;
  reaproveitado?: boolean;
  /** Ausente nos registros antigos ou quando o valor não foi informado. */
  faturamentoCentavos?: number;
}

export type Retornos = Record<string, RegistroRetorno>;
const CHAVE = /^\d{4}-\d{2}-\d{2}:[a-z0-9-]+$/;

function itemValido(valor: unknown): valor is ItemRetorno {
  if (!valor || typeof valor !== "object") return false;
  const item = valor as Record<string, unknown>;
  return typeof item.saborId === "string" && item.saborId.length > 0 &&
    typeof item.nome === "string" && item.nome.trim().length > 0 &&
    typeof item.separados === "number" && Number.isSafeInteger(item.separados) && item.separados >= 0 &&
    typeof item.sobraram === "number" && Number.isSafeInteger(item.sobraram) &&
    item.sobraram >= 0 && item.sobraram <= item.separados &&
    item.guardados === item.sobraram;
}

export function escutarFechamentos(
  receber: (dados: Retornos) => void,
  falhar: (erro: Error) => void,
): Unsubscribe {
  const { auth, db } = firebaseClient();
  let pararDados: Unsubscribe | undefined;
  const pararAuth = onAuthStateChanged(auth, (usuario) => {
    pararDados?.();
    pararDados = undefined;
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
        const proximos: Retornos = {};
        snapshot.forEach((documento) => {
          const dados = documento.data();
          const data = dados.registradoEm?.toDate?.();
          if (CHAVE.test(documento.id) && Array.isArray(dados.itens) &&
            dados.itens.every(itemValido) && data instanceof Date &&
            typeof dados.registradoPor === "string") {
            proximos[documento.id] = {
              itens: dados.itens,
              registradoEm: data.toISOString(),
              registradoPor: dados.registradoPor,
              reaproveitado: dados.reaproveitado === true,
              ...(faturamentoValido(dados.faturamentoCentavos)
                ? { faturamentoCentavos: dados.faturamentoCentavos } : {}),
            };
          }
        });
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
    throw new Error("Confira os sabores e as sobras antes de confirmar.");
  }
  if (faturamentoCentavos != null && !faturamentoValido(faturamentoCentavos)) {
    throw new Error("Faturamento inválido. Informe um valor em centavos inteiros, positivo ou zero.");
  }
  if (original?.faturamentoCentavos !== undefined && !faturamentoValido(original.faturamentoCentavos)) {
    throw new Error("O registro antigo tem um faturamento inválido. Revise antes de importar.");
  }
  const { auth, db } = firebaseClient();
  const usuario = auth.currentUser;
  if (!usuario) throw new Error("Entre com sua conta para fechar a feira.");
  const perfil = (await getDoc(doc(db, "perfis", usuario.uid))).data();
  const perfis = Array.isArray(perfil?.perfis) ? perfil.perfis : [perfil?.perfil];
  if (original ? !perfis.includes("dono") :
    !perfis.includes("dono") && !perfis.includes("feirantes")) {
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
      itens.some((item) => !saidaItens.some((s) =>
        s.saborId === item.saborId && s.nome === item.nome && s.separado === item.separados))) {
      throw new Error("A saída foi alterada. Reabra a contagem e confira os valores.");
    }
    // Chamadas antigas sem o quarto argumento preservam o faturamento remoto.
    // null significa explicitamente não informado; zero continua sendo um valor válido.
    const valor = faturamentoCentavos === undefined
      ? (original?.faturamentoCentavos ?? fechamento.data()?.faturamentoCentavos)
      : faturamentoCentavos;
    const registro = {
      data: chave.slice(0, separador),
      feiraId: chave.slice(separador + 1),
      itens,
      saidaConferidaEm: saida.data().conferidoEm,
      registradoPor: original?.registradoPor || perfil?.nome || "Funcionário",
      registradoPorId: usuario.uid,
      registradoEm: serverTimestamp(),
      ...(faturamentoValido(valor) ? { faturamentoCentavos: valor } : {}),
      ...(original ? { dataOriginal: original.registradoEm, importadoPorId: usuario.uid } : {}),
    };
    transacao.set(fechamentoRef, registro);
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
