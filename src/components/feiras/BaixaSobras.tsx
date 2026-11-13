"use client";

import { useRef, useState, type CSSProperties } from "react";
import { registrarBaixaSobraFeira } from "@/services/descartesFeira";

type Lote = {
  origem: string;
  nome: string;
  disponivel: number;
};

type Props = {
  lotes: Lote[];
  baixas: Record<string, number>;
  sincronizado: boolean;
};

const campo: CSSProperties = {
  width: "100%",
  minWidth: 0,
  minHeight: 44,
  padding: "10px 12px",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  background: "var(--color-surface)",
  color: "var(--color-text-primary)",
  font: "inherit",
};

export function BaixaSobras({
  lotes,
  baixas,
  sincronizado,
}: Props) {
  const [origem, setOrigem] = useState("");
  const [tipo, setTipo] = useState<"descarte" | "doacao">("descarte");
  const [quantidade, setQuantidade] = useState("");
  const [motivo, setMotivo] = useState("");
  const [destinatario, setDestinatario] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [confirmacao, setConfirmacao] = useState<{
    origem: string;
    total: number;
  } | null>(null);

  const emAndamento = useRef(false);
  const tentativa = useRef<{
    assinatura: string;
    id: string;
  } | null>(null);

  const lote = lotes.find((item) => item.origem === origem);

  const aguardandoSaldo = Boolean(
    confirmacao &&
    (
      !sincronizado ||
      (baixas[confirmacao.origem] ?? 0) < confirmacao.total
    ),
  );

  async function salvar() {
    if (emAndamento.current || aguardandoSaldo) return;

    setErro("");
    setSucesso("");

    const numero = Number(quantidade);

    if (
      !sincronizado ||
      !lote ||
      !quantidade.trim() ||
      !Number.isSafeInteger(numero) ||
      numero <= 0 ||
      numero > 10_000 ||
      numero > lote.disponivel
    ) {
      setErro("Confira o lote e a quantidade disponível.");
      return;
    }

    if (
      tipo === "descarte" &&
      (motivo.trim().length < 5 || motivo.trim().length > 200)
    ) {
      setErro("Informe um motivo de 5 a 200 caracteres.");
      return;
    }

    if (
      tipo === "doacao" &&
      (
        destinatario.trim().length < 2 ||
        destinatario.trim().length > 120
      )
    ) {
      setErro("Informe quem recebeu a doação.");
      return;
    }

    const dados = {
      origem,
      quantidade: numero,
      tipo,
      motivo: motivo.trim(),
      destinatario: tipo === "doacao" ? destinatario.trim() : "",
    };

    const assinatura = JSON.stringify(dados);

    if (tentativa.current?.assinatura !== assinatura) {
      tentativa.current = {
        assinatura,
        id: crypto.randomUUID(),
      };
    }

    emAndamento.current = true;
    setSalvando(true);

    try {
      const resultado = await registrarBaixaSobraFeira({
        ...dados,
        operacaoId: tentativa.current.id,
      });

      setConfirmacao({ origem, total: resultado.total });
      setSucesso(
        `${tipo === "doacao" ? "Doação" : "Descarte"} registrado: ${numero} pastéis.`,
      );

      tentativa.current = null;
      setQuantidade("");
      setMotivo("");
      setDestinatario("");
    } catch (falha) {
      setErro(
        falha instanceof Error
          ? falha.message
          : "Não foi possível registrar.",
      );
      // Mantém o mesmo ID ao repetir a mesma solicitação.
    } finally {
      emAndamento.current = false;
      setSalvando(false);
    }
  }

  return (
    <details
      style={{
        padding: 16,
        border: "1px solid var(--color-border)",
        borderRadius: 12,
        background: "var(--color-surface)",
      }}
    >
      <summary style={{ cursor: "pointer", minHeight: 44 }}>
        <strong>Descarte e doação</strong>
      </summary>

      <p>
        Registre a retirada de sobras disponíveis. Descartes e doações
        não são vendas.
      </p>

      {!sincronizado && (
        <p role="status">Aguardando atualização dos saldos...</p>
      )}

      <form
        onSubmit={(evento) => {
          evento.preventDefault();
          void salvar();
        }}
      >
        <fieldset
          disabled={salvando || aguardandoSaldo || !sincronizado}
          style={{
            display: "grid",
            gap: 14,
            border: 0,
            padding: 0,
            margin: 0,
            minWidth: 0,
          }}
        >
          <label>
            Lote de origem
            <select
              style={campo}
              value={origem}
              onChange={(evento) => setOrigem(evento.target.value)}
              required
            >
              <option value="">Selecione a feira e o sabor</option>
              {lotes.map((item) => (
                <option key={item.origem} value={item.origem}>
                  {item.nome} — {item.disponivel} disponíveis
                </option>
              ))}
            </select>
          </label>

          <label>
            Tipo
            <select
              style={campo}
              value={tipo}
              onChange={(evento) => {
                setTipo(
                  evento.target.value === "doacao"
                    ? "doacao"
                    : "descarte",
                );
              }}
            >
              <option value="descarte">Descarte</option>
              <option value="doacao">Doação</option>
            </select>
          </label>

          <label>
            Quantidade de pastéis
            <input
              style={campo}
              type="number"
              min={1}
              max={Math.min(lote?.disponivel ?? 0, 10_000)}
              step={1}
              value={quantidade}
              onChange={(evento) => setQuantidade(evento.target.value)}
              required
            />
          </label>

          {tipo === "doacao" && (
            <label>
              Quem recebeu?
              <input
                style={campo}
                value={destinatario}
                minLength={2}
                maxLength={120}
                onChange={(evento) =>
                  setDestinatario(evento.target.value)
                }
                required
              />
            </label>
          )}

          <label>
            {tipo === "descarte" ? "Motivo" : "Observação (opcional)"}
            <textarea
              style={campo}
              value={motivo}
              minLength={tipo === "descarte" ? 5 : undefined}
              maxLength={200}
              onChange={(evento) => setMotivo(evento.target.value)}
              required={tipo === "descarte"}
            />
          </label>

          <button
            type="submit"
            style={{ ...campo, cursor: "pointer", fontWeight: 700 }}
            disabled={!lote || lote.disponivel <= 0}
          >
            {salvando
              ? "Salvando..."
              : tipo === "doacao"
                ? "Registrar doação"
                : "Registrar descarte"}
          </button>
        </fieldset>
      </form>

      {aguardandoSaldo && (
        <p role="status">Registro salvo. Atualizando o saldo...</p>
      )}
      {sucesso && <p role="status">{sucesso}</p>}
      {erro && <p role="alert">{erro}</p>}
    </details>
  );
}