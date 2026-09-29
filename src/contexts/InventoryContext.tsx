"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { onAuthStateChanged } from "firebase/auth";
import type { Product, Transfer } from "@/types";
import { firebaseClient } from "@/lib/firebase";
import {
  buscarInventario,
  cancelarTransferencia,
  enviarTransferencia,
  receberTransferencia,
  type ItemRecebido,
} from "@/services/inventarioFirestore";

interface CreateTransferData {
  produtoId: string;
  quantidade: number;
  observacao?: string;
}

export type ReceivedTransferItem = ItemRecebido;

interface ConfirmReceiptData {
  transferenciaId: string;
  itens: ReceivedTransferItem[];
}

interface InventoryContextValue {
  produtos: Product[];
  estoqueCozinha: Product[];
  transferencias: Transfer[];
  carregando: boolean;
  erro: string | null;
  atualizarInventario: () => Promise<void>;
  criarTransferencia: (data: CreateTransferData) => Promise<void>;
  confirmarRecebimento: (data: ConfirmReceiptData) => Promise<void>;
  removerTransferencia: (transferenciaId: string) => Promise<void>;
}

const InventoryContext = createContext<InventoryContextValue | null>(null);

export function InventoryProvider({ children }: { children: ReactNode }) {
  const [produtos, setProdutos] = useState<Product[]>([]);
  const [estoqueCozinha, setEstoqueCozinha] = useState<Product[]>([]);
  const [transferencias, setTransferencias] = useState<Transfer[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // Ignora respostas de uma conta anterior após sair ou trocar de usuário.
  const versao = useRef(0);
  const ultimaConsulta = useRef(0);

  const atualizarInventario = useCallback(async () => {
    const auth = firebaseClient().auth;
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const solicitacao = versao.current;
    const consulta = ++ultimaConsulta.current;
    try {
      const dados = await buscarInventario();
      if (versao.current !== solicitacao ||
          ultimaConsulta.current !== consulta || auth.currentUser?.uid !== uid) return;
      setProdutos(dados.produtos);
      setEstoqueCozinha(dados.estoqueCozinha);
      setTransferencias(dados.transferencias);
      setErro(null);
    } catch (falha) {
      if (versao.current !== solicitacao || ultimaConsulta.current !== consulta) return;
      const mensagem = falha instanceof Error ? falha.message : "Falha ao carregar o estoque.";
      setErro(mensagem);
      throw falha;
    } finally {
      if (versao.current === solicitacao && ultimaConsulta.current === consulta) {
        setCarregando(false);
      }
    }
  }, []);

  useEffect(() => {
    const { auth } = firebaseClient();
    let ativo = true;

    const cancelar = onAuthStateChanged(auth, (usuario) => {
      versao.current += 1;
      ultimaConsulta.current += 1;
      setProdutos([]);
      setEstoqueCozinha([]);
      setTransferencias([]);
      setErro(null);
      setCarregando(Boolean(usuario));

      if (usuario) {
        void atualizarInventario().catch(() => {});
      }
    });

    const intervalo = window.setInterval(() => {
      if (ativo && auth.currentUser && document.visibilityState === "visible") {
        void atualizarInventario().catch(() => {});
      }
    }, 30000);

    function aoVoltar() {
      if (auth.currentUser) void atualizarInventario().catch(() => {});
    }

    window.addEventListener("focus", aoVoltar);
    return () => {
      ativo = false;
      versao.current += 1;
      ultimaConsulta.current += 1;
      cancelar();
      window.clearInterval(intervalo);
      window.removeEventListener("focus", aoVoltar);
    };
  }, [atualizarInventario]);

  const criarTransferencia = useCallback(async ({
    produtoId, quantidade, observacao,
  }: CreateTransferData) => {
    setErro(null);
    try {
      await enviarTransferencia(produtoId, quantidade, observacao);
      try { await atualizarInventario(); } catch { /* A gravação já foi confirmada. */ }
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Falha ao criar transferência.");
      throw falha;
    }
  }, [atualizarInventario]);

  const confirmarRecebimento = useCallback(async ({
    transferenciaId, itens,
  }: ConfirmReceiptData) => {
    setErro(null);
    try {
      await receberTransferencia(transferenciaId, itens);
      try { await atualizarInventario(); } catch { /* A gravação já foi confirmada. */ }
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Falha ao receber transferência.");
      throw falha;
    }
  }, [atualizarInventario]);

  // No inventário persistido, remover uma pendência significa cancelar
  // e devolver ao estoque principal a quantidade que tinha sido enviada.
  const removerTransferencia = useCallback(async (transferenciaId: string) => {
    setErro(null);
    try {
      await cancelarTransferencia(transferenciaId);
      try { await atualizarInventario(); } catch { /* A gravação já foi confirmada. */ }
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Falha ao cancelar transferência.");
      throw falha;
    }
  }, [atualizarInventario]);

  const valor = useMemo<InventoryContextValue>(() => ({
    produtos,
    estoqueCozinha,
    transferencias,
    carregando,
    erro,
    atualizarInventario,
    criarTransferencia,
    confirmarRecebimento,
    removerTransferencia,
  }), [
    produtos, estoqueCozinha, transferencias, carregando, erro,
    atualizarInventario, criarTransferencia, confirmarRecebimento,
    removerTransferencia,
  ]);

  return <InventoryContext.Provider value={valor}>{children}</InventoryContext.Provider>;
}

export function useInventory() {
  const contexto = useContext(InventoryContext);
  if (!contexto) throw new Error("useInventory deve ser utilizado dentro de InventoryProvider.");
  return contexto;
}
