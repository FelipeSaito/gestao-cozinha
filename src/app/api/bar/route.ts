import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { firebaseAdmin } from "@/lib/firebase-admin";

export const runtime = "nodejs";

const BEBIDAS = "bebidasBar";
const MOVIMENTACOES = "movimentacoesBar";
const INDICES_NOME = "bebidasBarNomes";
const INDICES_CODIGO = "bebidasBarCodigos";

type Cadastro = {
  acao: "cadastrar";
  operacaoId: unknown;
  nome: unknown;
  volume: unknown;
  codigo: unknown;
  fardo: unknown;
  minimo: unknown;
};

type Movimentacao = {
  acao: "movimentar";
  operacaoId: unknown;
  bebidaId: unknown;
  tipo: unknown;
  quantidade: unknown;
};

type Dados = Cadastro | Movimentacao;

function falha(mensagem: string, status: number) {
  return NextResponse.json(
    { erro: mensagem },
    { status },
  );
}

function identificadorValido(valor: unknown): valor is string {
  return (
    typeof valor === "string" &&
    /^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(valor)
  );
}

function textoValido(
  valor: unknown,
  minimo: number,
  maximo: number,
): valor is string {
  return (
    typeof valor === "string" &&
    valor.trim().length >= minimo &&
    valor.trim().length <= maximo
  );
}

function inteiroValido(
  valor: unknown,
  minimo: number,
  maximo: number,
): valor is number {
  return (
    typeof valor === "number" &&
    Number.isSafeInteger(valor) &&
    valor >= minimo &&
    valor <= maximo
  );
}

function codigoValido(valor: unknown): valor is string {
  return (
    typeof valor === "string" &&
    (valor === "" || /^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(valor))
  );
}

function normalizar(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

function chaveNome(nome: string, volume: string) {
  return createHash("sha256")
    .update(`${normalizar(nome)}|${normalizar(volume)}`)
    .digest("hex");
}

async function pessoaAutorizada(request: NextRequest) {
  const token = /^Bearer (\S+)$/.exec(
    request.headers.get("authorization") ?? "",
  )?.[1];

  if (!token) {
    return null;
  }

  const { auth, db } = firebaseAdmin();

  try {
    const uid = (await auth.verifyIdToken(token, true)).uid;

    const perfil = (
      await db.collection("perfis").doc(uid).get()
    ).data();

    const perfis = Array.isArray(perfil?.perfis)
      ? perfil.perfis
      : [];

    const autorizado =
      perfil?.perfil === "dono" ||
      perfil?.perfil === "administracao" ||
      perfis.includes("dono") ||
      perfis.includes("administracao");

    if (!autorizado) {
      return null;
    }

    return {
      uid,
      nome:
        typeof perfil?.nome === "string" && perfil.nome.trim()
          ? perfil.nome.trim()
          : "Funcionário",
      db,
    };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const pessoa = await pessoaAutorizada(request);

  if (!pessoa) {
    return falha("Acesso negado ou sessão inválida.", 403);
  }

  try {
    const [bebidasSnapshot, movimentosSnapshot] = await Promise.all([
      pessoa.db.collection(BEBIDAS).limit(1001).get(),

      pessoa.db
        .collection(MOVIMENTACOES)
        .orderBy("registradoEm", "desc")
        .limit(30)
        .get(),
    ]);

    if (bebidasSnapshot.size > 1000) {
      return falha(
        "Há muitas bebidas cadastradas. Solicite paginação.",
        413,
      );
    }

    const bebidas = bebidasSnapshot.docs
      .map((documento) => {
        const dados = documento.data();

        return {
          id: documento.id,
          nome: typeof dados.nome === "string" ? dados.nome : "",
          volume: typeof dados.volume === "string" ? dados.volume : "",
          codigo: typeof dados.codigo === "string" ? dados.codigo : "",
          saldo:
            Number.isSafeInteger(dados.saldo) && dados.saldo >= 0
              ? dados.saldo
              : 0,
          fardo:
            Number.isSafeInteger(dados.fardo) && dados.fardo > 0
              ? dados.fardo
              : 1,
          minimo:
            Number.isSafeInteger(dados.minimo) && dados.minimo >= 0
              ? dados.minimo
              : 0,
          versao:
            Number.isSafeInteger(dados.versao) && dados.versao >= 0
              ? dados.versao
              : 0,
        };
      })
      .filter((bebida) => bebida.nome && bebida.volume)
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

    const movimentacoes = movimentosSnapshot.docs.map((documento) => {
      const dados = documento.data();

      const registradoEm =
        dados.registradoEm &&
        typeof dados.registradoEm.toDate === "function"
          ? dados.registradoEm.toDate().toISOString()
          : null;

      return {
        id: documento.id,
        bebidaId:
          typeof dados.bebidaId === "string" ? dados.bebidaId : "",
        bebidaNome:
          typeof dados.bebidaNome === "string"
            ? dados.bebidaNome
            : "Bebida",
        tipo: dados.tipo === "saida" ? "saida" : "entrada",
        quantidade: Number.isSafeInteger(dados.quantidade)
          ? dados.quantidade
          : 0,
        saldoNovo: Number.isSafeInteger(dados.saldoNovo)
          ? dados.saldoNovo
          : 0,
        registradoPor:
          typeof dados.registradoPor === "string"
            ? dados.registradoPor
            : "",
        registradoEm,
      };
    });

    return NextResponse.json({
      bebidas,
      movimentacoes,
    });
  } catch {
    return falha(
      "Não foi possível carregar o estoque do bar.",
      500,
    );
  }
}

export async function POST(request: NextRequest) {
  const pessoa = await pessoaAutorizada(request);

  if (!pessoa) {
    return falha(
      "Somente o Dono ou a Administração podem alterar o estoque do bar.",
      403,
    );
  }

  if (
    !request.headers
      .get("content-type")
      ?.startsWith("application/json")
  ) {
    return falha("Envie os dados em JSON.", 415);
  }

  let dados: Dados;

  try {
    dados = await request.json();
  } catch {
    return falha("Dados inválidos.", 400);
  }

  if (!dados || typeof dados !== "object") {
    return falha("Dados inválidos.", 400);
  }

  if (dados.acao === "cadastrar") {
    if (
      !identificadorValido(dados.operacaoId) ||
      !textoValido(dados.nome, 2, 80) ||
      !textoValido(dados.volume, 2, 60) ||
      !codigoValido(dados.codigo) ||
      !inteiroValido(dados.fardo, 1, 10000) ||
      !inteiroValido(dados.minimo, 0, 1_000_000)
    ) {
      return falha(
        "Confira nome, embalagem, código, fardo e estoque mínimo.",
        400,
      );
    }

    const id = dados.operacaoId;
    const nome = dados.nome.trim();
    const volume = dados.volume.trim();
    const codigo = dados.codigo.trim();
    const fardo = dados.fardo;
    const minimo = dados.minimo;

    const chave = chaveNome(nome, volume);

    const bebidaRef = pessoa.db.collection(BEBIDAS).doc(id);

    const nomeRef = pessoa.db.collection(INDICES_NOME).doc(chave);

    const codigoRef = codigo
      ? pessoa.db.collection(INDICES_CODIGO).doc(codigo)
      : null;

    try {
      const resultado = await pessoa.db.runTransaction(
        async (transacao) => {
          const bebidaAtual = await transacao.get(bebidaRef);
          const nomeAtual = await transacao.get(nomeRef);

          const codigoAtual = codigoRef
            ? await transacao.get(codigoRef)
            : null;

          if (bebidaAtual.exists) {
            const salvo = bebidaAtual.data();

            if (
              salvo?.cadastradoPorId !== pessoa.uid ||
              salvo?.nome !== nome ||
              salvo?.volume !== volume ||
              salvo?.codigo !== codigo ||
              salvo?.fardo !== fardo ||
              salvo?.minimo !== minimo
            ) {
              throw new Error(
                "Identificador de operação já utilizado.",
              );
            }

            return {
              repetida: true,
              saldo: Number.isSafeInteger(salvo.saldo)
                ? salvo.saldo
                : 0,
            };
          }

          if (
            nomeAtual.exists &&
            nomeAtual.data()?.bebidaId !== id
          ) {
            throw new Error(
              "Esta bebida e embalagem já estão cadastradas.",
            );
          }

          if (
            codigoAtual?.exists &&
            codigoAtual.data()?.bebidaId !== id
          ) {
            throw new Error(
              "Este código já pertence a outra bebida.",
            );
          }

          transacao.create(bebidaRef, {
            nome,
            volume,
            codigo,
            saldo: 0,
            fardo,
            minimo,
            versao: 0,
            cadastradoPorId: pessoa.uid,
            cadastradoPor: pessoa.nome,
            cadastradoEm: new Date(),
            atualizadoEm: new Date(),
          });

          transacao.set(nomeRef, {
            bebidaId: id,
            atualizadoEm: new Date(),
          });

          if (codigoRef) {
            transacao.set(codigoRef, {
              bebidaId: id,
              atualizadoEm: new Date(),
            });
          }

          return {
            repetida: false,
            saldo: 0,
          };
        },
      );

      return NextResponse.json({
        ok: true,
        bebida: {
          id,
          nome,
          volume,
          codigo,
          saldo: resultado.saldo,
          fardo,
          minimo,
          versao: 0,
        },
        repetida: resultado.repetida,
      });
    } catch (erro) {
      return falha(
        erro instanceof Error
          ? erro.message
          : "Não foi possível cadastrar a bebida.",
        409,
      );
    }
  }

  if (dados.acao === "movimentar") {
    if (
      !identificadorValido(dados.operacaoId) ||
      !identificadorValido(dados.bebidaId) ||
      (dados.tipo !== "entrada" && dados.tipo !== "saida") ||
      !inteiroValido(dados.quantidade, 1, 1_000_000)
    ) {
      return falha(
        "Confira a bebida, o tipo e a quantidade.",
        400,
      );
    }

    const operacaoId = dados.operacaoId;
    const bebidaId = dados.bebidaId;
    const tipo = dados.tipo;
    const quantidade = dados.quantidade;

    const movimentoRef = pessoa.db
      .collection(MOVIMENTACOES)
      .doc(operacaoId);

    const bebidaRef = pessoa.db
      .collection(BEBIDAS)
      .doc(bebidaId);

    try {
      const resultado = await pessoa.db.runTransaction(
        async (transacao) => {
          const [movimentoAtual, bebidaAtual] = await Promise.all([
            transacao.get(movimentoRef),
            transacao.get(bebidaRef),
          ]);

          if (!bebidaAtual.exists) {
            throw new Error(
              "Bebida não encontrada. Atualize a página.",
            );
          }

          const bebida = bebidaAtual.data();

          if (
            !bebida ||
            typeof bebida.nome !== "string" ||
            !Number.isSafeInteger(bebida.saldo) ||
            bebida.saldo < 0
          ) {
            throw new Error(
              "O cadastro da bebida está inválido.",
            );
          }

          if (movimentoAtual.exists) {
            const salvo = movimentoAtual.data();

            if (
              salvo?.bebidaId !== bebidaId ||
              salvo?.tipo !== tipo ||
              salvo?.quantidade !== quantidade ||
              salvo?.registradoPorId !== pessoa.uid
            ) {
              throw new Error(
                "Identificador de operação já utilizado.",
              );
            }

            return {
              repetida: true,
              nome: bebida.nome,
              saldo: bebida.saldo,
            };
          }

          const diferenca =
            tipo === "entrada" ? quantidade : -quantidade;

          const saldoNovo = bebida.saldo + diferenca;

          if (saldoNovo < 0) {
            throw new Error(
              "A saída não pode ser maior que o saldo disponível.",
            );
          }

          if (
            !Number.isSafeInteger(saldoNovo) ||
            saldoNovo > 1_000_000_000
          ) {
            throw new Error(
              "O saldo calculado é inválido.",
            );
          }

          transacao.update(bebidaRef, {
            saldo: saldoNovo,
            versao:
              (Number.isSafeInteger(bebida.versao)
                ? bebida.versao
                : 0) + 1,
            alteradoPorId: pessoa.uid,
            alteradoPor: pessoa.nome,
            atualizadoEm: new Date(),
          });

          transacao.create(movimentoRef, {
            bebidaId,
            bebidaNome: bebida.nome,
            tipo,
            quantidade,
            saldoAnterior: bebida.saldo,
            saldoNovo,
            registradoPorId: pessoa.uid,
            registradoPor: pessoa.nome,
            registradoEm: new Date(),
          });

          return {
            repetida: false,
            nome: bebida.nome,
            saldo: saldoNovo,
          };
        },
      );

      return NextResponse.json({
        ok: true,
        saldo: resultado.saldo,
        nome: resultado.nome,
        repetida: resultado.repetida,
      });
    } catch (erro) {
      return falha(
        erro instanceof Error
          ? erro.message
          : "Não foi possível registrar a movimentação.",
        409,
      );
    }
  }

  return falha("Ação inválida.", 400);
}