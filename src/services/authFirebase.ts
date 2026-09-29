import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { firebaseClient } from "@/lib/firebase";
import { lerPerfis } from "@/contexts/AuthContext";
import type { UserRole } from "@/types";


export async function entrarComFirebase(email: string, senha: string, perfilEscolhido: UserRole) {
  const { auth, db } = firebaseClient();
  const credencial = await signInWithEmailAndPassword(auth, email.trim(), senha);
  try {
    const perfilDoc = await getDoc(doc(db, "perfis", credencial.user.uid));
    const dados = perfilDoc.data();
    const perfis = dados ? lerPerfis(dados) : [];
    if (!perfilDoc.exists() || !perfis.includes(perfilEscolhido) || typeof dados?.nome !== "string" ||
      typeof dados?.cargo !== "string" || typeof dados?.iniciais !== "string") {
      throw new Error("Esta conta não pertence ao perfil selecionado.");
    }
    return { id: credencial.user.uid, nome: dados.nome as string,
      cargo: dados.cargo as string, iniciais: dados.iniciais as string,
      perfil: perfilEscolhido, perfis };
  } catch (erro) {
    await signOut(auth);
    throw erro;
  }
}