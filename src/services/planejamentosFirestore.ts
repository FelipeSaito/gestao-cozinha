"use client";

import { onAuthStateChanged } from "firebase/auth";
import {
  collection, doc, getDoc, onSnapshot, runTransaction,
  serverTimestamp, setDoc, waitForPendingWrites, type Unsubscribe,
} from "firebase/firestore";
import { firebaseClient } from "@/lib/firebase";

export interface SaborPlanejado {
  id: string;
  nome: string;
  quantidade: number;
}

export type Planejamentos = Record<string, SaborPlanejado[]>;
const COLECAO = "planejamentosFeira";
const CHAVE = /^\d{4}-\d{2}-\d{2}:[a-z0-9-]+$/;

function itemValido(item: unknown): item is SaborPlanejado {
  if (!item || typeof item !== "object") return false;
  const valor = item as Record<string, unknown>;
  return typeof valor.id === "string" && valor.id.length > 0 &&
    typeof valor.nome === "string" && valor.nome.trim().length > 0 &&
    typeof valor.quantidade === "number" && Number.isSafeInteger(valor.quantidade) &&
    valor.quantidade > 0;
}

function validar(chave: string, itens: SaborPlanejado[]) {
  if (!CHAVE.test(chave)) throw new Error("Data ou feira inválida.");
  if (itens.length > 40 || !itens.every(itemValido) ||
    new Set(itens.map((item) => item.id)).size !== itens.length) {
    throw new Error("Confira os sabores e as quantidades antes de salvar.");
  }
}

async function autenticarDono() {
  const { auth, db } = firebaseClient();
  const usuario = auth.currentUser;
  if (!usuario) throw new Error("Entre com uma conta Firebase para salvar.");
  const perfil = await getDoc(doc(db, "perfis", usuario.uid));
  const dados = perfil.data();
  if (dados?.perfil !== "dono" &&
    !(Array.isArray(dados?.perfis) && dados.perfis.includes("dono"))) {
    throw new Error("Somente o Dono pode planejar feiras.");
  }
  return { db, usuario };
}

function registro(chave: string, itens: SaborPlanejado[], uid: string) {
  const separador = chave.indexOf(":");
  return {
    data: chave.slice(0, separador),
    feiraId: chave.slice(separador + 1),
    itens,
    alteradoPor: uid,
    atualizadoEm: serverTimestamp(),
  };
}

export function escutarPlanejamentos(
  receber: (itens: Planejamentos) => void,
  falhar: (erro: Error) => void,
): Unsubscribe {
  const { auth, db } = firebaseClient();
  let pararDados: Unsubscribe | undefined;
  const pararAuth = onAuthStateChanged(auth, (usuario) => {
    pararDados?.();
    pararDados = undefined;
    if (!usuario) {
      falhar(new Error("Entre com sua conta para consultar os planejamentos."));
      return;
    }
    pararDados = onSnapshot(collection(db, COLECAO), { includeMetadataChanges: true }, (snapshot) => {
      // Não tratar o cache local como confirmação de sincronização.
      if (snapshot.metadata.fromCache) {
        falhar(new Error("Sem conexão com o Firestore. Os planejamentos não estão atualizados."));
        return;
      }
      const proximos: Planejamentos = {};
      snapshot.forEach((documento) => {
        const dados = documento.data();
        if (CHAVE.test(documento.id) && Array.isArray(dados.itens) &&
          dados.itens.every(itemValido)) proximos[documento.id] = dados.itens;
      });
      receber(proximos);
    }, falhar);
  }, falhar);
  return () => { pararAuth(); pararDados?.(); };
}

export async function salvarPlanejamentoFirestore(chave: string, itens: SaborPlanejado[]) {
  validar(chave, itens);
  const { db, usuario } = await autenticarDono();
  await setDoc(doc(db, COLECAO, chave), registro(chave, itens, usuario.uid));
  await waitForPendingWrites(db);
}

/** Cria apenas os planos ausentes. Nunca substitui o planejamento de outro dispositivo. */
export async function importarPlanejamentoLocal(chave: string, itens: SaborPlanejado[]) {
  validar(chave, itens);
  const { db, usuario } = await autenticarDono();
  const referencia = doc(db, COLECAO, chave);
  const criado = await runTransaction(db, async (transacao) => {
    if ((await transacao.get(referencia)).exists()) return false;
    transacao.set(referencia, registro(chave, itens, usuario.uid));
    return true;
  });
  if (criado) await waitForPendingWrites(db);
  return criado;
}