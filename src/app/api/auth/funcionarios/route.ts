import { NextResponse } from "next/server";
import { firebaseAdmin } from "@/lib/firebase-admin";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { db } = firebaseAdmin();
    const documentos = await db.collection("funcionarios")
      .where("ativo", "==", true).limit(100).get();

    const lista = await Promise.all(documentos.docs.map(async (doc) => {
      const uid = doc.data().uid;
      if (typeof uid !== "string") return null;
      const perfil = await db.collection("perfis").doc(uid).get();
      const dados = perfil.data();
      if (!perfil.exists || typeof dados?.nome !== "string" ||
          typeof dados?.iniciais !== "string" || !Array.isArray(dados?.perfis)) return null;
      return { id: doc.id, nome: dados.nome, iniciais: dados.iniciais,
        perfis: dados.perfis.filter((p: unknown) =>
          p === "producao" || p === "feirantes" || p === "administracao") };
    }));

    return NextResponse.json(lista.filter((item) => item && item.perfis.length > 0), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Falha ao listar funcionários:", error);
    return NextResponse.json({ erro: "Não foi possível carregar a equipe." }, { status: 500 });
  }
}
