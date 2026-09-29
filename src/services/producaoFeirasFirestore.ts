"use client";

import { onAuthStateChanged } from "firebase/auth";
import {
  collection, doc, getDoc, onSnapshot, runTransaction,
  serverTimestamp, waitForPendingWrites, type Unsubscribe,
} from "firebase/firestore";
import { firebaseClient } from "@/lib/firebase";

export interface RegistroProducao {
  feira: string;
  saborId: string;
  quantidade: number;
  funcionarioId: string;
  funcionario: string;
}

export type ProducoesFeira = Record<string, RegistroProducao[]>;
const CHAVE = /^\d{4}-\d{2}-\d{2}:[a-z0-9-]+$/;
const SABOR = /^[a-zA-Z0-9-]+$/;

export function escutarProducaoFeiras(
  receber: (dados: ProducoesFeira) => void,
  falhar: (erro: Error) => void,
): Unsubscribe {
  const { auth, db } = firebaseClient();
  let pararDados: Unsubscribe | undefined;
  const pararAuth = onAuthStateChanged(auth, (usuario) => {
    pararDados?.();
    pararDados = undefined;
    if (!usuario) return;
    pararDados = onSnapshot(collection(db, "producaoFeiras"),
      { includeMetadataChanges: true },
      (snapshot) => {
        if (snapshot.metadata.fromCache) {
          falhar(new Error("Sem conexão com o Firestore. A produção pode estar desatualizada."));
          return;
        }
        const dados: ProducoesFeira = {};
        snapshot.forEach((documento) => {
          const valor = documento.data();
          if (!CHAVE.test(valor.feira) || !SABOR.test(valor.saborId) ||
              typeof valor.funcionarioId !== "string" ||
              typeof valor.funcionario !== "string" ||
              !Number.isSafeInteger(valor.quantidade) || valor.quantidade < 0 ||
              documento.id !== `${valor.feira}|${valor.saborId}|${valor.funcionarioId}`) return;
          (dados[valor.feira] ??= []).push({
            feira: valor.feira, saborId: valor.saborId,
            funcionarioId: valor.funcionarioId, funcionario: valor.funcionario,
            quantidade: valor.quantidade,
          });
        });
        receber(dados);
      }, falhar);
  }, falhar);
  return () => { pararAuth(); pararDados?.(); };
}

/** Quantidade acumulada deste funcionário para um sabor nesta feira. */
export async function salvarProducaoFeira(
  feira: string, saborId: string, quantidade: number, nome: string,
) {
  if (!CHAVE.test(feira) || !SABOR.test(saborId) ||
      !Number.isSafeInteger(quantidade) || quantidade < 0 || quantidade > 10000 ||
      !nome.trim() || nome.length > 120) {
    throw new Error("Confira o sabor e a quantidade produzida.");
  }
  const { auth, db } = firebaseClient();
  const usuario = auth.currentUser;
  if (!usuario) throw new Error("Entre com sua conta para registrar a produção.");
  const perfil = (await getDoc(doc(db, "perfis", usuario.uid))).data();
  if (!(perfil?.perfil === "dono" || perfil?.perfil === "producao" ||
      (Array.isArray(perfil?.perfis) &&
        (perfil.perfis.includes("dono") || perfil.perfis.includes("producao"))))) {
    throw new Error("Este perfil não pode registrar a produção.");
  }
  const planoRef = doc(db, "planejamentosFeira", feira);
  const saidaRef = doc(db, "saidasFeira", feira);
  const registroRef = doc(db, "producaoFeiras", `${feira}|${saborId}|${usuario.uid}`);
  await runTransaction(db, async (transacao) => {
    const plano = await transacao.get(planoRef);
    const saida = await transacao.get(saidaRef);
    if (saida.exists()) throw new Error("A saída já foi conferida. Não é possível alterar a produção.");
    const itens = plano.data()?.itens;
    if (!Array.isArray(itens) || !itens.some((item) => item.id === saborId)) {
      throw new Error("Este sabor não consta no planejamento desta feira.");
    }
    transacao.set(registroRef, {
      feira, saborId, quantidade, funcionarioId: usuario.uid,
      funcionario: nome.trim(), atualizadoEm: serverTimestamp(),
    });
  });
  await waitForPendingWrites(db);
}
