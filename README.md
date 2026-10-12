# Depix

Convertit du **faux pixel art généré par IA** en **vrai pixel art** : une case = un pixel d'une seule couleur, sur une grille régulière, avec une palette limitée, sans flou ni dégradé parasite.

👉 **En ligne : https://piascwal.github.io/pix-pixelart/**

Tout se passe dans le navigateur : aucune image n'est envoyée à un serveur. Fonctionne sur téléphone et sur ordinateur.

## Utilisation

1. **Importer** une image PNG, JPG ou WebP : glisser-déposer, bouton « Choisir une image », ou coller (Ctrl+V). Le bouton « Autre image » (icône dossier) de la barre d'outils permet d'en charger une autre ensuite.
2. **Rogner** (outil ciseaux) si besoin : tracez un rectangle sur l'original, puis « Rogner ici » (Entrée). La grille, le fond et la palette sont ré-analysés sur cette zone seule. « Image entière » restaure l'original.
3. **Vérifier la grille** : Depix détecte la taille d'une case et le décalage de la grille, puis les superpose à l'original (lignes cyan). Si elles ne tombent pas sur les bords des « gros pixels », corrigez avec les curseurs *Taille d'une case* (jusqu'à 64 px au curseur, 256 dans le champ numérique), *Décalage horizontal* et *Décalage vertical*.
   **Photo ou image normale** (sans gros pixels à retrouver) : dans « Grille », choisissez « Choisir la taille » puis 16, 32, 64, 128, 256 ou une valeur libre. Le côté le plus long de l'image fera autant de pixels (une photo 4:3 en 64 donne 64 × 48) ; chaque pixel prend la couleur de son bloc de l'image. Le fond n'est alors retiré que si vous cochez « Retirer le fond ». Revenir à « Détecter la grille » redonne exactement le comportement habituel.
4. **Régler** le nombre de couleurs (48 à 56 conviennent souvent), la tolérance du fond, et le nettoyage des pixels isolés.
5. **Gérer la palette** : touchez une couleur du nuancier pour voir son code hexa (bouton *Copier*), puis *Ne pas utiliser* (ses pixels prennent la couleur restante la plus proche), *Remplacer par…* (puis touchez la couleur de remplacement) ou *Dessiner avec*. Les couleurs écartées sont barrées, les remplacées portent une pastille de leur remplaçante. Changer le nombre de couleurs réinitialise ces choix.
6. **Comparer** avant / après côte à côte : les deux vues partagent le même zoom. *Cadrer* centre le sprite (les poussières isolées ne comptent pas), *Tout* montre l'image entière.
7. **Retoucher** si besoin : crayon, gomme, pipette, annuler / rétablir (Ctrl+Z / Ctrl+Y). Le **pointeur** donne la fiche d'une case : toucher une case (de l'image ou de l'original) affiche son code hexa et propose de la *supprimer* (elle devient transparente) ou de la *remplacer* par une couleur déjà présente dans l'image, sur cette case seule ; pour une couleur entière, passer par le nuancier.
8. **Exporter** : trois choses indépendantes, dans cet ordre.
   - **Le pixel art lui-même** : sa taille vient des réglages de la grille (détectée, ou choisie pour une photo). « Natif » en est le fichier exact, 1 case = 1 pixel.
   - **Une toile carrée** (facultatif) : 16, 32, 64, 128, 256 ou 512. Elle ajoute seulement des marges transparentes autour du pixel art, sans le modifier ; un sprite de 92 × 120 sort ainsi en 128 × 128.
   - **L'agrandissement** : ×2, ×4, ×8 transforment chaque pixel en carré (plus proche voisin, sans flou) pour partager ou afficher l'image ; ça ne change pas le dessin. Chaque bouton affiche la taille exacte du fichier téléchargé (par exemple 128 × 128, 256 × 256, 512 × 512, 1024 × 1024 avec une toile de 128).
   Fond transparent ou magenta #ff00ff. La **palette** s'exporte aussi : copier les codes hexa (un par ligne) ou télécharger un fichier `.hex` (un code par ligne, sans `#`).

Sur téléphone, quand on règle un curseur plus bas dans la page et que le résultat sort de l'écran, une bande en haut montre l'**aperçu en direct** ; la toucher ramène à l'image.

Un appui long (téléphone) ou un survol (souris) sur une icône en affiche le nom. Sur téléphone, les sections de réglages (Grille, Palette, Fond, Nettoyage) sont repliées au départ.

**Gestes** : aucun outil n'est sélectionné au départ, et la page défile alors comme d'habitude (un doigt suffit sur l'image). Un outil se sélectionne en le touchant, et se désélectionne en le touchant à nouveau.
- À la souris : glisser déplace, la molette zoome (Ctrl + molette si la page défile).
- Au doigt, avec un outil actif : **un doigt agit sur l'image** (main : déplacer ; crayon, gomme, pipette : dessiner ; ciseaux : tracer le rognage), **deux doigts** pincent pour zoomer et, en glissant, font défiler la page.

Raccourcis : `M` déplacer, `B` crayon, `E` gomme, `I` pipette, `C` rogner, `+` / `-` zoom, `0` cadrer le résultat.

> Changer un réglage relance la conversion et efface les retouches : réglez d'abord, retouchez ensuite.

## Ce qui est garanti, et ce qui ne l'est pas

(Ce texte est aussi dans l'application, sur la page `cgu.html` « Conditions d'utilisation », liée en bas de la page.)

La sortie est **techniquement** du vrai pixel art, toujours. Sa **fidélité** au dessin d'origine, elle, n'est pas garantie :

- **grilles qui dérivent** : les cases n'ont pas la même taille d'un bout à l'autre de l'image ;
- **tailles de pixels mélangées** : yeux ou reflets en demi-pixels ;
- **tramage** volontaire pris pour du bruit et lissé par la médiane ;
- images **très floues ou très compressées**.

D'où les réglages manuels et le mini éditeur.

## Comment ça marche

| Étape | Module | Principe |
|---|---|---|
| Taille du pixel | `src/core/gridDetect.js` | Énergie des gradients par colonne et par ligne, autocorrélation de 3 à 20 px, plus petite période forte (les multiples ressortent aussi), puis affinage au peigne (périodes fractionnaires comme 5,5 px). |
| Taille choisie | `src/core/gridDetect.js` | `targetGrid` : le côté le plus long fait N cases, période source / N (fractionnaire si besoin) ; la suite de la chaîne est inchangée. |
| Toile carrée | `src/core/upscale.js` | `padToCanvas` : centre l'image sur une toile N × N, sans rééchantillonner. |
| Décalage | `src/core/gridDetect.js` | Décalages de 0 à P−1 par pas de 0,25 px ; on garde celui qui maximise les gradients sur les lignes de grille. |
| Couleur d'une case | `src/core/sampleCells.js` | Médiane par canal des pixels **intérieurs** (1 px de bord ignoré), jamais un seul pixel. |
| Fond | `src/core/background.js` | Couleur dominante du bord, mesurée (le « magenta » d'une IA n'est presque jamais #ff00ff). Pixel de fond si la somme des écarts RVB < 60 ; case vide si plus de la moitié de son intérieur est du fond. |
| Palette | `src/core/palette.js` | Median cut sans tramage, puis choix manuels par code hexa (`resolvePalette` : exclusions et remplacements). |
| Nettoyage | `src/core/cleanup.js` | Retire les pixels ayant moins de 2 voisins opaques et les îlots de moins de N pixels ; bouche les trous d'1 px entourés. |
| Export | `src/core/upscale.js` | Agrandissement au plus proche voisin, fond transparent ou magenta. |
| Cadrage | `src/core/frame.js` | Boîte englobante du sprite en ignorant les petits îlots isolés. |
| Chaîne | `src/core/pipeline.js` | `analyze` (grille + fond) puis `convert` ; `depix` fait les deux. |

## Architecture

JavaScript moderne en modules ES natifs, **sans étape de build ni dépendance** : GitHub Pages sert le dépôt tel quel.

```
index.html
css/          base.css, layout.css, components.css
src/core/     fonctions pures sur { width, height, data: Uint8ClampedArray RGBA }
              (compatible ImageData, jamais de DOM ni de canvas) → testables sous Node
src/worker/   depix.worker.js : le traitement lourd hors du fil principal
src/ui/       state.js     état central + abonnements
              app.js       branchement : worker, modules, barre d'outils
              importer.js  glisser-déposer, bouton, coller
              viewer.js    avant / après, zoom partagé, grille superposée, gestes
              controls.js  curseurs de réglage
              paletteView.js nuancier + fiche d'une couleur (hexa, exclure, remplacer)
              cropper.js   rognage de l'image de travail
              tooltips.js  noms des icônes (appui long / survol)
              clipboard.js copie et petit message « copié »
              editor.js    crayon, gomme, pipette, annuler / rétablir
              exporter.js  PNG natif et agrandi, palette en hexa
tests/        node --test, sans dépendance
tools/        make-fixture.py (outil de dev : génère l'image de test)
```

Prévu dans l'architecture, pas encore codé :

- **grilles qui dérivent** : la conversion ne voit que des listes de bords de cases (`gridLines`) ; un recalage ligne par ligne / colonne par colonne n'aura qu'à produire des bords irréguliers ;
- **traitement par lot** : le cœur est fait de fonctions pures, `depix()` s'appelle en boucle ;
- **planche de sprites** : découper le résultat par composantes connexes (voir `cleanup.js`).

## Icônes

Icônes [Lucide](https://lucide.dev) (licence ISC, texte dans `assets/LICENSE-lucide.txt`), regroupées dans `assets/icons.svg` et dessinées en SVG : pas d'emoji, donc le même rendu partout.

## Tests

```sh
npm test          # = node --test "tests/*.test.js"  (Node 18+)
```

Le test de bout en bout (`tests/reference.test.js`) vérifie sur l'image de référence que la période détectée vaut 6 ± 0,5 px et que la sortie fait environ 94 × 121 cases.

Node n'ayant pas de décodeur JPEG intégré, les tests lisent `tests/fixtures/padel-ia.png`, copie décodée sans perte de `padel-ia.jpg`. Pour remplacer l'image de référence : déposer le nouveau `padel-ia.jpg` puis lancer `python3 tools/make-fixture.py --png-only` (Pillow requis, outil de dev uniquement).

> L'image de référence actuelle est **synthétique** (générée par `tools/make-fixture.py`) en attendant l'image d'origine : même taille (1408 × 768), même fond (167, 0, 132), cases de 6 px, sprite de 94 × 121, flou et compression JPEG.

## Lancer en local

Les modules ES et le Web Worker exigent un serveur HTTP (pas de `file://`) :

```sh
npm start         # http-server sur http://localhost:8080
# ou : python3 -m http.server 8080
```

## Déploiement

GitHub Pages, branche `main`, dossier racine (`/`). Aucun build : chaque push sur `main` est en ligne en une minute environ. Le fichier `.nojekyll` évite tout traitement Jekyll.
