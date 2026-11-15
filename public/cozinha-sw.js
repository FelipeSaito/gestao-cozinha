/* Somente o aviso público sem conexão é armazenado por este worker.
   Nenhuma página autenticada, API, resposta do Firebase ou gravação é guardada. */
const CACHE = "cozinha-offline-v1";
const OFFLINE = "/pwa/offline.html";

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.add(new Request(OFFLINE, { cache: "reload" }))));
  // Atualizações aguardam o fechamento das janelas antigas para não interromper contagens.
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes.filter(nome => nome.startsWith("cozinha-offline-") && nome !== CACHE).map(nome => caches.delete(nome)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", event => {
  const pedido = event.request;
  const url = new URL(pedido.url);
  if (pedido.method !== "GET" || pedido.mode !== "navigate" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  event.respondWith((async () => {
    try {
      // Respostas de erro do servidor continuam visíveis; só falha de rede usa o aviso.
      return await fetch(pedido);
    } catch {
      return await caches.match(OFFLINE) || new Response("Sem conexão. Reconecte o dispositivo e tente novamente.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
  })());
});
