"use client";

import { useRef, useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import type { NovoProduto } from "@/services/produtosFirestore";
import styles from "./NewProductModal.module.css";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (produto: NovoProduto) => Promise<void>;
}

function numero(valor: string) {
  const limpo = valor.trim().replace(",", ".");
  return /^\d+(?:\.\d+)?$/.test(limpo) ? Number(limpo) : NaN;
}

export function NewProductModal({ open, onClose, onConfirm }: Props) {
  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState("");
  const [lote, setLote] = useState("");
  const [validade, setValidade] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [unidade, setUnidade] = useState("");
  const [custo, setCusto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const trava = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  function fechar() {
    if (!trava.current) onClose();
  }

  async function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (trava.current) return;
    const qtd = numero(quantidade);
    const preco = numero(custo);
    if (!nome.trim() || !categoria.trim() || !lote.trim() || !validade || !unidade.trim() ||
        !Number.isFinite(qtd) || qtd <= 0 || !Number.isFinite(preco) || preco < 0) {
      setErro("Preencha todos os campos e confira quantidade e custo.");
      return;
    }

    trava.current = true;
    setSalvando(true);
    setErro(null);
    try {
      await onConfirm({
        nome: nome.trim(), categoria: categoria.trim(), lote: lote.trim(),
        validade, quantidade: qtd, unidade: unidade.trim(), custoUnitario: preco,
      });
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível cadastrar o produto.");
    } finally {
      trava.current = false;
      setSalvando(false);
    }
  }

  return (
    <Modal open={open} onClose={fechar} title="Registrar ingrediente"
      footer={
        <>
          <Button variant="secondary" onClick={fechar} disabled={salvando}>Cancelar</Button>
          <Button variant="primary" onClick={() => formRef.current?.requestSubmit()} disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar ingrediente"}
          </Button>
        </>
      }>
      <form ref={formRef} className={styles.form} onSubmit={enviar}>
        <p className={styles.note}>Cadastre um lote por vez. O sistema calcula a situação pela validade e quantidade.</p>
        <div className={styles.grid}>
          <label>Nome do ingrediente
            <input value={nome} onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Óleo de soja" maxLength={120} required disabled={salvando} />
          </label>
          <label>Categoria
            <input value={categoria} onChange={(e) => setCategoria(e.target.value)}
              placeholder="Ex.: Óleos" maxLength={80} required disabled={salvando} />
          </label>
          <label>Código do lote
            <input value={lote} onChange={(e) => setLote(e.target.value)}
              placeholder="Copie da embalagem" maxLength={80} required disabled={salvando} />
          </label>
          <label>Validade
            <input type="date" value={validade} onChange={(e) => setValidade(e.target.value)}
              required disabled={salvando} />
            {validade && <small>Selecionada: {validade.split("-").reverse().join("/")}</small>}
          </label>
          <label>Quantidade atual
            <input value={quantidade} onChange={(e) => setQuantidade(e.target.value)}
              inputMode="decimal" placeholder="Ex.: 10" required disabled={salvando} />
          </label>
          <label>Unidade
            <input value={unidade} onChange={(e) => setUnidade(e.target.value)}
              placeholder="Ex.: kg ou litros" maxLength={20} required disabled={salvando} />
          </label>
          <label>Custo por unidade (R$)
            <input value={custo} onChange={(e) => setCusto(e.target.value)}
              inputMode="decimal" placeholder="Ex.: 7,99" required disabled={salvando} />
          </label>
        </div>
        {erro && <Alert variant="danger">{erro}</Alert>}
      </form>
    </Modal>
  );
}
