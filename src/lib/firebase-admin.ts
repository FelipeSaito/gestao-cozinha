import "server-only";

import fs from "node:fs";
import path from "node:path";

import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} from "firebase-admin/app";

import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function credencialDoAmbiente() {
  const projectId =
    process.env.FIREBASE_ADMIN_PROJECT_ID?.trim();

  const clientEmail =
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim();

  const privateKey =
    process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  const algumaVariavelPreenchida =
    Boolean(
      projectId ||
        clientEmail ||
        privateKey,
    );

  if (!algumaVariavelPreenchida) {
    return null;
  }

  if (
    !projectId ||
    !clientEmail ||
    !privateKey
  ) {
    throw new Error(
      "Configure FIREBASE_ADMIN_PROJECT_ID, " +
        "FIREBASE_ADMIN_CLIENT_EMAIL e " +
        "FIREBASE_ADMIN_PRIVATE_KEY.",
    );
  }

  const publicProjectId =
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();

  if (
    publicProjectId &&
    publicProjectId !== projectId
  ) {
    throw new Error(
      "O projeto do Firebase Admin não corresponde " +
        "ao NEXT_PUBLIC_FIREBASE_PROJECT_ID.",
    );
  }

  return {
    projectId,
    clientEmail,
    privateKey: privateKey.replace(
      /\\n/g,
      "\n",
    ),
  };
}

function getAdminApp() {
  const appExistente = getApps()[0];

  if (appExistente) {
    return appExistente;
  }

  /*
   * DEPLOY
   *
   * Na Vercel, as credenciais são fornecidas
   * por variáveis de ambiente protegidas.
   */
  const credencialAmbiente =
    credencialDoAmbiente();

  if (credencialAmbiente) {
    return initializeApp({
      credential: cert(
        credencialAmbiente,
      ),
    });
  }

  /*
   * DESENVOLVIMENTO LOCAL
   *
   * Procura a credencial dentro de:
   * .secrets/firebase-admin.json
   *
   * Esse arquivo nunca deve ir para o Git.
   */
  const caminhoCredencial = path.join(
    process.cwd(),
    ".secrets",
    "firebase-admin.json",
  );

  if (
    fs.existsSync(caminhoCredencial)
  ) {
    const conteudo =
      fs.readFileSync(
        caminhoCredencial,
        "utf8",
      );

    const credencial =
      JSON.parse(conteudo);

    return initializeApp({
      credential: cert(
        credencial,
      ),
    });
  }

  /*
   * AMBIENTES GOOGLE CLOUD
   *
   * Usa as credenciais automáticas quando
   * o servidor estiver executando em um
   * ambiente compatível.
   */
  return initializeApp({
    credential:
      applicationDefault(),
  });
}

export function firebaseAdmin() {
  const app = getAdminApp();

  return {
    auth: getAuth(app),
    db: getFirestore(app),
  };
}