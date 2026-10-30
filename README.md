# Depix

Convertit du **faux pixel art généré par IA** en **vrai pixel art** : une case = un pixel d'une seule couleur, sur une grille régulière, avec une palette limitée, sans flou ni dégradé parasite.

👉 **En ligne : https://piascwal.github.io/pix-pixelart/**

Tout se passe dans le navigateur : aucune image n'est envoyée à un serveur. Fonctionne sur téléphone et sur ordinateur.

## Utilisation

1. **Importer** une image PNG, JPG ou WebP : glisser-déposer, bouton « Choisir une image », ou coller (Ctrl+V). Le bouton « Autre image » (icône dossier) de la barre d'outils permet d'en charger une autre ensuite.
2. **Rogner** (outil ciseaux) si besoin : une zone apparaît déjà, celle du sprite (cadre blanc en pointillés), avec huit **poignées** (quatre coins, milieu des quatre bords) ; seules les poignées la changent, **partout ailleurs glisser déplace l'image** (la main), et on zoome là où l'on pointe (molette, pincement) autant qu'on veut. La zone se cale sur les cases de la grille (le texte donne sa taille en cases), et la grille de l'original est gardée après le rognage : plus de case coupée en deux ni de deux couleurs par case. Validez avec « Rogner ici » (Entrée) ; Échap ou « Annuler » abandonne. La grille, le fond et la palette sont ré-analysés sur cette zone seule. « Image entière » restaure l'original. À la souris, la barre d'espace ou le clic du milieu déplace aussi la vue, avec n'importe quel outil.
3. **Vérifier la grille** : Depix détecte la taille d'une case et le décalage de la grille, puis les superpose à l'original (lignes cyan). Si elles ne tombent pas sur les bords des « gros pixels », corrigez avec les curseurs *Taille d'une case* (jusqu'à 64 px au curseur, 256 dans le champ numérique), *Décalage horizontal* et *Décalage vertical*.
   **Photo ou image normale** (sans gros pixels à retrouver) : dans « Grille », choisissez « Choisir la taille » puis 16, 32, 64, 128, 256 ou une valeur libre. Le côté le plus long de l'image fera autant de pixels (une photo 4:3 en 64 donne 64 × 48) ; chaque pixel prend la couleur de son bloc de l'image. Le fond n'est alors retiré que si vous cochez « Retirer le fond ». Revenir à « Détecter la grille » redonne exactement le comportement habituel.
4. **Régler** le nombre de couleurs (48 à 56 conviennent souvent), la tolérance du fond, et le nettoyage des pixels isolés.
5. **Gérer la palette** : touchez une couleur du nuancier pour voir son code hexa (bouton *Copier*), puis *Ne pas utiliser* (tous ses pixels deviennent transparents, comme une gomme), *Remplacer par…* (puis touchez la couleur de remplacement) ou *Dessiner avec*. Les couleurs écartées sont barrées, les remplacées portent une pastille de leur remplaçante. Changer le nombre de couleurs réinitialise ces choix.
   **Gomme ciblée** : pour un contour dont la couleur sert aussi au personnage, plutôt que de la supprimer partout, choisissez-la avec le pointeur puis *Gomme ciblée* : la gomme n'efface alors que les cases de cette couleur sous le pinceau (taille 1, 2 ou 3 cases, pastille de la couleur sur l'icône de la gomme) ; choisir un autre outil la désactive.
6. **Comparer** avant / après côte à côte : les deux vues partagent le même zoom. *Cadrer* centre le sprite (les poussières isolées ne comptent pas), *Tout* montre l'image entière.
7. **Retoucher** si besoin : crayon, gomme, pipette, annuler / rétablir (Ctrl+Z / Ctrl+Y). Le **pointeur** donne la fiche d'une case : toucher une case (de l'image ou de l'original) affiche son code hexa et propose de la *supprimer* (elle devient transparente) ou de la *remplacer* par une couleur déjà présente dans l'image, soit sur cette case seule, soit sur **toute l'image** (toutes les cases qui ont exactement cette couleur, en un seul « annuler ») ; pour une couleur entière, passer par le nuancier.
8. **Lot d'images** : choisir ou glisser plusieurs images d'un coup (jusqu'à 60) ouvre la première et affiche la liste du lot ; cliquer une image l'ouvre pour la régler et la retoucher. Les retouches de chaque image (crayon, gomme, pointeur) et ses choix de palette sont gardés quand on passe à une autre image du lot, et retrouvés à l'export ; si les réglages communs (couleurs, tolérance, nettoyage, grille fixée, taille choisie) changent après coup, ces retouches ne tombent plus sur les bonnes cases : l'image est alors exportée sans (le message de fin d'export le dit). Le bouton × d'une image la retire du lot (s'il n'en reste qu'une, ce n'est plus un lot). Les boutons de la carte **Exporter** (Natif, ×2, ×4, ×8, ou la toile carrée choisie) exportent alors tout le lot en ZIP au lieu d'un PNG : chaque image est convertie avec les réglages courants (taille de sortie, couleurs, tolérance, nettoyage, fond, règles de palette), la grille et le fond étant détectés image par image, sauf si vous réglez la grille à la main (taille d'une case, décalages) : ce réglage vaut alors pour tout le lot, à l'affichage comme à l'export, jusqu'à « Revenir à la détection auto » ; le mode « Choisir la taille » vaut toujours pour tout le lot ; l'image ouverte est exportée avec ses retouches, les autres sans. Le ZIP (`depix-lot.zip`, un PNG par image) est fabriqué dans le navigateur (`src/core/zip.js`, sans compression) ; le traitement passe par le worker (`src/core/batch.js`).
9. **Exporter** en PNG natif ou agrandi ×2 / ×4 / ×8 (plus proche voisin), fond transparent ou magenta #ff00ff, ou sur une **toile carrée** 16 à 2048 (dont 1024) : les marges vides sont rognées et le personnage est agrandi au maximum, par un facteur entier pour garder des pixels nets, sans être coupé (un sprite de 94 × 121 sort en 1024 × 1024 à ×8) ; et la **palette** : copier les codes hexa (un par ligne) ou télécharger un fichier `.hex` (un code par ligne, sans `#`).

Sur téléphone, quand on règle un curseur plus bas dans la page et que le résultat sort de l'écran, une bande en haut montre l'**aperçu en direct** ; la toucher ramène à l'image.

Un appui long (téléphone) ou un survol (souris) sur une icône en affiche le nom. Sur téléphone, les sections de réglages (Grille, Palette, Fond, Nettoyage) sont repliées au départ, et un **appui long sur l'image** (sans bouger) ouvre le menu des outils sous le doigt (main, pointeur, crayon, gomme, pipette, rogner, aucun, annuler, rétablir), pour ne pas remonter la page jusqu'à la barre ; si un trait de crayon ou de gomme était en cours, il est annulé.

**Gestes** : aucun outil n'est sélectionné au départ, et la page défile alors comme d'habitude (un doigt suffit sur l'image). Un outil se sélectionne en le touchant, et se désélectionne en le touchant à nouveau.
- À la souris : glisser déplace, la molette zoome (Ctrl + molette si la page défile).
- Au doigt, avec un outil actif : **un doigt agit sur l'image** (main : déplacer ; crayon, gomme, pipette : dessiner ; ciseaux : tracer le rognage), **deux doigts** pincent pour zoomer et, en glissant, font défiler la page.

Raccourcis : `M` déplacer, `B` crayon, `E` gomme, `I` pipette, `C` rogner, `+` / `-` zoom, `0` cadrer le résultat.

> Changer un réglage relance la conversion et efface les retouches : réglez d'abord, retouchez ensuite.

## Animation

Bouton **Animer** (barre d'outils, une fois l'image convertie) : un mode à part, qui travaille sur une copie du résultat retouché ; « Retour » ramène à la conversion, intacte, et le découpage est gardé si on revient. Pensez à effacer ce qui ne doit pas bouger avec le personnage (la balle, par exemple) avant d'entrer.

**La vue** ne touche jamais au personnage : molette ou pincement zooment à l'endroit visé ; la main (barre d'outils), la barre d'espace maintenue, le clic du milieu ou deux doigts déplacent la vue ; « Cadrer » remet tout le personnage à l'écran.

1. **Découper** : le bouton **Squelette** crée d'un coup les pièces d'un personnage debout (bras, avant-bras, mains, cuisses, jambes, pieds, tête) avec leurs articulations posées d'après la silhouette (épaule, coude, poignet, hanche, genou, cheville, cou) : le vide entre les pieds, remonté ligne par ligne, donne l'entrejambe et les hanches, le centre de chaque jambe donne genoux et chevilles, un bras détaché du torse donne coude et poignet ; le cou et les épaules restent aux proportions moyennes (un chapeau, une capuche ou une barbe trompent toute lecture à cette hauteur). Chaque point est une **articulation**, pas le membre : la jambe tourne autour du genou, la cuisse de la hanche, le bras de l'épaule ; le point choisi affiche son nom (« Genou gauche », « Épaule droite », « Cou »). Avec l'outil **pivot**, glisser un point le déplace (aussi possible en Poser). **Découpe auto** attribue ensuite les pixels non peints (`src/core/geoskin.js`) : chaque membre grandit pixel par pixel depuis son os, à l'intérieur du dessin seulement, et le premier arrivé prend le pixel ; traverser un trait sombre coûte cher, donc les frontières suivent les contours dessinés, et le vide de l'entrejambe sépare les deux jambes. Le torse (l'intérieur des épaules, des hanches et du cou) reste au corps, un membre ne revient jamais en arrière de son articulation, et les contours sombres collés à un membre lui sont rattachés (sinon ils restent sur place quand il tourne : un coude en double). Les pixels peints à la main ne bougent pas ; on peut la relancer après avoir déplacé un point. Le **corps** est la zone par défaut : on ne le peint pas. À la main : « Ajouter une pièce », puis peindre ses pixels au pinceau (taille 1 à 3) ; la gomme les rend au corps. L'outil **pivot** place l'articulation (épaule, coude, hanche, genou…) : la pièce se rattache toute seule à celle qu'elle touche à cet endroit (l'avant-bras au bras), modifiable dans la liste. La liste règle aussi l'ordre devant / derrière.
   **Compléter** (baguette) : quelques traits par pièce suffisent. Chaque pièce s'étend aux pixels reliés du corps en s'arrêtant aux pivots : jamais en deçà du sien, jamais au-delà de celui de sa pièce enfant (le coude coupe bras et avant-bras), et là où le membre débouche sur le torse même si le pivot d'épaule est placé dans le torse. Seuls les pixels du corps changent, tout s'annule d'un coup, et un pinceau permet de corriger.
2. **Poser** (la marche utilise vos pièces telles quelles : noms, contacts entre pièces, pivots ; les pivots absents et les parents manquants sont déduits des zones de contact) : attraper un membre et glisser le fait tourner autour de son pivot, et ses enfants suivent ; un **maintien long** (sans bouger) sur un membre, puis glisser, le déplace en X / Y ; relâcher revient à la rotation. Glisser sur le corps ou dans le vide déplace la vue. **Îlots** (étapes Poser et Retoucher) supprime les petits groupes de pixels isolés de l'image, ou de toutes les images. **Compléter** (barre d'outils de l'étape Poser) bouche les vides ouverts autour des articulations des membres déplacés, avec les couleurs voisines, sur l'image courante (annulable ; ajouté aux retouches de l'image).
   **Marche** : « Générer la marche » remplace les images par un cycle de 8 poses, à retoucher ensuite comme n'importe quelle pose. Les membres sont reconnus par leur géométrie et la hiérarchie (jambe : pièce rattachée au corps dans la moitié basse ; bras : pièce allongée dans la moitié haute ; une pièce ronde seule, la tête, est ignorée), le côté par la position du pivot, et le bras est ramené « pendu le long du corps » d'après sa direction réelle (bras écarté en T ou déjà baissé). *De face* : un pied se lève à tour de rôle, le corps descend aux appuis, les bras balancent un peu. *Vers la droite / gauche* (profil) : cuisses, genoux, bras et avant-bras, chaque bras à l'opposé de la jambe du même côté.
   **Variantes** : chaque animation a plusieurs variantes, montrées en aperçu animé sur le personnage découpé avant de choisir (un toucher génère la variante) : repos (respire, se balance), marche (marche, course, glisse de patineur, dandine), attaque (frappe, charge, lancer), touché (recul, secousse).
   **Animations** : quatre animations par personnage, choisies en haut de la carte : *Repos* (il respire), *Marche* (8 images), *Attaque* (il arme puis frappe vers l'avant), *Touché* (il recule sous le coup). Chacune garde ses propres images ; « Générer » remplace celles de l'animation choisie par des poses prêtes à retoucher (`src/core/actions.js`), dans la direction du regard choisie. La pose dessinée sert de repos : un bras replié sur un ballon le reste, et balance moins qu'un bras pendant.
   **Finition auto** (cochée par défaut) : sur toutes les images, retire les pixels seuls et les petits îlots, et bouche les petits trous enfermés dans le personnage (`src/core/polish.js`) ; les retouches à la main passent après et restent telles quelles.
3. **Retoucher** : crayon, gomme et pipette sur l'image courante, sans toucher aux autres.

**Projet** : « Enregistrer » télécharge un fichier JSON avec le sprite, son découpage (pièces, pivots, ordre) et toutes les animations (poses et retouches) ; « Ouvrir » (dans le mode Animation, ou « Ouvrir un projet d'animation » à l'accueil) reprend le travail là où il en était (`src/core/project.js`).

**Images** : « + » ajoute une image (copie de la pose courante), lecture en boucle, images par seconde réglables. **Intercaler** : choisit un nombre d'images (1 à 12) et les calcule entre l'image courante et la suivante (la dernière boucle vers la première) en répartissant régulièrement les angles et décalages ; annulable d'un coup. **Pelure d'oignon** (calques) : l'image précédente en bleu et la suivante en vert, en transparence, pour caler la pose.

**Pour le jeu** : une planche PNG avec une ligne par animation travaillée (repos, marche, attaque, touché), toutes les images sur la même boîte (les pieds ne sautent pas d'une animation à l'autre), et un JSON : `frameWidth`, `frameHeight`, `animations` (`name`, `row`, `frames`, `fps`) et `regard`.

**Export** : planche de sprites PNG (×1, ×4, ×8, fond transparent ou magenta selon le réglage), JSON (taille des images, nombre, durées) et **GIF animé** ×4 ou ×8 (boucle infinie, transparence, toutes les images recadrées sur la même boîte ; encodeur maison dans `src/core/gif.js`, vérifié par un décodeur indépendant).

Ce que l'automatique fait : rotation façon RotSprite (`src/core/rotsprite.js` : Scale2x ×3, rotation, rééchantillonnage ; pixels nets, aucune couleur nouvelle), disque de couleur sous les articulations qui bougent (à la taille du membre), et le corps rebouche ce qu'une pièce cachait quand c'est encadré par le corps (`src/core/rig.js`). Ce qu'il ne fait pas : inventer ce qui n'existe pas dans le sprite (dos, profil, main qui se ferme) ; les grandes rotations et les marches de profil à partir d'un personnage de face demandent des retouches.

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
| Toile carrée | `src/core/upscale.js` | `padToCanvas` : centre l'image sur une toile N × N ; `fitToCanvas` : rogne, agrandit au plus grand facteur entier qui tient, centre. |
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
              menuOutils.js  menu des outils ouvert par un appui long sur l'image
              anim/        mode Animation : état (animStore), canevas et caméra (animView),
                           panneau, images, export (animPanel), entrée / sortie (animMode)
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

`sw.js` est un petit service worker qui revalide chaque fichier de l'application auprès du serveur : sans lui, juste après une mise en ligne, le navigateur pouvait garder jusqu'à 10 minutes l'ancien JavaScript avec la nouvelle page (un bouton visible qui ne fait rien). Il ne met rien en cache et ne voit aucune image.
