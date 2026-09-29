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
   * DESENVOLVIMENTO LOCAL
   *
   * Procura a credencial dentro de:
   * .secrets/firebase-admin.json
   *
   * Esse arquivo NÃO deve ir para o Git.
   */
  if (process.env.NODE_ENV !== "production") {
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
  }

  /*
   * PRODUÇÃO
   *
   * No deploy não utilizaremos o arquivo
   * .secrets/firebase-admin.json.
   *
   * A credencial deverá vir do ambiente
   * seguro do servidor.
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