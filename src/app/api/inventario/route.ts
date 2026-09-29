import { NextResponse, type NextRequest } from "next/server";

import { firebaseAdmin } from "@/lib/firebase-admin";

import { produtos as produtosExemplo } from "@/services/produtos";

import type { Product, Transfer } from "@/types";



export const runtime = "nodejs";



const PRINCIPAL = "estoquePrincipal";

const COZINHA = "estoqueCozinha";

const TRANSFERENCIAS = "transferenciasEstoque";



type Acao =

  | { acao: "inicializarExemplos" }

  | {

      acao: "criar";

      produtoId: string;

      quantidade: number;

      observacao?: string;

    }

  | {

      acao: "receber";

      transferenciaId: string;

      itens: {

        itemId: string;

        quantidadeRecebida: number;

        recebidoCorretamente: boolean;

        observacao?: string;

      }[];

    }

  | { acao: "cancelar"; transferenciaId: string };



function responderErro(mensagem: string, status: number) {

  return NextResponse.json({ erro: mensagem }, { status });

}



function dataHoje() {

  const partes = new Intl.DateTimeFormat("en-CA", {

    timeZone: "America/Sao_Paulo",

    year: "numeric",

    month: "2-digit",

    day: "2-digit",

  }).formatToParts(new Date());



  const obter = (tipo: string) =>

    partes.find((parte) => parte.type === tipo)?.value;



  return `${obter("year")}-${obter("month")}-${obter("day")}`;

}



function situacao(

  quantidade: number,

  validade: string,

): Product["situacao"] {

  if (validade < dataHoje()) return "vencido";



  const hoje = new Date(`${dataHoje()}T12:00:00Z`).getTime();

  const fim = new Date(`${validade}T12:00:00Z`).getTime();



  if ((fim - hoje) / 86400000 <= 7) {

    return "proximo-vencimento";

  }



  if (quantidade <= 5) return "estoque-baixo";



  return "normal";

}



function quantidadeValida(valor: unknown): valor is number {

  return (

    typeof valor === "number" &&

    Number.isFinite(valor) &&

    valor > 0 &&

    valor <= 1000000 &&

    Math.round(valor * 1000) === valor * 1000

  );

}



async function identificar(request: NextRequest) {

  const token = /^Bearer (\S+)$/.exec(

    request.headers.get("authorization") ?? "",

  )?.[1];



  if (!token) return null;



  const { auth, db } = firebaseAdmin();



  try {

    const sessao = await auth.verifyIdToken(token, true);

    const perfil = (

      await db.collection("perfis").doc(sessao.uid).get()

    ).data();



    if (!perfil) return null;



    const perfis: string[] = Array.isArray(perfil.perfis)

      ? perfil.perfis

      : typeof perfil.perfil === "string"

        ? [perfil.perfil]

        : [];



    return {

      uid: sessao.uid,

      nome:

        typeof perfil.nome === "string"

          ? perfil.nome

          : "Funcionário",

      perfis,

    };

  } catch {

    return null;

  }

}



function autorizado(

  perfis: string[],

  acao: Acao["acao"],

) {

  if (perfis.includes("dono")) return true;



  if (acao === "inicializarExemplos") {

    return false;

  }



  if (acao === "criar" || acao === "cancelar") {

    return perfis.includes("administracao");

  }



  return (

    perfis.includes("producao") ||

    perfis.includes("administracao")

  );

}



export async function GET(request: NextRequest) {

  const pessoa = await identificar(request);



  if (!pessoa) {

    return responderErro("Sessão inválida.", 401);

  }



  if (

    !pessoa.perfis.some((perfil) =>

      ["dono", "administracao", "producao"].includes(

        perfil,

      ),

    )

  ) {

    return responderErro("Acesso negado.", 403);

  }



  try {

    const { db } = firebaseAdmin();



    const [principal, cozinha, transferencias] =

      await Promise.all([

        db.collection(PRINCIPAL).get(),

        db.collection(COZINHA).get(),

        db

          .collection(TRANSFERENCIAS)

          .where("status", "==", "pendente")

          .get(),

      ]);



    return NextResponse.json({

      produtos: principal.docs.map((doc) => {

        const produto = doc.data() as Product;



        return {

          ...produto,

          id: doc.id,

          situacao: situacao(

            produto.quantidade,

            produto.validade,

          ),

        };

      }),



      estoqueCozinha: cozinha.docs.map((doc) => {

        const produto = doc.data() as Product;



        return {

          ...produto,

          id: doc.id,

          situacao: situacao(

            produto.quantidade,

            produto.validade,

          ),

        };

      }),



      transferencias: transferencias.docs.map((doc) => ({

        ...doc.data(),

        id: doc.id,

      })),

    });

  } catch {

    return responderErro(

      "Não foi possível carregar o inventário.",

      500,

    );

  }

}



export async function POST(request: NextRequest) {

  const pessoa = await identificar(request);



  if (!pessoa) {

    return responderErro("Sessão inválida.", 401);

  }



  if (

    !request.headers

      .get("content-type")

      ?.startsWith("application/json")

  ) {

    return responderErro("Envie dados em JSON.", 415);

  }



  let dados: Acao;



  try {

    dados = await request.json();

  } catch {

    return responderErro("Dados inválidos.", 400);

  }



  if (

    !dados ||

    ![

      "inicializarExemplos",

      "criar",

      "receber",

      "cancelar",

    ].includes(dados.acao)

  ) {

    return responderErro("Ação inválida.", 400);

  }



  if (!autorizado(pessoa.perfis, dados.acao)) {

    return responderErro("Acesso negado.", 403);

  }



  const { db } = firebaseAdmin();



  try {

    if (dados.acao === "inicializarExemplos") {

      const trava = db

        .collection("inventarioConfig")

        .doc("inicializacao");



      await db.runTransaction(async (tx) => {

        const [marcador, existentes] =

          await Promise.all([

            tx.get(trava),

            tx.get(

              db.collection(PRINCIPAL).limit(1),

            ),

          ]);



        if (

          marcador.exists ||

          !existentes.empty

        ) {

          throw new Error(

            "O estoque já foi inicializado.",

          );

        }



        for (const produto of produtosExemplo) {

          const { id, ...campos } = produto;



          tx.create(

            db.collection(PRINCIPAL).doc(id),

            {

              ...campos,

              situacao: situacao(

                produto.quantidade,

                produto.validade,

              ),

            },

          );

        }



        tx.create(trava, {

          inicializadoPor: pessoa.uid,

          inicializadoEm: new Date(),

        });

      });



      return NextResponse.json({ ok: true });

    }



    if (dados.acao === "criar") {

      if (

        !/^[a-zA-Z0-9-]{1,100}$/.test(

          dados.produtoId ?? "",

        ) ||

        !quantidadeValida(dados.quantidade) ||

        (dados.observacao !== undefined &&

          (typeof dados.observacao !==

            "string" ||

            dados.observacao.length > 500))

      ) {

        return responderErro(

          "Confira o produto, a quantidade e a observação.",

          400,

        );

      }



      const produtoRef = db

        .collection(PRINCIPAL)

        .doc(dados.produtoId);



      const transferenciaRef = db

        .collection(TRANSFERENCIAS)

        .doc();



      await db.runTransaction(async (tx) => {

        const snapshot =

          await tx.get(produtoRef);



        if (!snapshot.exists) {

          throw new Error(

            "Produto não encontrado.",

          );

        }



        const produto =

          snapshot.data() as Product;



        if (

          !Number.isFinite(

            produto.quantidade,

          ) ||

          produto.quantidade <

            dados.quantidade

        ) {

          throw new Error(

            "Quantidade maior que o saldo disponível.",

          );

        }



        if (

          produto.validade < dataHoje()

        ) {

          throw new Error(

            "Produto vencido não pode ser transferido.",

          );

        }



        const restante =

          Math.round(

            (produto.quantidade -

              dados.quantidade) *

              1000,

          ) / 1000;



        const transferencia: Transfer = {

          id: transferenciaRef.id,

          codigo: `TRF-${Date.now()}-${transferenciaRef.id.slice(0, 5)}`,

          origem: "Estoque principal",

          destino: "Estoque da cozinha",

          responsavel: pessoa.nome,

          criadaEm: dataHoje(),

          status: "pendente",

          itens: [

            {

              id: crypto.randomUUID(),

              produtoId: snapshot.id,

              nome: produto.nome,

              lote: produto.lote,

              unidade: produto.unidade,

              quantidadeEnviada:

                dados.quantidade,

            },

          ],

          ...(dados.observacao?.trim()

            ? {

                observacao:

                  dados.observacao.trim(),

              }

            : {}),

        };



        tx.update(produtoRef, {

          quantidade: restante,

          situacao: situacao(

            restante,

            produto.validade,

          ),

        });



        tx.create(transferenciaRef, {

          ...transferencia,

          criadoPorId: pessoa.uid,

        });
        tx.create(db.collection("movimentacoesEstoque").doc(`transferencia-${transferenciaRef.id}`), {
          tipo: "transferencia", produtoId: snapshot.id, lote: produto.lote,
          quantidade: -dados.quantidade, saldoAnterior: produto.quantidade,
          saldoNovo: restante, transferenciaId: transferenciaRef.id,
          registradoPorId: pessoa.uid, registradoPor: pessoa.nome, registradoEm: new Date(),
        });

      });



      return NextResponse.json({

        ok: true,

        id: transferenciaRef.id,

      });

    }



    if (

      !/^[a-zA-Z0-9-]{1,100}$/.test(

        dados.transferenciaId ?? "",

      )

    ) {

      return responderErro(

        "Transferência inválida.",

        400,

      );

    }



    const transferenciaRef = db

      .collection(TRANSFERENCIAS)

      .doc(dados.transferenciaId);



    if (dados.acao === "cancelar") {

      await db.runTransaction(

        async (tx) => {

          const registro =

            await tx.get(

              transferenciaRef,

            );



          if (

            !registro.exists ||

            registro.data()?.status !==

              "pendente"

          ) {

            throw new Error(

              "A transferência já foi encerrada ou não existe.",

            );

          }



          const transferencia =

            registro.data() as Transfer;



          const referencias =

            transferencia.itens.map(

              (item) =>

                db

                  .collection(PRINCIPAL)

                  .doc(item.produtoId),

            );



          const produtos =

            await Promise.all(

              referencias.map((ref) =>

                tx.get(ref),

              ),

            );



          for (

            let i = 0;

            i < produtos.length;

            i++

          ) {

            const atual =

              produtos[i].data() as

                | Product

                | undefined;



            const item =

              transferencia.itens[i];



            if (

              !atual ||

              atual.lote !== item.lote

            ) {

              throw new Error(

                "Produto ou lote de origem não encontrado.",

              );

            }



            const quantidade =

              Math.round(

                (atual.quantidade +

                  item.quantidadeEnviada) *

                  1000,

              ) / 1000;



            tx.update(

              referencias[i],

              {

                quantidade,

                situacao: situacao(

                  quantidade,

                  atual.validade,

                ),

              },

            );
            tx.create(db.collection("movimentacoesEstoque").doc(`cancelamento-${transferenciaRef.id}-${item.id}`), {
              tipo: "cancelamento-transferencia", produtoId: item.produtoId, lote: item.lote,
              quantidade: item.quantidadeEnviada, saldoAnterior: atual.quantidade,
              saldoNovo: quantidade, transferenciaId: transferenciaRef.id,
              registradoPorId: pessoa.uid, registradoPor: pessoa.nome, registradoEm: new Date(),
            });

          }



          tx.update(

            transferenciaRef,

            {

              status: "cancelada",

              canceladoPorId:

                pessoa.uid,

              canceladoEm:

                new Date(),

            },

          );

        },

      );



      return NextResponse.json({

        ok: true,

      });

    }



    if (

      !Array.isArray(dados.itens) ||

      dados.itens.length === 0 ||

      dados.itens.length > 40

    ) {

      return responderErro(

        "Informe os itens recebidos.",

        400,

      );

    }



    await db.runTransaction(

      async (tx) => {

        const registro =

          await tx.get(

            transferenciaRef,

          );



        if (

          !registro.exists ||

          registro.data()?.status !==

            "pendente"

        ) {

          throw new Error(

            "A transferência já foi recebida ou não existe.",

          );

        }



        const transferencia =

          registro.data() as Transfer;



        if (

          dados.itens.length !==

            transferencia.itens

              .length ||

          new Set(

            dados.itens.map(

              (item) =>

                item.itemId,

            ),

          ).size !==

            dados.itens.length

        ) {

          throw new Error(

            "Confira todos os itens da transferência.",

          );

        }



        const checados =

          transferencia.itens.map(

            (item) => {

              const recebido =

                dados.itens.find(

                  (entrada) =>

                    entrada.itemId ===

                    item.id,

                );



              if (

                !recebido ||

                typeof recebido.quantidadeRecebida !==

                  "number" ||

                !Number.isFinite(

                  recebido.quantidadeRecebida,

                ) ||

                recebido.quantidadeRecebida <

                  0 ||

                Math.round(

                  recebido.quantidadeRecebida *

                    1000,

                ) !==

                  recebido.quantidadeRecebida *

                    1000 ||

                recebido.quantidadeRecebida >

                  item.quantidadeEnviada ||

                typeof recebido.recebidoCorretamente !==

                  "boolean"

              ) {

                throw new Error(

                  `Quantidade inválida para ${item.nome}.`,

                );

              }



              const divergencia =

                !recebido.recebidoCorretamente ||

                recebido.quantidadeRecebida !==

                  item.quantidadeEnviada;



              if (

                divergencia &&

                (typeof recebido.observacao !==

                  "string" ||

                  !recebido.observacao.trim() ||

                  recebido.observacao.length >

                    500)

              ) {

                throw new Error(

                  `Justifique a divergência de ${item.nome}.`,

                );

              }



              return {

                item,

                recebido,

                divergencia,

              };

            },

          );



        const referencias =

          checados.map(

            ({ item }) => ({

              principal: db

                .collection(

                  PRINCIPAL,

                )

                .doc(

                  item.produtoId,

                ),

              cozinha: db

                .collection(

                  COZINHA,

                )

                .doc(

                  item.produtoId,

                ),

            }),

          );



        const originais =

          await Promise.all(

            referencias.map(

              ({

                principal,

              }) =>

                tx.get(

                  principal,

                ),

            ),

          );



        const destinos =

          await Promise.all(

            referencias.map(

              ({

                cozinha,

              }) =>

                tx.get(

                  cozinha,

                ),

            ),

          );



        for (

          let i = 0;

          i <

          checados.length;

          i++

        ) {

          const {

            item,

            recebido,

          } =

            checados[i];



          const original =

            originais[

              i

            ].data() as

              | Product

              | undefined;



          if (

            !original ||

            original.lote !==

              item.lote ||

            original.unidade !==

              item.unidade

          ) {

            throw new Error(

              `Produto ou lote de ${item.nome} não encontrado.`,

            );

          }



          const destino =

            destinos[

              i

            ].data() as

              | Product

              | undefined;



          if (

            destino &&

            (destino.lote !==

              item.lote ||

              destino.unidade !==

                item.unidade)

          ) {

            throw new Error(

              `Lote conflitante na cozinha para ${item.nome}.`,

            );

          }



          const acrescimo =

            recebido.quantidadeRecebida;



          if (

            acrescimo > 0

          ) {

            const total =

              Math.round(

                ((destino?.quantidade ??

                  0) +

                  acrescimo) *

                  1000,

              ) /

              1000;



            tx.set(

              referencias[

                i

              ].cozinha,

              {

                nome:

                  original.nome,

                categoria:

                  original.categoria,

                lote:

                  original.lote,

                validade:

                  original.validade,

                unidade:

                  original.unidade,

                custoUnitario:

                  original.custoUnitario,

                quantidade:

                  total,

                situacao:

                  situacao(

                    total,

                    original.validade,

                  ),

              },

            );

          }

        }



        // Uma diferença entre enviado e recebido

        // fica registrada para apuração.

        // Ela não retorna automaticamente

        // ao estoque principal.

        tx.update(

          transferenciaRef,

          {

            status:

              checados.some(

                ({

                  divergencia,

                }) =>

                  divergencia,

              )

                ? "divergencia"

                : "conferida",

            recebimento:

              dados.itens,

            recebidoPorId:

              pessoa.uid,

            recebidoPor:

              pessoa.nome,

            recebidoEm:

              new Date(),

          },

        );

      },

    );



    return NextResponse.json({

      ok: true,

    });

  } catch (error) {

    return responderErro(

      error instanceof Error

        ? error.message

        : "Não foi possível atualizar o estoque.",

      409,

    );

  }

}