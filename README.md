# Lecture Fluide — Entraînement à la lecture avec quiz

essaye-le ici : https://t2smart-ai.github.io/entrainement_lecture_quiz/

Application web statique (HTML/CSS/JS vanilla, **aucune dépendance ni build**) pour
entraîner la lecture en français des adolescents (12–18 ans). L'élève lit un extrait
et répond à un quiz de compréhension.

## Fonctionnalités

- **120 extraits** répartis en 6 genres : Science-Fiction, Fantasy, Horreur, Dystopie, Aventure, Poésie/Fables.
- **Galerie** filtrable par genre et triable par titre, auteur ou niveau.
- **Vue Lecture** avec minuteur discret et temps de lecture cible.
- **Quiz de compréhension** (4 questions) à correction immédiate.
- **Progression** enregistrée dans le navigateur (localStorage) : points, badges par genre, barre globale.
- **Thème clair/sombre** et modale d'aide intégrée.

## Structure du dépôt

| Fichier | Rôle |
|---------|------|
| `index.html` | Structure de la page et des vues (galerie, lecture, quiz). |
| `style.css` | Mise en forme (thème clair/sombre, responsive). |
| `script.js` | Logique de l'application (chargement des données, quiz, progression). |
| `data.json` | Jeu de données complet (120 extraits + quiz). |
| `data.js` | Même donnée sous forme `window.APP_DATA` (repli pour ouverture en `file://`). |
| `images/` | Couvertures des extraits (`.jpg`). |

## Fonctionnement du chargement des données

`script.js` tente d'abord `fetch('data.json')` (mode HTTP / GitHub Pages). En cas
d'échec (ouverture directe du fichier `index.html` via `file://`), il utilise le
repli `window.APP_DATA` fourni par `data.js`. Les deux fichiers sont donc conservés.

## Utilisation en local

Ouvrez simplement `index.html` dans un navigateur (le mode `file://` utilise `data.js`).
Pour un comportement identique à la version en ligne, servez le dossier avec un petit
serveur statique, par exemple :

```bash
python -m http.server 8000
# puis ouvrez http://localhost:8000
```

## Déploiement (GitHub Pages)

Ce dépôt est conçu pour être servi directement par **GitHub Pages** (branche `main`,
dossier racine). Aucune étape de build n'est requise.

1. Pushez le contenu sur la branche `main`.
2. Dans **Settings → Pages** du dépôt, choisissez la source :
   - Branch : `main`
   - Folder : `/ (root)`
3. Le site est publié à l'adresse :
   `https://<utilisateur>.github.io/entrainement_lecture_quiz/`

Le fichier `.nojekyll` à la racine désactive le traitement Jekyll afin que tous les
fichiers (notamment `data.json`) soient servis tels quels.

## Licence

Projet à usage éducatif réalisé avec l'aide de l'intelligence artificielle (vibe coding). N'hésitez pas à le télécharger, l'utiliser et le modifier comme bon vous semble, et/ ou à y apporter vos contributions !
