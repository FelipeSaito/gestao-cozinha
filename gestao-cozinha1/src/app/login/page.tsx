"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ChefHat,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import styles from "./login.module.css";

const DESTAQUES = [
  "Controle de entradas, saídas e validade dos insumos",
  "Transferências entre o estoque principal e a cozinha",
  "Conferência de recebimento com registro de divergências",
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [manterConectado, setManterConectado] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErro(null);

    if (email.trim() === "" || senha.trim() === "") {
      setErro("Informe o e-mail (ou código) e a senha para continuar.");
      return;
    }
    if (senha.trim().length < 4) {
      setErro("A senha deve ter pelo menos 4 caracteres.");
      return;
    }

    // Autenticação simulada — nesta etapa não há backend real.
    setCarregando(true);
    setTimeout(() => {
      router.push("/estoque-principal");
    }, 600);
  }

  return (
    <div className={styles.page}>
      <section className={styles.showcase} aria-hidden="true">
        <div className={styles.brand}>
          <span className={styles.brandMark}>
            <ChefHat size={26} />
          </span>
          Gestão de Cozinha
        </div>

        <div className={styles.showcaseBody}>
          <h1 className={styles.showcaseTitle}>
            Controle inteligente de estoque, insumos e produção
          </h1>
          <ul className={styles.destaques}>
            {DESTAQUES.map((item) => (
              <li key={item} className={styles.destaque}>
                <ShieldCheck size={18} aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className={styles.showcaseFooter}>
          Plataforma interna para equipes de cozinha profissional.
        </p>
      </section>

      <section className={styles.formSide}>
        <div className={styles.formCard}>
          <div className={styles.mobileBrand}>
            <span className={styles.brandMark}>
              <ChefHat size={22} />
            </span>
            Gestão de Cozinha
          </div>

          <div className={styles.formHeader}>
            <h2 className={styles.formTitle}>Entrar no sistema</h2>
            <p className={styles.formSubtitle}>
              Acesse com suas credenciais de funcionário.
            </p>
          </div>

          <form
            className={styles.form}
            onSubmit={handleSubmit}
            noValidate
          >
            <Input
              label="E-mail ou código do funcionário"
              type="text"
              inputMode="email"
              autoComplete="username"
              placeholder="nome@cozinha.com.br"
              leftIcon={<UserRound size={18} />}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />

            <Input
              label="Senha"
              type={mostrarSenha ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Digite sua senha"
              leftIcon={<Lock size={18} />}
              value={senha}
              onChange={(event) => setSenha(event.target.value)}
              rightSlot={
                <button
                  type="button"
                  className={styles.toggle}
                  onClick={() => setMostrarSenha((prev) => !prev)}
                  aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                >
                  {mostrarSenha ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              }
            />

            <div className={styles.options}>
              <label className={styles.remember}>
                <input
                  type="checkbox"
                  checked={manterConectado}
                  onChange={(event) => setManterConectado(event.target.checked)}
                />
                Manter conectado neste dispositivo
              </label>
              <button type="button" className={styles.link}>
                Esqueci minha senha
              </button>
            </div>

            {erro && <Alert variant="danger">{erro}</Alert>}

            <Button
              type="submit"
              variant="primary"
              size="large"
              fullWidth
              loading={carregando}
              leftIcon={<KeyRound size={18} />}
            >
              Entrar no sistema
            </Button>
          </form>

          <p className={styles.aviso}>
            <ShieldCheck size={15} aria-hidden="true" />
            Acesso exclusivo para funcionários autorizados.
          </p>
        </div>
      </section>
    </div>
  );
}
