# Methodologie algorithmique

Dépôt du cours **Methodologie algorithmique** (amphithéâtre, grand groupe) à l'ISIB - HE2B.

- **Durée totale** : 10 h 30
- **Organisation** : 7 séances de 1 h 30
- **Format** : cours magistral en amphithéâtre (pas de laboratoire / TP machine)

## Accès rapide aux contenus

- Landing page GitHub Pages : [https://isibrussels.github.io/methodo-algo/](https://isibrussels.github.io/methodo-algo/)  
  *(dépôt : [`ISIBrussels/methodo-algo`](https://github.com/ISIBrussels/methodo-algo))*
- Slides de cours et quiz : liens ci-dessous

## Plan des séances

| Séance | Durée | Thème |
| :---: | :---: | --- |
| 1 | 1 h 30 | Problème, algorithme, programme — la démarche |
| 2 | 1 h 30 | Spécification et représentation (pseudo-code, invariants) |
| 3 | 1 h 30 | Structures de contrôle et décomposition |
| 4 | 1 h 30 | Structures de données et choix méthodologiques |
| 5 | 1 h 30 | Complexité : temps, espace, notation O |
| 6 | 1 h 30 | Stratégies algorithmiques |
| 7 | 1 h 30 | Synthèse, études de cas, bonnes pratiques |

## Séances

- **Séance 1 — Problème, algorithme, programme** : [Cours](docs/seances/01/cours_seance_01.md) · [Quiz](docs/seances/01/quiz_seance_01.html) · [Questions amphi](docs/seances/01/questions_seance_01.md)
- **Séance 2 — Spécification et représentation** : [Cours](docs/seances/02/cours_seance_02.md) · [Quiz](docs/seances/02/quiz_seance_02.html) · [Questions amphi](docs/seances/02/questions_seance_02.md)
- **Séance 3 — Structures de contrôle et décomposition** : [Cours](docs/seances/03/cours_seance_03.md) · [Quiz](docs/seances/03/quiz_seance_03.html) · [Questions amphi](docs/seances/03/questions_seance_03.md)
- **Séance 4 — Structures de données** : [Cours](docs/seances/04/cours_seance_04.md) · [Quiz](docs/seances/04/quiz_seance_04.html) · [Questions amphi](docs/seances/04/questions_seance_04.md)
- **Séance 5 — Complexité** : [Cours](docs/seances/05/cours_seance_05.md) · [Quiz](docs/seances/05/quiz_seance_05.html) · [Questions amphi](docs/seances/05/questions_seance_05.md)
- **Séance 6 — Stratégies algorithmiques** : [Cours](docs/seances/06/cours_seance_06.md) · [Quiz](docs/seances/06/quiz_seance_06.html) · [Questions amphi](docs/seances/06/questions_seance_06.md)
- **Séance 7 — Synthèse et études de cas** : [Cours](docs/seances/07/cours_seance_07.md) · [Quiz](docs/seances/07/quiz_seance_07.html) · [Questions amphi](docs/seances/07/questions_seance_07.md)

## Structure du dépôt

Alignée sur les dépôts `tech-info-1` et `labo-tech-info-*` :

- `docs/index.md` — page d'accueil du site GitHub Pages
- `docs/seances/NN/` — contenu de chaque séance (`cours_seance_NN.md` Marp, quiz HTML, questions amphi)
- `docs/themes/` — thème Marp
- `.github/workflows/deploy.yml` — build Marp + déploiement Pages
- `private-notes/` — notes personnelles (ignorées par git)
