# Méthodologie algorithmique

Dépôt du cours **Méthodologie algorithmique** (amphithéâtre, grand groupe) à l'ISIB - HE2B.

- **Durée totale** : 10 h 30 (+ 1 h 30 optionnelle)
- **Organisation** : 7 séances de 1 h 30 + 1 séance optionnelle (review / mock exam)
- **Format** : cours magistral en amphithéâtre (pas de laboratoire / TP machine)
- **Support** : **flowcharts** avec passage progressif au **pseudocode** ; explications FR, code / mots-clés EN

## Accès rapide aux contenus

- Landing page GitHub Pages : [https://isibrussels.github.io/methodo-algo/](https://isibrussels.github.io/methodo-algo/)  
  *(dépôt : [`ISIBrussels/methodo-algo`](https://github.com/ISIBrussels/methodo-algo))*
- Slides de cours et quiz : liens ci-dessous

## Plan des séances

| Séance | Durée | Thème |
| :---: | :---: | --- |
| 1 | 1 h 30 | Algorithms & sequential processing |
| 2 | 1 h 30 | Conditional statements |
| 3 | 1 h 30 | Loops (1) : WHILE / REPEAT … UNTIL |
| 4 | 1 h 30 | Loops (2) : FOR & nested loops |
| 5 | 1 h 30 | Arrays |
| 6 | 1 h 30 | Functions & procedures |
| 7 | 1 h 30 | Searching, sorting & efficiency |
| 8 *(opt.)* | 1 h 30 | Review & mock exam |

## Séances

- **Séance 1 — Algorithms & sequential processing** : [Cours](docs/seances/01/cours_seance_01.md) · [Quiz](docs/seances/01/quiz_seance_01.html) · [Exercices](docs/seances/01/exercices_seance_01.md)
- **Séance 2 — Conditional statements** : [Cours](docs/seances/02/cours_seance_02.md) · [Quiz](docs/seances/02/quiz_seance_02.html) · [Exercices](docs/seances/02/exercices_seance_02.md)
- **Séance 3 — Loops (1) : WHILE / REPEAT … UNTIL** : [Cours](docs/seances/03/cours_seance_03.md) · [Quiz](docs/seances/03/quiz_seance_03.html) · [Exercices](docs/seances/03/exercices_seance_03.md)
- **Séance 4 — Loops (2) : FOR & nested loops** : [Cours](docs/seances/04/cours_seance_04.md) · [Quiz](docs/seances/04/quiz_seance_04.html) · [Exercices](docs/seances/04/exercices_seance_04.md)
- **Séance 5 — Arrays** : [Cours](docs/seances/05/cours_seance_05.md) · [Quiz](docs/seances/05/quiz_seance_05.html) · [Exercices](docs/seances/05/exercices_seance_05.md)
- **Séance 6 — Functions & procedures** : [Cours](docs/seances/06/cours_seance_06.md) · [Quiz](docs/seances/06/quiz_seance_06.html) · [Exercices](docs/seances/06/exercices_seance_06.md)
- **Séance 7 — Searching, sorting & efficiency** : [Cours](docs/seances/07/cours_seance_07.md) · [Quiz](docs/seances/07/quiz_seance_07.html) · [Exercices](docs/seances/07/exercices_seance_07.md)
- **Séance 8 *(optionnelle)* — Review & mock exam** : [Cours](docs/seances/08/cours_seance_08.md) · [Quiz](docs/seances/08/quiz_seance_08.html) · [Exercices](docs/seances/08/exercices_seance_08.md)

## Structure du dépôt

Alignée sur les dépôts `tech-info-1` et `labo-tech-info-*` :

- `docs/index.md` — page d'accueil du site GitHub Pages
- `docs/seances/NN/` — contenu de chaque séance (`cours_seance_NN.md` Marp, quiz HTML, exercices)
- `docs/themes/` — thème Marp
- `.github/workflows/deploy.yml` — build Marp + déploiement Pages
- `private-notes/` — notes personnelles (ignorées par git)
