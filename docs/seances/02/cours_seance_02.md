---
marp: true
theme: methodo-algo
title: "Séance 2 — Instructions conditionnelles"
paginate: true
header: "Méthodo Algo — Séance 2 [Sylvain Huraux - HE2B - ISIB](mailto:shuraux@he2b.be)"
footer: "[← Retour à l'accueil](../../index.html)"
---

## Séance 2

Instructions conditionnelles

[→ Quiz](quiz_seance_02.html)
[→ Exercices](exercices_seance_02.html)

---

## Pourquoi des décisions ?

En séance 1 : **un seul chemin**, de haut en bas.

Souvent, le traitement **change** selon une situation :

- note suffisante ou non ?
- âge donnant droit à une réduction ?
- température trop haute, trop basse, ou acceptable ?

Il faut une **décision** (*decision*) : une question **oui / non**, puis **deux chemins** possibles.

---

## Le losange (*decision*)

Nouveau symbole : le **losange**.

```mermaid
flowchart LR
  D{condition?}
```

- À l'intérieur : une **condition** (vrai ou faux)
- Deux sorties : **Yes** et **No**
- Une seule sortie est suivie à chaque exécution

Le reste des symboles ne change pas : ovale, parallélogramme, rectangle.

---

## Exemple : Pass / Fail

<div class="two-cols">

<div>

Lire `mark`.  
`mark >= 10` → `"Pass"`, sinon `"Fail"`.

Deux chemins, **un seul** suivi.

</div>

<div class="max-mermaid-lg">

```mermaid
flowchart TB
  A([START]) --> B[/INPUT mark/]
  B --> C{mark >= 10}
  C -->|Yes| D[/OUTPUT "Pass"/]
  C -->|No| E[/OUTPUT "Fail"/]
  D --> F([END])
  E --> F
```

</div>

</div>

---

## `IF … THEN … ELSE … END IF`

Même idée en *pseudocode* :

<div class="two-cols">

<div>

```text
INPUT mark
IF mark >= 10 THEN
  OUTPUT "Pass"
ELSE
  OUTPUT "Fail"
END IF
```

</div>

<div>

| Mot-clé | Rôle |
| --- | --- |
| `IF` | condition |
| `THEN` | branche **Yes** |
| `ELSE` | branche **No** |
| `END IF` | fin |

*Flowchart* et *pseudocode* = **même** algo.

</div>

</div>

---

## Opérateurs de comparaison

Condition → `TRUE` / `FALSE` (`BOOLEAN`).

<div class="two-cols">

<div>

| Op. | Sens |
| --- | --- |
| `=` | égal *(≠ affectation)* |
| `<>` | différent |
| `<` / `<=` | inférieur / ≤ |
| `>` / `>=` | supérieur / ≥ |

</div>

<div>

Ex. : `mark >= 10`, `age < 12`, `x = 0`.

**Attention :** `=` range (affectation) **ou** compare (condition).

</div>

</div>

---

## `IF` sans `ELSE`

Parfois on ne fait quelque chose **que** si la condition est vraie.

```text
INPUT temperature
IF temperature > 30 THEN
  OUTPUT "Hot"
END IF
OUTPUT "Done"
```

- Branche **Yes** : affiche `"Hot"`, puis continue
- Branche **No** : saute le bloc, continue vers `"Done"`

En *flowchart* : la flèche **No** contourne le traitement et rejoint la suite.

---

## Plusieurs cas : `ELSE IF`

Quand il y a **plus de deux** possibilités, on enchaîne (*cascade*) :

```text
INPUT mark
IF mark >= 16 THEN
  grade = "A"
ELSE IF mark >= 14 THEN
  grade = "B"
ELSE IF mark >= 10 THEN
  grade = "C"
ELSE
  grade = "F"
END IF
OUTPUT grade
```

On teste **dans l'ordre** ; dès qu'une condition est vraie, on prend cette branche et on **ignore** le reste.

---

## Cascade en *flowchart*

```mermaid
flowchart LR
  A([START]) --> B[/INPUT mark/]
  B --> C{mark >= 16}
  C -->|Yes| D["grade = \"A\""]
  C -->|No| E{mark >= 14}
  E -->|Yes| F["grade = \"B\""]
  E -->|No| G{mark >= 10}
  G -->|Yes| H["grade = \"C\""]
  G -->|No| I["grade = \"F\""]
  D --> J[/OUTPUT grade/]
  F --> J
  H --> J
  I --> J
  J --> K([END])
```

Ordre des seuils : du plus exigeant au plus bas (sinon un cas « avale » les autres).

---

## Conditions composées : `AND` / `OR` / `NOT`

On combine des conditions avec des opérateurs logiques :

| Opérateur | Sens | Exemple |
| --- | --- | --- |
| `AND` | les **deux** sont vraies | `(x > 0) AND (x < 10)` |
| `OR` | **au moins une** est vraie | `(age < 12) OR (age >= 65)` |
| `NOT` | inverse vrai ↔ faux | `NOT (mark >= 10)` |

Résultat toujours `TRUE` ou `FALSE`.

---

## Tables de vérité (*truth tables*)

<div class="two-cols">

<div>

Pour `AND` :

| A | B | A AND B |
| --- | --- | --- |
| `FALSE` | `FALSE` | `FALSE` |
| `FALSE` | `TRUE` | `FALSE` |
| `TRUE` | `FALSE` | `FALSE` |
| `TRUE` | `TRUE` | `TRUE` |

</div>

<div>

Pour `OR` :

| A | B | A OR B |
| --- | --- | --- |
| `FALSE` | `FALSE` | `FALSE` |
| `FALSE` | `TRUE` | `TRUE` |
| `TRUE` | `FALSE` | `TRUE` |
| `TRUE` | `TRUE` | `TRUE` |

</div>

</div>

`NOT` : `NOT TRUE` → `FALSE` ; `NOT FALSE` → `TRUE`.

---

## Exemple : `AND` dans un `IF`

« Est-ce que `x` est strictement entre 0 et 10 ? »

<div class="two-cols">

<div>

```text
INPUT x
IF (x > 0) AND (x < 10) THEN
  OUTPUT "Inside"
ELSE
  OUTPUT "Outside"
END IF
```

</div>

<div class="max-mermaid">

```mermaid
flowchart TB
  A([START]) --> B[/INPUT x/]
  B --> C{"(x > 0) AND (x < 10)"}
  C -->|Yes| D[/OUTPUT "Inside"/]
  C -->|No| E[/OUTPUT "Outside"/]
  D --> F([END])
  E --> F
```

</div>

</div>

---

## Conditions imbriquées (*nested*)

Un `IF` **à l'intérieur** d'un autre `IF` :

```text
INPUT age, hasTicket
IF hasTicket = TRUE THEN
  IF age >= 18 THEN
    OUTPUT "Adult entry"
  ELSE
    OUTPUT "Child entry"
  END IF
ELSE
  OUTPUT "No ticket"
END IF
```

Utile quand la **deuxième** question n'a de sens que si la première est vraie.

---

## Cascade vs imbrication

| Style | Idée |
| --- | --- |
| Cascade (`ELSE IF`) | plusieurs cas **mutuellement exclusifs** sur la même donnée (notes A/B/C/F) |
| Imbrication (*nested*) | une décision **dépend** d'une autre (billet, puis âge) |

Les deux sont corrects ; on choisit selon la structure du problème.

Piège fréquent : une branche **inaccessible** (condition déjà couverte plus haut, ou ordre des tests incorrect).

---

<!-- _class: compact -->

## *Test cases* et *edge cases*

Pour valider un algorithme à décisions :

- ***Test case*** : un jeu de données d'entrée + le résultat **attendu**
- ***Edge case*** (*cas limite*) : valeur juste au seuil, vide, extrême…

Exemple pour `mark >= 10` → Pass / Fail :

| *Test case* | Entrée | Attendu |
| --- | --- | --- |
| typique Yes | `mark = 14` | `"Pass"` |
| typique No | `mark = 7` | `"Fail"` |
| *edge* | `mark = 10` | `"Pass"` (seuil inclus) |
| *edge* | `mark = 9` | `"Fail"` (juste en dessous) |

Sans *edge cases*, on rate souvent une erreur de `<` vs `<=`.

---

## Exemple : réduction d'âge

Réduction si `age < 12` **ou** `age >= 65`.

```text
INPUT age
IF (age < 12) OR (age >= 65) THEN
  OUTPUT "Discount"
ELSE
  OUTPUT "Full price"
END IF
```

*Edge cases* utiles : `age = 12`, `age = 65`, `age = 11`, `age = 64`.

---

## À retenir

- Losange = question **Yes / No**
- `IF` / `ELSE` / `ELSE IF` / `END IF`
- Comparaisons ; `AND` / `OR` / `NOT` ; *truth tables*
- Cascade vs imbrication
- Toujours prévoir des ***test cases***, dont des ***edge cases***

---

## Quiz

10 questions pour tester sa compréhension du contenu de la séance.

[→ Quiz](quiz_seance_02.html)

---

## Exercice 2.A — Pass / Fail

```text
INPUT mark
IF mark >= 10 THEN
  message = "Pass"
ELSE
  message = "Fail"
END IF
OUTPUT message
```

1. Compléter la *trace table* pour `mark = 12`.
2. Dessiner le *flowchart*.

→ [Exercices](exercices_seance_02.html) § 2.A

---

## Exercice 2.B — Positif ou non

```text
INPUT x
IF x > 0 THEN
  label = "Positive"
ELSE
  label = "Not positive"
END IF
OUTPUT label
```

1. Compléter la *trace table* pour `x = -3`.
2. Dessiner le *flowchart*.

→ [Exercices](exercices_seance_02.html) § 2.B

---

## Exercice 2.C — Intervalle avec `AND`

```text
INPUT x
IF (x > 0) AND (x < 10) THEN
  message = "Inside"
ELSE
  message = "Outside"
END IF
OUTPUT message
```

1. Compléter la *trace table* pour `x = 5`.
2. Dessiner le *flowchart*.

→ [Exercices](exercices_seance_02.html) § 2.C

---

## Exercice 2.D — Réduction d'âge

```text
INPUT age
IF (age < 12) OR (age >= 65) THEN
  price = "Discount"
ELSE
  price = "Full"
END IF
OUTPUT price
```

1. Compléter la *trace table* pour `age = 65`.
2. Dessiner le *flowchart*.

→ [Exercices](exercices_seance_02.html) § 2.D

---

## Exercice 2.E — Mentions (cascade)

```text
INPUT mark
IF mark >= 16 THEN
  grade = "A"
ELSE IF mark >= 14 THEN
  grade = "B"
ELSE IF mark >= 10 THEN
  grade = "C"
ELSE
  grade = "F"
END IF
OUTPUT grade
```

1. Compléter la *trace table* pour `mark = 14`.
2. Dessiner le *flowchart*.

→ [Exercices](exercices_seance_02.html) § 2.E
