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

function getAdminApp() {
  const appExistente = getApps()[0];

  if (appExistente) {
    return appExistente;
  }

  /*
   * EXECUÇÃO LOCAL
   *
   * Usa a credencial local tanto no `npm run dev` quanto
   * no `npm run start`, caso o arquivo exista.
   *
   * Esse arquivo NÃO deve ir para o Git.
   */
  const caminhoCredencial = path.join(
    process.cwd(),
    ".secrets",
    "firebase-admin.json",
  );

  if (fs.existsSync(caminhoCredencial)) {
    const conteudo = fs.readFileSync(
      caminhoCredencial,
      "utf8",
    );

    const credencial = JSON.parse(conteudo);

    return initializeApp({
      credential: cert(credencial),
    });
  }

  /*
   * DEPLOY
   *
   * Quando o arquivo local não existir, utiliza as
   * credenciais configuradas no ambiente do servidor.
   */
  return initializeApp({
    credential: applicationDefault(),
  });
}

export function firebaseAdmin() {
  const app = getAdminApp();

  return {
    auth: getAuth(app),
    db: getFirestore(app),
  };
}
