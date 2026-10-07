import {
  NextResponse,
  type NextRequest,
} from "next/server";

import { firebaseAdmin } from "@/lib/firebase-admin";
import {
  calcularResultadoMassa,
  quantidadeBlocosValida,
} from "@/lib/rendimento-massa";

import type {
  Production,
  ProductionStatus,
  ResultadoProducaoMassa,
} from "@/types";

export const runtime = "nodejs";

type Criar = {
  acao: "criar";
  operacaoId: unknown;
  prato: unknown;
  categoria: unknown;
  quantidade: unknown;
  unidade: unknown;
  insumos: unknown;
};

type Avancar = {
  acao: "avancar";
  id: unknown;
  statusAtual: unknown;
  locaisArmazenamento?: unknown;
  sacosPorLocal?: unknown;
  quantidadeBlocos?: unknown;
};

type Dados = Criar | Avancar;

const ETAPAS_MASSA = [
  "mistura",
  "formacao-blocos",
  "esticamento",
  "enrolamento",
  "armazenamento",
] as const;

const LOCAIS_MASSA = [
  "freezer-1",
  "freezer-2",
  "freezer-3",
  "freezer-4",
] as const;

type LocalMassa =
  (typeof LOCAIS_MASSA)[number];

function falha(
  mensagem: string,
  status: number,
) {
  return NextResponse.json(
    {
      erro: mensagem,
    },
    {
      status,
    },
  );
}

function hojeBrasil() {
  const partes = new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    },
  ).formatToParts(new Date());

  const obter = (tipo: string) =>
    partes.find(
      (parte) => parte.type === tipo,
    )?.value;

  return `${obter("year")}-${obter("month")}-${obter("day")}`;
}

function texto(
  valor: unknown,
  maximo: number,
): valor is string {
  return (
    typeof valor === "string" &&
    valor.trim().length > 0 &&
    valor.trim().length <= maximo
  );
}

function quantidadeValida(
  valor: unknown,
): valor is number {
  return (
    typeof valor === "number" &&
    Number.isFinite(valor) &&
    valor > 0 &&
    valor <= 1_000_000 &&
    Math.abs(
      valor * 1000 -
        Math.round(valor * 1000),
    ) < 1e-7
  );
}

function localMassaValido(
  valor: unknown,
): valor is LocalMassa {
  return (
    typeof valor === "string" &&
    LOCAIS_MASSA.includes(
      valor as LocalMassa,
    )
  );
}

function insumosValidos(
  valor: unknown,
): valor is Production["insumos"] {
  return (
    Array.isArray(valor) &&
    valor.length <= 40 &&
    valor.every((item: unknown) => {
      if (
        !item ||
        typeof item !== "object"
      ) {
        return false;
      }

      const ingrediente =
        item as Record<string, unknown>;

      return (
        texto(ingrediente.id, 100) &&
        texto(ingrediente.nome, 120) &&
        texto(ingrediente.unidade, 30) &&
        typeof ingrediente.quantidade ===
          "number" &&
        Number.isFinite(
          ingrediente.quantidade,
        ) &&
        ingrediente.quantidade >= 0 &&
        ingrediente.quantidade <= 1_000_000
      );
    })
  );
}

 async function pessoaAutorizada(
  request: NextRequest,
) {
  const token =
    /^Bearer (\S+)$/.exec(
      request.headers.get(
        "authorization",
      ) ?? "",
    )?.[1];

  if (!token) {
    console.error(
      "A requisição chegou sem token de autenticação.",
    );

    return null;
  }

  const { auth, db } = firebaseAdmin();

  try {
    const tokenDecodificado =
      await auth.verifyIdToken(
        token,
        true,
      );

    const uid = tokenDecodificado.uid;

    const perfilDocumento =
      await db
        .collection("perfis")
        .doc(uid)
        .get();

    if (!perfilDocumento.exists) {
      console.error(
        `Perfil não encontrado para o usuário ${uid}.`,
      );

      return null;
    }

    const perfil =
      perfilDocumento.data();

    const perfis = Array.isArray(
      perfil?.perfis,
    )
      ? perfil.perfis
      : [];

    const autorizado =
      perfil?.perfil === "dono" ||
      perfil?.perfil === "producao" ||
      perfis.includes("dono") ||
      perfis.includes("producao");

    if (!autorizado) {
      console.error(
        `Usuário ${uid} não possui permissão para acessar as ordens de produção.`,
      );

      return null;
    }

    return {
      uid,
      nome: texto(
        perfil?.nome,
        120,
      )
        ? perfil.nome.trim()
        : "Funcionário",
    };
  } catch (erro) {
    console.error(
      "Falha ao validar a sessão nas ordens de produção:",
      erro,
    );

    return null;
  }
}

export async function GET(
  request: NextRequest,
) {
  const pessoa =
    await pessoaAutorizada(request);

  if (!pessoa) {
    return falha(
      "Acesso negado ou sessão inválida.",
      403,
    );
  }

  try {
    const { db } = firebaseAdmin();

    const documentos = await db
      .collection("ordensProducao")
      .orderBy("criadaEm", "desc")
      .limit(100)
      .get();

    return NextResponse.json({
      ordens: documentos.docs.map(
        (documento) => ({
          ...documento.data(),
          id: documento.id,
        }),
      ),
    });
  } catch {
    return falha(
      "Não foi possível carregar as ordens de produção.",
      500,
    );
  }
}

export async function POST(
  request: NextRequest,
) {
  const pessoa =
    await pessoaAutorizada(request);

  if (!pessoa) {
    return falha(
      "Acesso negado ou sessão inválida.",
      403,
    );
  }

  if (
    !request.headers
      .get("content-type")
      ?.startsWith("application/json")
  ) {
    return falha(
      "Envie dados em JSON.",
      415,
    );
  }

  let dados: Dados;

  try {
    dados = await request.json();
  } catch {
    return falha(
      "Dados inválidos.",
      400,
    );
  }

  if (
    !dados ||
    (dados.acao !== "criar" &&
      dados.acao !== "avancar")
  ) {
    return falha(
      "Ação inválida.",
      400,
    );
  }

  const { db } = firebaseAdmin();

  try {
    /*
     * CRIAR ORDEM
     */

    if (dados.acao === "criar") {
      if (
        typeof dados.operacaoId !==
          "string" ||
        !/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(
          dados.operacaoId,
        ) ||
        !texto(dados.prato, 120) ||
        !texto(dados.categoria, 80) ||
        !quantidadeValida(
          dados.quantidade,
        ) ||
        !texto(dados.unidade, 30) ||
        !insumosValidos(dados.insumos)
      ) {
        return falha(
          "Confira nome, categoria, quantidade, unidade e ingredientes.",
          400,
        );
      }

      const id = dados.operacaoId;

      const referencia = db
        .collection("ordensProducao")
        .doc(id);

      const ordem: Production = {
        id,

        codigo:
          `PRD-${hojeBrasil().slice(0, 4)}-${id
            .slice(0, 8)
            .toUpperCase()}`,

        prato: dados.prato.trim(),
        categoria:
          dados.categoria.trim(),

        quantidade:
          dados.quantidade,

        unidade: dados.unidade.trim(),

        responsavel: pessoa.nome,
        dataProducao: hojeBrasil(),
        status: "planejada",

        insumos: dados.insumos.map(
          (item) => ({
            id: item.id.trim(),
            nome: item.nome.trim(),
            quantidade:
              item.quantidade,
            unidade:
              item.unidade.trim(),
          }),
        ),
      };

      const massa =
        ordem.prato
          .trim()
          .toLocaleLowerCase(
            "pt-BR",
          ) === "massa de pastel";

      const resultado =
        await db.runTransaction(
          async (transacao) => {
            const anterior =
              await transacao.get(
                referencia,
              );

            if (anterior.exists) {
              const salvo =
                anterior.data();

              if (
                salvo?.criadaPorId !==
                  pessoa.uid ||
                salvo?.prato !==
                  ordem.prato ||
                salvo?.categoria !==
                  ordem.categoria ||
                salvo?.quantidade !==
                  ordem.quantidade ||
                salvo?.unidade !==
                  ordem.unidade ||
                JSON.stringify(
                  salvo?.insumos,
                ) !==
                  JSON.stringify(
                    ordem.insumos,
                  )
              ) {
                throw new Error(
                  "Identificador de operação já utilizado.",
                );
              }

              return {
                ordem: {
                  ...salvo,
                  id,
                },
                repetida: true,
              };
            }

            transacao.create(
              referencia,
              {
                ...ordem,

                ...(massa
                  ? {
                      etapaMassa:
                        "planejamento",
                      historicoEtapas:
                        [],
                    }
                  : {}),

                criadaPorId: pessoa.uid,
                criadaEm: new Date(),
              },
            );

            return {
              ordem: {
                ...ordem,

                ...(massa
                  ? {
                      etapaMassa:
                        "planejamento",
                    }
                  : {}),
              },

              repetida: false,
            };
          },
        );

      return NextResponse.json({
        ok: true,
        ...resultado,
      });
    }

    /*
     * AVANÇAR ORDEM
     */

    if (
      typeof dados.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(
        dados.id,
      ) ||
      ![
        "planejada",
        "em-andamento",
      ].includes(
        String(dados.statusAtual),
      )
    ) {
      return falha(
        "Ordem ou status inválido.",
        400,
      );
    }

    const referencia = db
      .collection("ordensProducao")
      .doc(dados.id);

    let novoStatus: ProductionStatus =
      "planejada";

    let etapaMassa: string | null =
      null;

    let resultadoMassa:
      | ResultadoProducaoMassa
      | undefined;

    await db.runTransaction(
      async (transacao) => {
        const registro =
          await transacao.get(
            referencia,
          );

        if (!registro.exists) {
          throw new Error(
            "Ordem de produção não encontrada.",
          );
        }

        const registroData =
          registro.data();

        const statusSalvo =
          registroData?.status;

        if (
          statusSalvo !==
          dados.statusAtual
        ) {
          throw new Error(
            "O status mudou. Atualize a página e tente novamente.",
          );
        }

        const massa =
          typeof registroData?.prato ===
            "string" &&
          registroData.prato
            .trim()
            .toLocaleLowerCase(
              "pt-BR",
            ) === "massa de pastel";

        const agora = new Date();

        if (massa) {
          const etapaAtual =
            statusSalvo === "planejada"
              ? "planejamento"
              : typeof registroData?.etapaMassa ===
                    "string"
                ? registroData.etapaMassa
                : "mistura";

          const indice =
            ETAPAS_MASSA.findIndex(
              (etapa) =>
                etapa === etapaAtual,
            );

          if (
            statusSalvo ===
            "planejada"
          ) {
            etapaMassa = "mistura";
            novoStatus =
              "em-andamento";
          } else if (
            indice >= 0 &&
            indice <
              ETAPAS_MASSA.length - 1
          ) {
            etapaMassa =
              ETAPAS_MASSA[
                indice + 1
              ] ?? null;

            novoStatus =
              "em-andamento";
          } else if (
            etapaAtual ===
            "armazenamento"
          ) {
            /*
             * VALIDAÇÃO DOS FREEZERS
             */

            const locaisRecebidos =
              dados.locaisArmazenamento;

            if (
              !Array.isArray(
                locaisRecebidos,
              ) ||
              locaisRecebidos.length ===
                0 ||
              locaisRecebidos.length >
                4 ||
              new Set(locaisRecebidos)
                .size !==
                locaisRecebidos.length ||
              !locaisRecebidos.every(
                localMassaValido,
              )
            ) {
              throw new Error(
                "Selecione os lados do freezer onde a massa foi guardada.",
              );
            }

            const locais =
              locaisRecebidos as LocalMassa[];

            /*
             * VALIDAÇÃO DOS SACOS
             */

            const sacosRecebidos =
              dados.sacosPorLocal;

            if (
              !sacosRecebidos ||
              typeof sacosRecebidos !==
                "object" ||
              Array.isArray(
                sacosRecebidos,
              )
            ) {
              throw new Error(
                "Informe quantos sacos foram guardados em cada lado.",
              );
            }

            const sacosPorLocal =
              sacosRecebidos as Record<
                string,
                unknown
              >;

            if (
              Object.keys(
                sacosPorLocal,
              ).length !==
                locais.length ||
              !locais.every(
                (local) =>
                  typeof sacosPorLocal[
                    local
                  ] === "number" &&
                  Number.isSafeInteger(
                    sacosPorLocal[
                      local
                    ] as number,
                  ) &&
                  (sacosPorLocal[
                    local
                  ] as number) > 0 &&
                  (sacosPorLocal[
                    local
                  ] as number) <=
                    100_000,
              )
            ) {
              throw new Error(
                "Informe uma quantidade inteira de sacos para cada lado selecionado.",
              );
            }

            const totalSacos =
              locais.reduce(
                (total, local) =>
                  total +
                  (sacosPorLocal[
                    local
                  ] as number),
                0,
              );

            if (
              totalSacos >
              100_000
            ) {
              throw new Error(
                "Quantidade de sacos acima do limite.",
              );
            }

            /*
             * VALIDAÇÃO DOS BLOCOS
             */

            if (
              !quantidadeBlocosValida(
                dados.quantidadeBlocos,
              )
            ) {
              throw new Error(
                "Informe quantos blocos de massa foram produzidos.",
              );
            }

            const pesoBaseKg =
              typeof registroData?.quantidade ===
                "number" &&
              Number.isFinite(
                registroData.quantidade,
              )
                ? registroData.quantidade
                : 0;

            resultadoMassa =
              calcularResultadoMassa({
                pesoBaseKg,
                quantidadeBlocos:
                  dados.quantidadeBlocos,
                quantidadeSacos:
                  totalSacos,
              });

            etapaMassa =
              "concluida";

            novoStatus =
              "concluida";
          } else {
            throw new Error(
              "Etapa da massa inválida; atualize a página.",
            );
          }

          const historico =
            Array.isArray(
              registroData
                ?.historicoEtapas,
            )
              ? registroData.historicoEtapas
              : [];

          transacao.update(
            referencia,
            {
              status: novoStatus,
              etapaMassa,

              ...(etapaMassa ===
              "concluida"
                ? {
                    locaisArmazenamento:
                      dados.locaisArmazenamento,

                    sacosPorLocal:
                      dados.sacosPorLocal,

                    totalSacos:
                      resultadoMassa
                        ?.quantidadeSacos,

                    totalRolos:
                      resultadoMassa
                        ?.quantidadeRolos,

                    resultadoMassa,
                  }
                : {}),

              historicoEtapas: [
                ...historico,
                {
                  etapa: etapaMassa,

                  responsavelId:
                    pessoa.uid,

                  responsavel:
                    pessoa.nome,

                  registradoEm:
                    agora,

                  ...(etapaMassa ===
                  "concluida"
                    ? {
                        locaisArmazenamento:
                          dados.locaisArmazenamento,

                        sacosPorLocal:
                          dados.sacosPorLocal,

                        resultadoMassa,
                      }
                    : {}),
                },
              ],

              alteradoPorId:
                pessoa.uid,

              alteradoPor:
                pessoa.nome,

              alteradoEm: agora,
            },
          );
        } else {
          novoStatus =
            statusSalvo ===
            "planejada"
              ? "em-andamento"
              : "concluida";

          transacao.update(
            referencia,
            {
              status: novoStatus,

              alteradoPorId:
                pessoa.uid,

              alteradoPor:
                pessoa.nome,

              alteradoEm: agora,
            },
          );
        }
      },
    );

    return NextResponse.json({
      ok: true,
      status: novoStatus,
      etapaMassa,
      alteradoPor: pessoa.nome,

      ...(resultadoMassa
        ? {
            resultadoMassa,
          }
        : {}),
    });
  } catch (error) {
    return falha(
      error instanceof Error
        ? error.message
        : "Não foi possível atualizar a produção.",
      409,
    );
  }
}
