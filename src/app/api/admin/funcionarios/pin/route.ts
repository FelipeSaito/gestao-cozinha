import { hash } from "bcryptjs";
import {
  NextResponse,
  type NextRequest,
} from "next/server";

import { firebaseAdmin } from "@/lib/firebase-admin";

export const runtime = "nodejs";

type RedefinirPin = {
  id?: unknown;
  pin?: unknown;
};

export async function PATCH(
  request: NextRequest,
) {
  const { auth, db } = firebaseAdmin();

  /*
   * ============================================
   * 1. VERIFICAR TOKEN
   * ============================================
   */

  const header =
    request.headers.get("authorization") ?? "";

  const bearer =
    /^Bearer (\S+)$/.exec(header);

  if (!bearer) {
    return NextResponse.json(
      {
        erro: "Acesso negado.",
      },
      {
        status: 401,
      },
    );
  }

  let usuario;

  try {
    usuario = await auth.verifyIdToken(
      bearer[1],
      true,
    );
  } catch {
    return NextResponse.json(
      {
        erro: "Sessão inválida.",
      },
      {
        status: 401,
      },
    );
  }

  try {
    /*
     * ============================================
     * 2. CONFIRMAR QUE É DONO
     * ============================================
     */

    const documentoDono = await db
      .collection("perfis")
      .doc(usuario.uid)
      .get();

    const acesso =
      documentoDono.data();

    const ehDono =
      documentoDono.exists &&
      (acesso?.perfil === "dono" ||
        (Array.isArray(acesso?.perfis) &&
          acesso.perfis.includes("dono")));

    if (!ehDono) {
      return NextResponse.json(
        {
          erro: "Acesso negado.",
        },
        {
          status: 403,
        },
      );
    }

    /*
     * ============================================
     * 3. VERIFICAR JSON
     * ============================================
     */

    if (
      !request.headers
        .get("content-type")
        ?.startsWith("application/json")
    ) {
      return NextResponse.json(
        {
          erro: "Envie dados em JSON.",
        },
        {
          status: 415,
        },
      );
    }

    let dados: RedefinirPin;

    try {
      dados = await request.json();
    } catch {
      return NextResponse.json(
        {
          erro: "Dados inválidos.",
        },
        {
          status: 400,
        },
      );
    }

    const {
      id,
      pin,
    } = dados;

    /*
     * ============================================
     * 4. VALIDAR IDENTIFICADOR E PIN
     * ============================================
     */

    if (
      typeof id !== "string" ||
      !/^[a-z0-9-]{2,60}$/.test(id) ||
      typeof pin !== "string" ||
      !/^\d{6}$/.test(pin)
    ) {
      return NextResponse.json(
        {
          erro:
            "Informe um funcionário válido e um PIN de 6 dígitos.",
        },
        {
          status: 400,
        },
      );
    }

    /*
     * ============================================
     * 5. LOCALIZAR FUNCIONÁRIO
     * ============================================
     */

    const funcionarioRef = db
      .collection("funcionarios")
      .doc(id);

    const funcionarioDocumento =
      await funcionarioRef.get();

    if (!funcionarioDocumento.exists) {
      return NextResponse.json(
        {
          erro:
            "Funcionário não encontrado.",
        },
        {
          status: 404,
        },
      );
    }

    /*
     * ============================================
     * 6. GERAR NOVO HASH
     * ============================================
     *
     * O PIN em texto nunca será salvo.
     */

    const pinHash =
      await hash(pin, 12);

    /*
     * ============================================
     * 7. ATUALIZAR PIN
     * ============================================
     *
     * Também zeramos eventuais bloqueios
     * causados por tentativas incorretas.
     */

    await funcionarioRef.update({
      pinHash,
      tentativas: 0,
      janelaInicio: 0,
      bloqueadoAte: 0,
    });

    /*
     * ============================================
     * 8. RESPOSTA
     * ============================================
     */

    return NextResponse.json(
      {
        sucesso: true,
        mensagem:
          "PIN redefinido com sucesso.",
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error(
      "Falha ao redefinir PIN:",
      error,
    );

    return NextResponse.json(
      {
        erro:
          "Não foi possível redefinir o PIN.",
      },
      {
        status: 500,
      },
    );
  }
}