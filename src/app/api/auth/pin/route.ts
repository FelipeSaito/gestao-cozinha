import { compare } from "bcryptjs";
import { NextResponse, type NextRequest } from "next/server";
import { firebaseAdmin } from "@/lib/firebase-admin";

export const runtime = "nodejs";

const MAX_TENTATIVAS = 5;
const JANELA_MS = 15 * 60 * 1000;
const ERRO_LOGIN = "Funcionário ou PIN inválido.";

type LoginBody = { funcionarioId?: unknown; pin?: unknown };

export async function POST(request: NextRequest) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return NextResponse.json({ erro: "Envie dados em JSON." }, { status: 415 });
  }

  let entrada: LoginBody;
  try {
    entrada = await request.json();
  } catch {
    return NextResponse.json({ erro: ERRO_LOGIN }, { status: 400 });
  }

  const { funcionarioId, pin } = entrada;
  if (
    typeof funcionarioId !== "string" ||
    !/^[a-z0-9-]{2,60}$/.test(funcionarioId) ||
    typeof pin !== "string" ||
    !/^\d{6}$/.test(pin)
  ) {
    return NextResponse.json({ erro: ERRO_LOGIN }, { status: 401 });
  }

  const { auth, db } = firebaseAdmin();
  const ref = db.collection("funcionarios").doc(funcionarioId);
  const agora = Date.now();

  try {
    const uid = await db.runTransaction(async (transaction) => {
      const funcionario = await transaction.get(ref);
      const dados = funcionario.data();

      if (
        !funcionario.exists ||
        dados?.ativo !== true ||
        typeof dados.uid !== "string" ||
        typeof dados.pinHash !== "string"
      ) {
        return null;
      }

      const bloqueadoAte = Number(dados.bloqueadoAte) || 0;
      if (bloqueadoAte > agora) return null;

      const janelaInicio = Number(dados.janelaInicio) || 0;
      const tentativasNaJanela = agora - janelaInicio < JANELA_MS
        ? Number(dados.tentativas) || 0
        : 0;

      if (tentativasNaJanela >= MAX_TENTATIVAS) return null;

      const correto = await compare(pin, dados.pinHash);
      if (!correto) {
        const tentativas = tentativasNaJanela + 1;
        transaction.update(ref, {
          tentativas,
          janelaInicio: tentativasNaJanela ? janelaInicio : agora,
          bloqueadoAte: tentativas >= MAX_TENTATIVAS ? agora + JANELA_MS : 0,
        });
        return null;
      }

      // Um funcionário precisa ter um perfil cadastrado antes de entrar.
      const perfil = await transaction.get(db.collection("perfis").doc(dados.uid));
      const perfilData = perfil.data();
      if (!perfil.exists || !Array.isArray(perfilData?.perfis) ||
          perfilData.perfis.length === 0 || perfilData.perfis.includes("dono")) {
        return null;
      }

      transaction.update(ref, { tentativas: 0, janelaInicio: 0, bloqueadoAte: 0 });
      return dados.uid as string;
    });

    if (!uid) return NextResponse.json({ erro: ERRO_LOGIN }, { status: 401 });

    const token = await auth.createCustomToken(uid);
    return NextResponse.json({ token }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Falha interna na autenticação de funcionário:", error);
    return NextResponse.json({ erro: "Não foi possível entrar agora." }, { status: 500 });
  }
}
