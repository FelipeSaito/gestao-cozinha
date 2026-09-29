"use client";

import {
  ArrowLeft, ArrowRight, CheckCircle2, ClipboardCheck, ImageUp,
  MapPin, Save, UserRound,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { TransferCard } from "@/components/transferencias/TransferCard";
import { ReceiptCheck } from "@/components/transferencias/ReceiptCheck";
import { HistoricoTransferencias } from "@/components/transferencias/HistoricoTransferencias";
import { useConferenciaRecebimento } from "@/hooks/useConferenciaRecebimento";
import { usuarioTransferencias } from "@/services/usuarios";
import { cn } from "@/lib/cn";
import styles from "./page.module.css";

export default function TransferenciasPage() {
  const {
    transferencias, selecionadaId, selecionada, itensState,
    temDivergencia, fotoNome, feedback, mobileView, processando,
    carregando, erroInventario, selecionar, atualizarItem, definirFoto,
    voltarParaLista, limparFeedback, salvarRascunho, confirmar,
  } = useConferenciaRecebimento();

  return (
    <AppLayout user={usuarioTransferencias} title="Transferências pendentes"
      subtitle="Confira os itens recebidos do estoque principal">
      <div className={styles.layout}>
        <aside className={cn(styles.listColumn, mobileView === "detail" && styles.hiddenMobile)}>
          <div className={styles.listHeader}>
            <h2 className={styles.listTitle}>Pendentes</h2>
            <span className={styles.listCount}>{transferencias.length}</span>
          </div>
          <div className={styles.list}>
            {carregando ? (
              <div className={styles.listEmpty}>Carregando transferências...</div>
            ) : transferencias.length === 0 ? (
              <div className={styles.listEmpty}>
                <CheckCircle2 size={28} aria-hidden="true" />
                Nenhuma transferência pendente.
              </div>
            ) : (
              transferencias.map((transferencia) => (
                <TransferCard key={transferencia.id} transfer={transferencia}
                  selected={transferencia.id === selecionadaId} onSelect={selecionar} />
              ))
            )}
          </div>
        </aside>

        <section className={cn(styles.detailColumn, mobileView === "list" && styles.hiddenMobile)}>
          <div role="status" aria-live="polite" aria-atomic="true">
            {erroInventario && (
              <Alert variant="danger" className={styles.feedback}>
                Não foi possível atualizar o inventário: {erroInventario}
              </Alert>
            )}
            {feedback && (
              <Alert variant={feedback.tipo} onClose={limparFeedback} className={styles.feedback}>
                {feedback.texto}
              </Alert>
            )}
          </div>

          {selecionada && itensState ? (
            <div className={styles.detailCard}>
              <div className={styles.detailHeader}>
                <button type="button" className={styles.backButton}
                  onClick={voltarParaLista} disabled={processando}>
                  <ArrowLeft size={16} aria-hidden="true" /> Voltar à lista
                </button>
                <span className={styles.detailCode}>{selecionada.codigo}</span>
              </div>

              <div className={styles.infoGrid}>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}><MapPin size={14} aria-hidden="true" /> Origem</span>
                  <span className={styles.infoValue}>{selecionada.origem}</span>
                </div>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}><ArrowRight size={14} aria-hidden="true" /> Destino</span>
                  <span className={styles.infoValue}>{selecionada.destino}</span>
                </div>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}><UserRound size={14} aria-hidden="true" /> Responsável</span>
                  <span className={styles.infoValue}>{selecionada.responsavel}</span>
                </div>
              </div>

              <div className={styles.itemsHeader}>
                <ClipboardCheck size={18} aria-hidden="true" /> Produtos recebidos
              </div>

              <div className={styles.items} aria-busy={processando}>
                {selecionada.itens.map((item) => {
                  const estado = itensState[item.id];
                  if (!estado) return null;
                  return (
                    <ReceiptCheck key={item.id} item={item} state={estado}
                      onChange={(next) => atualizarItem(item.id, next)} />
                  );
                })}
              </div>

              <label className={styles.upload}>
                <ImageUp size={20} aria-hidden="true" />
                <span>{fotoNome ?? "Anexar foto do recebimento (opcional)"}</span>
                <input type="file" accept="image/*" className={styles.uploadInput}
                  disabled={processando}
                  onChange={(event) => definirFoto(event.target.files?.[0]?.name ?? null)} />
              </label>

              <div className={styles.footer}>
                <Button variant="ghost" leftIcon={<Save size={18} />}
                  onClick={salvarRascunho} disabled={processando}>
                  Salvar rascunho
                </Button>
                <Button variant={temDivergencia ? "danger" : "success"}
                  leftIcon={<CheckCircle2 size={18} />} onClick={confirmar}
                  disabled={processando}>
                  {processando ? "Confirmando..." : temDivergencia
                    ? "Confirmar com divergência" : "Confirmar recebimento"}
                </Button>
              </div>
            </div>
          ) : (
            <div className={styles.detailEmpty}>
              <CheckCircle2 size={36} aria-hidden="true" />
              <p className={styles.detailEmptyTitle}>
                {carregando ? "Carregando..." : "Tudo conferido por aqui"}
              </p>
              <p className={styles.detailEmptyText}>
                {carregando ? "Buscando o estoque no Firebase." :
                  "Não há transferências pendentes de recebimento no momento."}
              </p>
            </div>
          )}
        </section>
      </div>
      <HistoricoTransferencias atualizacao={feedback?.tipo === "success" ? feedback.texto : null} />
    </AppLayout>
  );
}
