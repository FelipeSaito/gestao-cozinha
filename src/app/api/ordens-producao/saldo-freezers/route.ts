import { NextResponse, type NextRequest } from "next/server";
import { firebaseAdmin } from "@/lib/firebase-admin";

export const runtime = "nodejs";

const LOCAIS = ["freezer-1", "freezer-2", "freezer-3", "freezer-4"] as const;
type Local = (typeof LOCAIS)[number];

export async function GET(request: NextRequest) {
  const token = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return NextResponse.json({ erro: "Faça login." }, { status: 401 });

  const { auth, db } = firebaseAdmin();
  let uid: string;
  try {
    uid = (await auth.verifyIdToken(token, true)).uid;
  } catch {
    return NextResponse.json({ erro: "Sessão inválida." }, { status: 401 });
  }
  try {
    const perfil = (await db.collection("perfis").doc(uid).get()).data();
    const perfis: unknown[] = Array.isArray(perfil?.perfis) ? perfil.perfis : [];
    if (!["dono", "producao"].some((p) => perfil?.perfil === p || perfis.includes(p))) {
      return NextResponse.json({ erro: "Sem permissão para consultar a massa." }, { status: 403 });
    }
    const saldos: Record<Local, number> = {
      "freezer-1": 0, "freezer-2": 0, "freezer-3": 0, "freezer-4": 0,
    };
    const consulta = await db.collection("ordensProducao")
      .where("etapaMassa", "==", "concluida")
      .select("sacosPorLocal", "sacosRetiradosPorLocal")
      .get();
    for (const documento of consulta.docs) {
      const ordem = documento.data();
      for (const local of LOCAIS) {
        const guardados = ordem.sacosPorLocal?.[local] ?? 0;
        const retirados = ordem.sacosRetiradosPorLocal?.[local] ?? 0;
        if (!Number.isSafeInteger(guardados) || !Number.isSafeInteger(retirados) ||
          guardados < 0 || retirados < 0 || retirados > guardados) {
          return NextResponse.json(
            { erro: "Há uma ordem com saldo inconsistente. Revise o cadastro da massa." },
            { status: 409 },
          );
        }
        saldos[local] += guardados - retirados;
      }
    }
    return NextResponse.json({ saldos });
  } catch {
    return NextResponse.json({ erro: "Não foi possível consultar os freezers." }, { status: 500 });
  }
}
