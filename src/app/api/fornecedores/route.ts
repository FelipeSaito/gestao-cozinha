import { NextResponse, type NextRequest } from "next/server";

import { firebaseAdmin } from "@/lib/firebase-admin";

export const runtime = "nodejs";

const COLECAO = "fornecedores";
const COLECAO_DOCUMENTOS = "fornecedoresDocumentos";

type EntradaFornecedor = {
  operacaoId?: unknown;
  id?: unknown;
  nome?: unknown;
  documento?: unknown;
  contato?: unknown;
  telefone?: unknown;
  produtos?: unknown;
  ativo?: unknown;
  versao?: unknown;
};

type CamposFornecedor = {
  nome: string;
  documento: string;
  documentoChave: string;
  contato: string;
  telefone: string;
  produtos: string;
  ativo: boolean;
};

function responderErro(mensagem: string, status: number) {
  return NextResponse.json(
    { erro: mensagem },
    { status },
  );
}

function objetoValido(
  valor: unknown,
): valor is EntradaFornecedor {
  return (
    valor !== null &&
    typeof valor === "object" &&
    !Array.isArray(valor)
  );
}

function identificadorValido(
  valor: unknown,
): valor is string {
  return (
    typeof valor === "string" &&
    /^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(valor)
  );
}

function versaoValida(
  valor: unknown,
): valor is number {
  return (
    typeof valor === "number" &&
    Number.isSafeInteger(valor) &&
    valor >= 0 &&
    valor < Number.MAX_SAFE_INTEGER
  );
}

function documentoNormalizado(valor: string) {
  return valor
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase();
}

function lerCampos(
  dados: EntradaFornecedor,
): CamposFornecedor | null {
  if (
    typeof dados.nome !== "string" ||
    typeof dados.documento !== "string" ||
    typeof dados.contato !== "string" ||
    typeof dados.telefone !== "string" ||
    typeof dados.produtos !== "string" ||
    typeof dados.ativo !== "boolean"
  ) {
    return null;
  }

  const nome = dados.nome.trim();
  const documento = dados.documento.trim();
  const contato = dados.contato.trim();
  const telefone = dados.telefone.trim();
  const produtos = dados.produtos.trim();

  const documentoChave = documentoNormalizado(documento);

  if (
    nome.length < 2 ||
    nome.length > 100 ||
    documento.length > 30 ||
    contato.length > 80 ||
    telefone.length > 30 ||
    produtos.length > 200 ||
    (documento.length > 0 && documentoChave.length === 0)
  ) {
    return null;
  }

  return {
    nome,
    documento,
    documentoChave,
    contato,
    telefone,
    produtos,
    ativo: dados.ativo,
  };
}

function mesmosCampos(
  salvo: Record<string, unknown>,
  campos: CamposFornecedor,
) {
  return (
    salvo.nome === campos.nome &&
    salvo.documento === campos.documento &&
    salvo.documentoChave === campos.documentoChave &&
    salvo.contato === campos.contato &&
    salvo.telefone === campos.telefone &&
    salvo.produtos === campos.produtos &&
    salvo.ativo === campos.ativo
  );
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
    const usuario = await auth.verifyIdToken(token, true);
    const uid = usuario.uid;

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
    return responderErro(
      "Acesso negado ou sessão inválida.",
      403,
    );
  }

  try {
    const snapshot = await pessoa.db
      .collection(COLECAO)
      .limit(1001)
      .get();

    if (snapshot.size > 1000) {
      return responderErro(
        "Há muitos fornecedores cadastrados. Solicite paginação.",
        413,
      );
    }

    const fornecedores = snapshot.docs
      .map((documento) => {
        const dados = documento.data();

        return {
          id: documento.id,
          nome:
            typeof dados.nome === "string"
              ? dados.nome
              : "",
          documento:
            typeof dados.documento === "string"
              ? dados.documento
              : "",
          contato:
            typeof dados.contato === "string"
              ? dados.contato
              : "",
          telefone:
            typeof dados.telefone === "string"
              ? dados.telefone
              : "",
          produtos:
            typeof dados.produtos === "string"
              ? dados.produtos
              : "",
          ativo: dados.ativo !== false,
          versao:
            Number.isSafeInteger(dados.versao) &&
            dados.versao >= 0
              ? dados.versao
              : 0,
        };
      })
      .filter(
        (fornecedor) => fornecedor.nome.trim().length > 0,
      )
      .sort((a, b) =>
        a.nome.localeCompare(b.nome, "pt-BR"),
      );

    return NextResponse.json({
      fornecedores,
    });
  } catch {
    return responderErro(
      "Não foi possível carregar os fornecedores.",
      500,
    );
  }
}

export async function POST(request: NextRequest) {
  const pessoa = await pessoaAutorizada(request);

  if (!pessoa) {
    return responderErro(
      "Somente o Dono ou a Administração podem cadastrar fornecedores.",
      403,
    );
  }

  if (
    !request.headers
      .get("content-type")
      ?.startsWith("application/json")
  ) {
    return responderErro(
      "Envie os dados em JSON.",
      415,
    );
  }

  let dados: unknown;

  try {
    dados = await request.json();
  } catch {
    return responderErro(
      "Dados inválidos.",
      400,
    );
  }

  if (!objetoValido(dados)) {
    return responderErro(
      "Dados inválidos.",
      400,
    );
  }

  const campos = lerCampos(dados);

  if (
    !identificadorValido(dados.operacaoId) ||
    !campos
  ) {
    return responderErro(
      "Confira os dados do fornecedor.",
      400,
    );
  }

  const fornecedorId = dados.operacaoId;

  const fornecedorRef = pessoa.db
    .collection(COLECAO)
    .doc(fornecedorId);

  const documentoRef = campos.documentoChave
    ? pessoa.db
        .collection(COLECAO_DOCUMENTOS)
        .doc(campos.documentoChave)
    : null;

  try {
    const resultado = await pessoa.db.runTransaction(
      async (transacao) => {
        const fornecedorAtual = await transacao.get(
          fornecedorRef,
        );

        const documentoAtual = documentoRef
          ? await transacao.get(documentoRef)
          : null;

        if (fornecedorAtual.exists) {
          const salvo = fornecedorAtual.data() ?? {};

          if (
            salvo.cadastradoPorId !== pessoa.uid ||
            !mesmosCampos(salvo, campos)
          ) {
            throw new Error(
              "Identificador de operação já utilizado.",
            );
          }

          return {
            repetida: true,
            versao:
              Number.isSafeInteger(salvo.versao) &&
              salvo.versao >= 0
                ? salvo.versao
                : 0,
          };
        }

        if (
          documentoAtual?.exists &&
          documentoAtual.data()?.fornecedorId !== fornecedorId
        ) {
          throw new Error(
            "Este documento já foi informado em outro cadastro.",
          );
        }

        const agora = new Date();

        transacao.create(fornecedorRef, {
          ...campos,
          versao: 0,
          cadastradoPorId: pessoa.uid,
          cadastradoPor: pessoa.nome,
          cadastradoEm: agora,
          atualizadoEm: agora,
        });

        if (documentoRef) {
          transacao.set(documentoRef, {
            fornecedorId,
            atualizadoEm: agora,
          });
        }

        return {
          repetida: false,
          versao: 0,
        };
      },
    );

    return NextResponse.json({
      ok: true,
      id: fornecedorId,
      ...resultado,
    });
  } catch (erro) {
    return responderErro(
      erro instanceof Error
        ? erro.message
        : "Não foi possível cadastrar o fornecedor.",
      409,
    );
  }
}

export async function PUT(request: NextRequest) {
  const pessoa = await pessoaAutorizada(request);

  if (!pessoa) {
    return responderErro(
      "Somente o Dono ou a Administração podem editar fornecedores.",
      403,
    );
  }

  if (
    !request.headers
      .get("content-type")
      ?.startsWith("application/json")
  ) {
    return responderErro(
      "Envie os dados em JSON.",
      415,
    );
  }

  let dados: unknown;

  try {
    dados = await request.json();
  } catch {
    return responderErro(
      "Dados inválidos.",
      400,
    );
  }

  if (!objetoValido(dados)) {
    return responderErro(
      "Dados inválidos.",
      400,
    );
  }

  const campos = lerCampos(dados);

  if (
    !identificadorValido(dados.id) ||
    !versaoValida(dados.versao) ||
    !campos
  ) {
    return responderErro(
      "Confira os dados do fornecedor.",
      400,
    );
  }

  const fornecedorId = dados.id;
  const versaoAtual = dados.versao;

  const fornecedorRef = pessoa.db
    .collection(COLECAO)
    .doc(fornecedorId);

  try {
    const novaVersao = await pessoa.db.runTransaction(
      async (transacao) => {
        const fornecedorAtual = await transacao.get(
          fornecedorRef,
        );

        if (!fornecedorAtual.exists) {
          throw new Error(
            "Fornecedor não encontrado. Atualize a página.",
          );
        }

        const salvo = fornecedorAtual.data() ?? {};

        if ((salvo.versao ?? 0) !== versaoAtual) {
          throw new Error(
            "Este fornecedor foi alterado por outra pessoa. Atualize a página antes de editar.",
          );
        }

        const documentoAnterior =
          typeof salvo.documentoChave === "string"
            ? salvo.documentoChave
            : "";

        const indiceAnteriorRef = documentoAnterior
          ? pessoa.db
              .collection(COLECAO_DOCUMENTOS)
              .doc(documentoAnterior)
          : null;

        const indiceNovoRef = campos.documentoChave
          ? pessoa.db
              .collection(COLECAO_DOCUMENTOS)
              .doc(campos.documentoChave)
          : null;

        const indiceAnterior = indiceAnteriorRef
          ? await transacao.get(indiceAnteriorRef)
          : null;

        const indiceNovo = indiceNovoRef
          ? await transacao.get(indiceNovoRef)
          : null;

        if (
          indiceNovo?.exists &&
          indiceNovo.data()?.fornecedorId !== fornecedorId
        ) {
          throw new Error(
            "Este documento já foi informado em outro cadastro.",
          );
        }

        const proximaVersao = versaoAtual + 1;
        const agora = new Date();

        transacao.update(fornecedorRef, {
          ...campos,
          versao: proximaVersao,
          alteradoPorId: pessoa.uid,
          alteradoPor: pessoa.nome,
          atualizadoEm: agora,
        });

        if (
          indiceAnteriorRef &&
          documentoAnterior !== campos.documentoChave &&
          (!indiceAnterior?.exists ||
            indiceAnterior.data()?.fornecedorId === fornecedorId)
        ) {
          transacao.delete(indiceAnteriorRef);
        }

        if (indiceNovoRef) {
          transacao.set(indiceNovoRef, {
            fornecedorId,
            atualizadoEm: agora,
          });
        }

        return proximaVersao;
      },
    );

    return NextResponse.json({
      ok: true,
      id: fornecedorId,
      versao: novaVersao,
    });
  } catch (erro) {
    return responderErro(
      erro instanceof Error
        ? erro.message
        : "Não foi possível editar o fornecedor.",
      409,
    );
  }
}