// Toujours la dernière version publiée. GitHub Pages autorise le navigateur à
// garder chaque fichier 10 minutes : juste après une mise à jour, la page pouvait
// mélanger un HTML neuf et un JavaScript ancien (un bouton présent qui ne fait
// rien). Ici chaque fichier du site est revalidé auprès du serveur : réponse
// « inchangé » quasi instantanée s'il n'a pas bougé, sinon la nouvelle version.
// Rien n'est mis en cache par ce script, et aucune image ne transite : il ne
// voit que les fichiers de l'application.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.mode === 'navigate') return;   // la page elle-même est déjà revalidée
  if (new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(fetch(req, { cache: 'no-cache' }));
});
