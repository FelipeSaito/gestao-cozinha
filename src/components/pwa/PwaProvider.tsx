"use client";

import { useEffect, useState } from "react";

export function PwaProvider() {
  const [semConexao, setSemConexao] = useState(false);
  useEffect(() => {
    const atualizar = () => setSemConexao(!navigator.onLine);
    atualizar();
    window.addEventListener("online", atualizar);
    window.addEventListener("offline", atualizar);
    let ativo = true;
    const atualizarWorker = () => {
      if (document.visibilityState === "visible" && navigator.onLine && "serviceWorker" in navigator && process.env.NODE_ENV === "production") {
        void navigator.serviceWorker.getRegistration("/").then(registro => registro?.update()).catch(() => {});
      }
    };
    // O worker fica apenas no ambiente de produção, sem interferir no next dev.
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator && window.isSecureContext) {
      void navigator.serviceWorker.register("/cozinha-sw.js", { scope: "/", updateViaCache: "none" }).then(registro => {
        if (ativo) void registro.update().catch(() => {});
      }).catch(erro => console.error("Não foi possível ativar o acesso instalado da cozinha.", erro));
    }
    document.addEventListener("visibilitychange", atualizarWorker);
    return () => {
      ativo = false;
      window.removeEventListener("online", atualizar);
      window.removeEventListener("offline", atualizar);
      document.removeEventListener("visibilitychange", atualizarWorker);
    };
  }, []);
  if (!semConexao) return null;
  return <div role="alert" style={{ position: "sticky", top: 0, zIndex: 1000, padding: "14px 18px", background: "#fff2cf", color: "#573900", borderBottom: "1px solid #dab76a", fontSize: 16 }}>
    <strong>Sem conexão.</strong> Reconecte o tablet antes de confirmar produção, estoque ou fechamento. Confira a confirmação de cada registro.
  </div>;
}
