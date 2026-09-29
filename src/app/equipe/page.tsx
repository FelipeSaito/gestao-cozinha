"use client";

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";

import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { firebaseClient } from "@/lib/firebase";

import styles from "./page.module.css";

type Setor =
  | "producao"
  | "feirantes"
  | "administracao";

interface Funcionario {
  id: string;
  nome: string;
  cargo: string;
  iniciais: string;
  perfis: string[];
}

const SETORES: {
  valor: Setor;
  nome: string;
}[] = [
  {
    valor: "producao",
    nome: "Produção",
  },
  {
    valor: "feirantes",
    nome: "Feiras",
  },
  {
    valor: "administracao",
    nome: "Administração",
  },
];

const NOMES_SETORES: Record<string, string> = {
  producao: "Produção",
  feirantes: "Feiras",
  administracao: "Administração",
  dono: "Dono",
};

export default function EquipePage() {
  const { usuario, carregando } = useAuth();

  /*
   * =======================================================
   * CADASTRO
   * =======================================================
   */

  const [id, setId] = useState("");
  const [nome, setNome] = useState("");
  const [cargo, setCargo] = useState("");
  const [iniciais, setIniciais] = useState("");

  const [perfis, setPerfis] =
    useState<Setor[]>([]);

  const [pin, setPin] = useState("");

  const [enviando, setEnviando] =
    useState(false);

  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  /*
   * =======================================================
   * LISTAGEM
   * =======================================================
   */

  const [funcionarios, setFuncionarios] =
    useState<Funcionario[]>([]);

  const [
    carregandoFuncionarios,
    setCarregandoFuncionarios,
  ] = useState(true);

  const [erroLista, setErroLista] =
    useState("");

  /*
   * =======================================================
   * EDIÇÃO
   * =======================================================
   */

  const [editandoId, setEditandoId] =
    useState<string | null>(null);

  const [editNome, setEditNome] =
    useState("");

  const [editCargo, setEditCargo] =
    useState("");

  const [editIniciais, setEditIniciais] =
    useState("");

  const [editPerfis, setEditPerfis] =
    useState<Setor[]>([]);

  const [salvandoEdicao, setSalvandoEdicao] =
    useState(false);

  const [erroEdicao, setErroEdicao] =
    useState("");

  /*
   * =======================================================
   * CARREGAR FUNCIONÁRIOS
   * =======================================================
   */

  const carregarFuncionarios =
    useCallback(async () => {
      setCarregandoFuncionarios(true);
      setErroLista("");

      try {
        const resposta = await fetch(
          "/api/auth/funcionarios",
          {
            cache: "no-store",
          },
        );

        const dados = await resposta.json();

        if (!resposta.ok) {
          throw new Error(
            dados.erro ??
              "Não foi possível carregar a equipe.",
          );
        }

        const lista = Array.isArray(dados)
          ? dados
          : Array.isArray(dados.funcionarios)
            ? dados.funcionarios
            : [];

        setFuncionarios(lista);
      } catch (falha) {
        setErroLista(
          falha instanceof Error
            ? falha.message
            : "Não foi possível carregar a equipe.",
        );
      } finally {
        setCarregandoFuncionarios(false);
      }
    }, []);

  useEffect(() => {
    if (
      !carregando &&
      usuario?.perfis.includes("dono")
    ) {
      void carregarFuncionarios();
    }
  }, [
    carregando,
    usuario,
    carregarFuncionarios,
  ]);

  /*
   * =======================================================
   * CADASTRO
   * =======================================================
   */

  function alternarPerfil(setor: Setor) {
    setPerfis((atual) =>
      atual.includes(setor)
        ? atual.filter(
            (item) => item !== setor,
          )
        : [...atual, setor],
    );
  }

  async function cadastrar(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (enviando) return;

    setErro("");
    setSucesso("");

    if (
      !/^[a-z0-9-]{2,60}$/.test(id) ||
      !/^[A-ZÀ-Ý]{1,4}$/.test(iniciais) ||
      perfis.length === 0 ||
      !/^\d{6}$/.test(pin)
    ) {
      setErro(
        "Preencha o identificador, as iniciais, ao menos uma área e um PIN de 6 dígitos.",
      );

      return;
    }

    setEnviando(true);

    try {
      const atual =
        firebaseClient().auth.currentUser;

      if (!atual) {
        throw new Error(
          "Entre novamente com a conta de Dono.",
        );
      }

      const token =
        await atual.getIdToken();

      const resposta = await fetch(
        "/api/admin/funcionarios",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
            Authorization:
              `Bearer ${token}`,
          },

          body: JSON.stringify({
            id,
            nome: nome.trim(),
            cargo: cargo.trim(),
            iniciais,
            perfis,
            pin,
          }),
        },
      );

      const dados: {
        erro?: string;
      } = await resposta.json();

      if (!resposta.ok) {
        throw new Error(
          dados.erro ??
            "Não foi possível cadastrar.",
        );
      }

      setSucesso(
        `${nome.trim()} cadastrado com sucesso.`,
      );

      setId("");
      setNome("");
      setCargo("");
      setIniciais("");
      setPerfis([]);
      setPin("");

      await carregarFuncionarios();
    } catch (falha) {
      setErro(
        falha instanceof Error
          ? falha.message
          : "Não foi possível cadastrar.",
      );

      setPin("");
    } finally {
      setEnviando(false);
    }
  }

  /*
   * =======================================================
   * EDIÇÃO
   * =======================================================
   */

  function iniciarEdicao(
    funcionario: Funcionario,
  ) {
    setEditandoId(funcionario.id);

    setEditNome(funcionario.nome);
    setEditCargo(funcionario.cargo);
    setEditIniciais(funcionario.iniciais);

    setEditPerfis(
      funcionario.perfis.filter(
        (perfil): perfil is Setor =>
          perfil === "producao" ||
          perfil === "feirantes" ||
          perfil === "administracao",
      ),
    );

    setErroEdicao("");
    setSucesso("");
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setEditNome("");
    setEditCargo("");
    setEditIniciais("");
    setEditPerfis([]);
    setErroEdicao("");
  }

  function alternarPerfilEdicao(
    setor: Setor,
  ) {
    setEditPerfis((atual) =>
      atual.includes(setor)
        ? atual.filter(
            (perfil) => perfil !== setor,
          )
        : [...atual, setor],
    );
  }

  async function salvarEdicao(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!editandoId || salvandoEdicao) {
      return;
    }

    setErroEdicao("");
    setSucesso("");

    if (
      !editNome.trim() ||
      !editCargo.trim() ||
      !/^[A-ZÀ-Ý]{1,4}$/.test(
        editIniciais,
      ) ||
      editPerfis.length === 0
    ) {
      setErroEdicao(
        "Confira os dados e selecione ao menos uma área.",
      );

      return;
    }

    setSalvandoEdicao(true);

    try {
      const atual =
        firebaseClient().auth.currentUser;

      if (!atual) {
        throw new Error(
          "Entre novamente com a conta de Dono.",
        );
      }

      const token =
        await atual.getIdToken();

      const resposta = await fetch(
        "/api/admin/funcionarios",
        {
          method: "PATCH",

          headers: {
            "Content-Type":
              "application/json",
            Authorization:
              `Bearer ${token}`,
          },

          body: JSON.stringify({
            id: editandoId,
            nome: editNome.trim(),
            cargo: editCargo.trim(),
            iniciais: editIniciais,
            perfis: editPerfis,
          }),
        },
      );

      const dados: {
        erro?: string;
      } = await resposta.json();

      if (!resposta.ok) {
        throw new Error(
          dados.erro ??
            "Não foi possível salvar as alterações.",
        );
      }

      const nomeAtualizado =
        editNome.trim();

      /*
       * Fecha a edição primeiro.
       */
      cancelarEdicao();

      /*
       * Recarrega os dados vindos
       * diretamente do servidor.
       */
      await carregarFuncionarios();

      setSucesso(
        `${nomeAtualizado} atualizado com sucesso.`,
      );
    } catch (falha) {
      setErroEdicao(
        falha instanceof Error
          ? falha.message
          : "Não foi possível atualizar o funcionário.",
      );
    } finally {
      setSalvandoEdicao(false);
    }
  }

  /*
   * =======================================================
   * PROTEÇÃO DA PÁGINA
   * =======================================================
   */

  if (
    carregando ||
    !usuario?.perfis.includes("dono")
  ) {
    return null;
  }

  /*
   * =======================================================
   * TELA
   * =======================================================
   */

  return (
    <AppLayout
      title="Equipe"
      subtitle="Cadastre e acompanhe os funcionários do sistema"
    >
      {/* =================================================
          NOVO FUNCIONÁRIO
      ================================================= */}

      <section className={styles.card}>
        <h2>Novo funcionário</h2>

        <p>
          Selecione as áreas de trabalho.
          Cada pessoa terá uma conta e um
          PIN próprios.
        </p>

        <form
          className={styles.form}
          onSubmit={cadastrar}
        >
          <label>
            Identificador para entrar

            <input
              value={id}
              onChange={(e) =>
                setId(
                  e.target.value
                    .toLowerCase()
                    .replace(
                      /[^a-z0-9-]/g,
                      "",
                    ),
                )
              }
              placeholder="Ex.: cleison"
              maxLength={60}
              autoComplete="off"
              required
            />
          </label>

          <label>
            Nome

            <input
              value={nome}
              onChange={(e) =>
                setNome(e.target.value)
              }
              placeholder="Ex.: Cleison"
              maxLength={80}
              required
            />
          </label>

          <div className={styles.row}>
            <label>
              Cargo

              <input
                value={cargo}
                onChange={(e) =>
                  setCargo(e.target.value)
                }
                placeholder="Ex.: Produção e Feiras"
                maxLength={80}
                required
              />
            </label>

            <label>
              Iniciais

              <input
                value={iniciais}
                onChange={(e) =>
                  setIniciais(
                    e.target.value
                      .toUpperCase()
                      .slice(0, 4),
                  )
                }
                placeholder="Ex.: CL"
                maxLength={4}
                required
              />
            </label>
          </div>

          <fieldset
            className={styles.areas}
          >
            <legend>
              Áreas permitidas
            </legend>

            {SETORES.map((setor) => (
              <label key={setor.valor}>
                <input
                  type="checkbox"
                  checked={perfis.includes(
                    setor.valor,
                  )}
                  onChange={() =>
                    alternarPerfil(
                      setor.valor,
                    )
                  }
                />

                {setor.nome}
              </label>
            ))}
          </fieldset>

          <label>
            PIN individual de 6 números

            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={pin}
              onChange={(e) =>
                setPin(
                  e.target.value
                    .replace(/\D/g, "")
                    .slice(0, 6),
                )
              }
              minLength={6}
              maxLength={6}
              pattern="[0-9]{6}"
              required
            />
          </label>

          {erro && (
            <p
              className={styles.error}
              role="alert"
            >
              {erro}
            </p>
          )}

          {sucesso && (
            <p
              className={styles.success}
              role="status"
            >
              {sucesso}
            </p>
          )}

          <button
            type="submit"
            className={styles.submit}
            disabled={enviando}
          >
            {enviando
              ? "Cadastrando..."
              : "Cadastrar funcionário"}
          </button>
        </form>
      </section>

      {/* =================================================
          FUNCIONÁRIOS CADASTRADOS
      ================================================= */}

      <section className={styles.card}>
        <div>
          <h2>
            Funcionários cadastrados
          </h2>

          <p>
            Pessoas que possuem acesso ao
            sistema.
          </p>
        </div>

        {carregandoFuncionarios && (
          <p>Carregando equipe...</p>
        )}

        {erroLista && (
          <p
            className={styles.error}
            role="alert"
          >
            {erroLista}
          </p>
        )}

        {!carregandoFuncionarios &&
          !erroLista &&
          funcionarios.length === 0 && (
            <p>
              Nenhum funcionário cadastrado.
            </p>
          )}

        {!carregandoFuncionarios &&
          funcionarios.length > 0 && (
            <div
              style={{
                display: "grid",
                gap: "12px",
                marginTop: "20px",
              }}
            >
              {funcionarios.map(
                (funcionario) => (
                  <article
                    key={funcionario.id}
                    style={{
                      border:
                        "1px solid #e1e5e3",
                      borderRadius: "12px",
                      padding: "16px",
                    }}
                  >
                    {/* ==========================
                        DADOS DO FUNCIONÁRIO
                    ========================== */}

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                      }}
                    >
                      <span
                        style={{
                          width: "42px",
                          height: "42px",
                          borderRadius: "50%",
                          display: "grid",
                          placeItems: "center",
                          background:
                            "#e9f2ed",
                          fontWeight: 700,
                        }}
                      >
                        {funcionario.iniciais}
                      </span>

                      <div>
                        <strong>
                          {funcionario.nome}
                        </strong>

                        <div>
                          <small>
                            {funcionario.cargo}
                          </small>
                        </div>
                      </div>
                    </div>

                    {/* ==========================
                        ÁREAS
                    ========================== */}

                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "8px",
                        marginTop: "14px",
                      }}
                    >
                      {funcionario.perfis.map(
                        (perfil) => (
                          <span
                            key={perfil}
                            style={{
                              background:
                                "#f1f5f3",
                              borderRadius:
                                "999px",
                              padding:
                                "5px 10px",
                              fontSize:
                                "13px",
                            }}
                          >
                            {NOMES_SETORES[
                              perfil
                            ] ?? perfil}
                          </span>
                        ),
                      )}
                    </div>

                    {/* ==========================
                        BOTÃO EDITAR
                    ========================== */}

                    {editandoId !==
                      funcionario.id && (
                      <button
                        type="button"
                        className={
                          styles.submit
                        }
                        style={{
                          marginTop: "16px",
                          width: "auto",
                        }}
                        onClick={() =>
                          iniciarEdicao(
                            funcionario,
                          )
                        }
                      >
                        Editar
                      </button>
                    )}

                    {/* ==========================
                        FORMULÁRIO DE EDIÇÃO
                    ========================== */}

                    {editandoId ===
                      funcionario.id && (
                      <form
                        className={
                          styles.form
                        }
                        onSubmit={
                          salvarEdicao
                        }
                        style={{
                          marginTop:
                            "20px",
                        }}
                      >
                        <label>
                          Nome

                          <input
                            value={
                              editNome
                            }
                            onChange={(
                              event,
                            ) =>
                              setEditNome(
                                event
                                  .target
                                  .value,
                              )
                            }
                            maxLength={80}
                            required
                          />
                        </label>

                        <div
                          className={
                            styles.row
                          }
                        >
                          <label>
                            Cargo

                            <input
                              value={
                                editCargo
                              }
                              onChange={(
                                event,
                              ) =>
                                setEditCargo(
                                  event
                                    .target
                                    .value,
                                )
                              }
                              maxLength={
                                80
                              }
                              required
                            />
                          </label>

                          <label>
                            Iniciais

                            <input
                              value={
                                editIniciais
                              }
                              onChange={(
                                event,
                              ) =>
                                setEditIniciais(
                                  event.target.value
                                    .toUpperCase()
                                    .slice(
                                      0,
                                      4,
                                    ),
                                )
                              }
                              maxLength={
                                4
                              }
                              required
                            />
                          </label>
                        </div>

                        <fieldset
                          className={
                            styles.areas
                          }
                        >
                          <legend>
                            Áreas permitidas
                          </legend>

                          {SETORES.map(
                            (setor) => (
                              <label
                                key={
                                  setor.valor
                                }
                              >
                                <input
                                  type="checkbox"
                                  checked={editPerfis.includes(
                                    setor.valor,
                                  )}
                                  onChange={() =>
                                    alternarPerfilEdicao(
                                      setor.valor,
                                    )
                                  }
                                />

                                {
                                  setor.nome
                                }
                              </label>
                            ),
                          )}
                        </fieldset>

                        {erroEdicao && (
                          <p
                            className={
                              styles.error
                            }
                            role="alert"
                          >
                            {
                              erroEdicao
                            }
                          </p>
                        )}

                        <div
                          style={{
                            display:
                              "flex",
                            gap: "10px",
                            flexWrap:
                              "wrap",
                          }}
                        >
                          <button
                            type="submit"
                            className={
                              styles.submit
                            }
                            disabled={
                              salvandoEdicao
                            }
                          >
                            {salvandoEdicao
                              ? "Salvando..."
                              : "Salvar alterações"}
                          </button>

                          <button
                            type="button"
                            onClick={
                              cancelarEdicao
                            }
                            disabled={
                              salvandoEdicao
                            }
                          >
                            Cancelar
                          </button>
                        </div>
                      </form>
                    )}
                  </article>
                ),
              )}
            </div>
          )}
      </section>
    </AppLayout>
  );
}