"use client";

import { onAuthStateChanged } from "firebase/auth";
import {
  collection, doc, getDoc, onSnapshot, runTransaction, serverTimestamp, setDoc,
  waitForPendingWrites, type Unsubscribe,
} from "firebase/firestore";
import { firebaseClient } from "@/lib/firebase";

export interface ItemSaida {
  saborId: string;
  nome: string;
  previsto: number;
  separado: number;
}

export interface RegistroSaida {
  itens: ItemSaida[];
  conferidoEm: string;
  conferidoPor: string;
}

export type Saidas = Record<string, RegistroSaida>;
const COLECAO = "saidasFeira";
const CHAVE = /^\d{4}-\d{2}-\d{2}:[a-z0-9-]+$/;

function itemValido(valor: unknown): valor is ItemSaida {
  if (!valor || typeof valor !== "object") return false;
  const item = valor as Record<string, unknown>;
  return typeof item.saborId === "string" && item.saborId.length > 0 &&
    typeof item.nome === "string" && item.nome.trim().length > 0 &&
    typeof item.previsto === "number" && Number.isSafeInteger(item.previsto) && item.previsto > 0 &&
    typeof item.separado === "number" && Number.isSafeInteger(item.separado) && item.separado >= 0;
}

export function escutarSaidas(
  receber: (saidas: Saidas) => void,
  falhar: (erro: Error) => void,
): Unsubscribe {
  const { auth, db } = firebaseClient();
  let pararDados: Unsubscribe | undefined;
  const pararAuth = onAuthStateChanged(auth, (usuario) => {
    pararDados?.();
    pararDados = undefined;
    if (!usuario) {
      falhar(new Error("Entre com sua conta para consultar as saídas."));
      return;
    }
    pararDados = onSnapshot(collection(db, COLECAO), { includeMetadataChanges: true }, (snapshot) => {
      if (snapshot.metadata.fromCache) {
        falhar(new Error("Sem conexão com o Firestore. As saídas podem estar desatualizadas."));
        return;
      }
      const proximas: Saidas = {};
      snapshot.forEach((documento) => {
        const dados = documento.data();
        const data = dados.conferidoEm?.toDate?.();
        if (CHAVE.test(documento.id) && Array.isArray(dados.itens) &&
          dados.itens.every(itemValido) && data instanceof Date &&
          typeof dados.conferidoPor === "string") {
          proximas[documento.id] = {
            itens: dados.itens,
            conferidoEm: data.toISOString(),
            conferidoPor: dados.conferidoPor,
          };
        }
      });
      receber(proximas);
    }, falhar);
  }, falhar);
  return () => { pararAuth(); pararDados?.(); };
}

export async function salvarSaidaFirestore(chave: string, itens: ItemSaida[]) {
  if (!CHAVE.test(chave) || itens.length === 0 || itens.length > 40 ||
    !itens.every(itemValido) || new Set(itens.map((item) => item.saborId)).size !== itens.length) {
    throw new Error("Revise os sabores e as quantidades da saída.");
  }
  const { auth, db } = firebaseClient();
  const usuario = auth.currentUser;
  if (!usuario) throw new Error("Entre com sua conta para confirmar a saída.");
  const perfil = (await getDoc(doc(db, "perfis", usuario.uid))).data();
  const perfis = Array.isArray(perfil?.perfis) ? perfil.perfis : [perfil?.perfil];
  if (!perfis.includes("dono") && !perfis.includes("producao")) {
    throw new Error("Seu perfil não pode confirmar saídas.");
  }
  const separador = chave.indexOf(":");
  await setDoc(doc(db, COLECAO, chave), {
    data: chave.slice(0, separador),
    feiraId: chave.slice(separador + 1),
    itens,
    conferidoPor: typeof perfil?.nome === "string" && perfil.nome.trim() ? perfil.nome : "Funcionário",
    conferidoPorId: usuario.uid,
    conferidoEm: serverTimestamp(),
  });
  await waitForPendingWrites(db);
}

/** Importa apenas conferências que ainda não existem no banco. */
export async function importarSaidaLocal(chave: string, saida: RegistroSaida) {
  if (!CHAVE.test(chave) || !Array.isArray(saida.itens) ||
    saida.itens.length === 0 || saida.itens.length > 40 ||
    !saida.itens.every(itemValido)) throw new Error("Registro local inválido.");
  const { auth, db } = firebaseClient();
  const usuario = auth.currentUser;
  if (!usuario) throw new Error("Entre com sua conta para importar.");
  const perfil = (await getDoc(doc(db, "perfis", usuario.uid))).data();
  const perfis = Array.isArray(perfil?.perfis) ? perfil.perfis : [perfil?.perfil];
  if (!perfis.includes("dono")) throw new Error("Somente o Dono pode importar saídas antigas.");
  const separador = chave.indexOf(":");
  const referencia = doc(db, COLECAO, chave);
  const criado = await runTransaction(db, async (transacao) => {
    if ((await transacao.get(referencia)).exists()) return false;
    transacao.set(referencia, {
      data: chave.slice(0, separador),
      feiraId: chave.slice(separador + 1),
      itens: saida.itens,
      conferidoPor: saida.conferidoPor || "Funcionário",
      conferidoPorId: usuario.uid,
      importadoPorId: usuario.uid,
      conferidoEm: serverTimestamp(),
      // A data original fica separada da data de importação.
      dataOriginal: saida.conferidoEm,
    });
    return true;
  });
  if (criado) await waitForPendingWrites(db);
  return criado;
}
