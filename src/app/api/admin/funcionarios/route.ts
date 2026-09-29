import { hash } from "bcryptjs";
import {
  NextResponse,
  type NextRequest,
} from "next/server";

import { firebaseAdmin } from "@/lib/firebase-admin";

export const runtime = "nodejs";

const PERFIS_PERMITIDOS = [
  "producao",
  "feirantes",
  "administracao",
] as const;

type PerfilFuncionario =
  (typeof PERFIS_PERMITIDOS)[number];

type Cadastro = {
  id?: unknown;
  nome?: unknown;
  cargo?: unknown;
  iniciais?: unknown;
  perfis?: unknown;
  pin?: unknown;
};

type EdicaoFuncionario = {
  id?: unknown;
  nome?: unknown;
  cargo?: unknown;
  iniciais?: unknown;
  perfis?: unknown;
};

/*
 * Verifica se o usuário autenticado
 * possui perfil de Dono.
 */
async function verificarDono(
  request: NextRequest,
) {
  const { auth, db } = firebaseAdmin();

  const header =
    request.headers.get("authorization") ?? "";

  const bearer =
    /^Bearer (\S+)$/.exec(header);

  if (!bearer) {
    return {
      autorizado: false as const,
      resposta: NextResponse.json(
        { erro: "Acesso negado." },
        { status: 401 },
      ),
    };
  }

  let token;

  try {
    token = await auth.verifyIdToken(
      bearer[1],
      true,
    );
  } catch {
    return {
      autorizado: false as const,
      resposta: NextResponse.json(
        { erro: "Sessão inválida." },
        { status: 401 },
      ),
    };
  }

  const documentoDono = await db
    .collection("perfis")
    .doc(token.uid)
    .get();

  const acesso = documentoDono.data();

  const ehDono =
    documentoDono.exists &&
    (acesso?.perfil === "dono" ||
      (Array.isArray(acesso?.perfis) &&
        acesso.perfis.includes("dono")));

  if (!ehDono) {
    return {
      autorizado: false as const,
      resposta: NextResponse.json(
        { erro: "Acesso negado." },
        { status: 403 },
      ),
    };
  }

  return {
    autorizado: true as const,
    uid: token.uid,
  };
}

/*
 * Validação das áreas permitidas
 * para funcionários.
 *
 * Dono NÃO pode ser atribuído por
 * essa API.
 */
function perfisValidos(
  perfis: unknown,
): perfis is PerfilFuncionario[] {
  return (
    Array.isArray(perfis) &&
    perfis.length >= 1 &&
    perfis.length <= 3 &&
    perfis.every(
      (
        perfil,
      ): perfil is PerfilFuncionario =>
        typeof perfil === "string" &&
        PERFIS_PERMITIDOS.includes(
          perfil as PerfilFuncionario,
        ),
    ) &&
    new Set(perfis).size === perfis.length
  );
}

/*
 * =========================================================
 * POST
 * Cadastrar novo funcionário
 * =========================================================
 */
export async function POST(
  request: NextRequest,
) {
  const { auth, db } = firebaseAdmin();

  try {
    const verificacao =
      await verificarDono(request);

    if (!verificacao.autorizado) {
      return verificacao.resposta;
    }

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

    let dados: Cadastro;

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
      nome,
      cargo,
      iniciais,
      perfis,
      pin,
    } = dados;

    if (
      typeof id !== "string" ||
      !/^[a-z0-9-]{2,60}$/.test(id) ||
      typeof nome !== "string" ||
      !nome.trim() ||
      nome.length > 80 ||
      typeof cargo !== "string" ||
      !cargo.trim() ||
      cargo.length > 80 ||
      typeof iniciais !== "string" ||
      !/^[A-ZÀ-Ý]{1,4}$/.test(iniciais) ||
      typeof pin !== "string" ||
      !/^\d{6}$/.test(pin) ||
      !perfisValidos(perfis)
    ) {
      return NextResponse.json(
        {
          erro:
            "Confira os dados do funcionário e o PIN de 6 dígitos.",
        },
        {
          status: 400,
        },
      );
    }

    /*
     * O identificador é o nome utilizado
     * para localizar o funcionário no login.
     */
    const funcionarioRef = db
      .collection("funcionarios")
      .doc(id);

    const funcionarioExistente =
      await funcionarioRef.get();

    if (funcionarioExistente.exists) {
      return NextResponse.json(
        {
          erro:
            "Esse identificador já existe.",
        },
        {
          status: 409,
        },
      );
    }

    /*
     * UID técnico aleatório.
     *
     * O nome, identificador e PIN
     * nunca são utilizados como UID.
     */
    const uid = crypto.randomUUID();

    /*
     * O PIN nunca é salvo como texto.
     *
     * Somente o hash bcrypt é armazenado.
     */
    const pinHash = await hash(pin, 12);

    /*
     * Cria a identidade no
     * Firebase Authentication.
     */
    await auth.createUser({
      uid,
      displayName: nome.trim(),
    });

    try {
      const batch = db.batch();

      /*
       * Documento responsável pelos
       * dados e permissões do usuário.
       */
      batch.create(
        db.collection("perfis").doc(uid),
        {
          nome: nome.trim(),
          cargo: cargo.trim(),
          iniciais,
          perfis,
        },
      );

      /*
       * Documento interno utilizado
       * para autenticação por PIN.
       */
      batch.create(funcionarioRef, {
        uid,
        nome: nome.trim(),
        ativo: true,
        pinHash,
        tentativas: 0,
        janelaInicio: 0,
        bloqueadoAte: 0,
      });

      await batch.commit();
    } catch (error) {
      /*
       * Se o Firestore falhar depois da
       * criação no Authentication,
       * removemos o usuário para não
       * deixar cadastro incompleto.
       */
      await auth
        .deleteUser(uid)
        .catch(
          (cleanupError: unknown) => {
            console.error(
              "Falha ao desfazer cadastro do funcionário:",
              cleanupError,
            );
          },
        );

      throw error;
    }

    return NextResponse.json(
      {
        id,
        nome: nome.trim(),
        cargo: cargo.trim(),
        iniciais,
        perfis,
      },
      {
        status: 201,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error(
      "Falha ao cadastrar funcionário:",
      error,
    );

    return NextResponse.json(
      {
        erro:
          "Não foi possível cadastrar o funcionário.",
      },
      {
        status: 500,
      },
    );
  }
}

/*
 * =========================================================
 * PATCH
 * Editar funcionário existente
 * =========================================================
 */
export async function PATCH(
  request: NextRequest,
) {
  const { auth, db } = firebaseAdmin();

  try {
    const verificacao =
      await verificarDono(request);

    if (!verificacao.autorizado) {
      return verificacao.resposta;
    }

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

    let dados: EdicaoFuncionario;

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
      nome,
      cargo,
      iniciais,
      perfis,
    } = dados;

    /*
     * O identificador não será alterado
     * nesta etapa.
     *
     * Podemos alterar:
     * - nome
     * - cargo
     * - iniciais
     * - áreas de acesso
     */
    if (
      typeof id !== "string" ||
      !/^[a-z0-9-]{2,60}$/.test(id) ||
      typeof nome !== "string" ||
      !nome.trim() ||
      nome.length > 80 ||
      typeof cargo !== "string" ||
      !cargo.trim() ||
      cargo.length > 80 ||
      typeof iniciais !== "string" ||
      !/^[A-ZÀ-Ý]{1,4}$/.test(iniciais) ||
      !perfisValidos(perfis)
    ) {
      return NextResponse.json(
        {
          erro:
            "Confira os dados e as áreas do funcionário.",
        },
        {
          status: 400,
        },
      );
    }

    /*
     * Procura o funcionário pelo
     * identificador utilizado no login.
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

    const funcionario =
      funcionarioDocumento.data();

    const uid = funcionario?.uid;

    if (
      typeof uid !== "string" ||
      !uid
    ) {
      return NextResponse.json(
        {
          erro:
            "Cadastro do funcionário está incompleto.",
        },
        {
          status: 500,
        },
      );
    }

    /*
     * Documento que controla nome,
     * cargo e permissões.
     */
    const perfilRef = db
      .collection("perfis")
      .doc(uid);

    const perfilDocumento =
      await perfilRef.get();

    if (!perfilDocumento.exists) {
      return NextResponse.json(
        {
          erro:
            "Perfil do funcionário não encontrado.",
        },
        {
          status: 404,
        },
      );
    }

    /*
     * Atualizamos os documentos
     * do Firestore juntos.
     *
     * O PIN NÃO é alterado.
     */
    const batch = db.batch();

    batch.update(perfilRef, {
      nome: nome.trim(),
      cargo: cargo.trim(),
      iniciais,
      perfis,
    });

    batch.update(funcionarioRef, {
      nome: nome.trim(),
    });

    await batch.commit();

    /*
     * Mantém também o nome sincronizado
     * no Firebase Authentication.
     */
    await auth.updateUser(uid, {
      displayName: nome.trim(),
    });

    return NextResponse.json(
      {
        id,
        nome: nome.trim(),
        cargo: cargo.trim(),
        iniciais,
        perfis,
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
      "Falha ao editar funcionário:",
      error,
    );

    return NextResponse.json(
      {
        erro:
          "Não foi possível atualizar o funcionário.",
      },
      {
        status: 500,
      },
    );
  }
}