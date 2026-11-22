# Séance 5 — Exercices

**Thème :** Tableaux (arrays)  
**Support :** *pseudocode* (parcours, accumulateurs, indices) + *trace table* (texte FR, *pseudocode* et *flowcharts* EN)

Dans les *flowcharts* : pas de littéraux numériques (les valeurs concrètes apparaissent **uniquement** dans la *trace table*).

<nav class="page-nav">
  <a href="../../index.html">Accueil</a>
  <a href="cours_seance_05.html">Slides</a>
  <a href="syllabus_seance_05.html">Syllabus</a>
  <a href="quiz_seance_05.html">Quiz</a>
</nav>

## 5.A : Parcours sélectif (indices pairs)

Tableau `temps[0..N-1]` de mesures (entiers). Afficher **uniquement** les valeurs d’indices **pairs** (`0`, `2`, `4`…), dans l’ordre.

**Données de trace :** `N = 5`, `temps = [18, 21, 19, 22, 20]`.

1. Quelles valeurs sont affichées, dans quel ordre ?
2. Écrire le *pseudocode* (`FOR` avec `STEP`, ou `FOR` + test sur `i`).
3. (Optionnel) Esquisse du *flowchart* (sans coller les littéraux de la trace).

<details class="corrige">
<summary>Corrigé</summary>

Indices pairs : `0`, `2`, `4` → affichage `18`, `19`, `20`.

```text
FOR i = 0 TO N - 1 STEP 2 DO
  OUTPUT temps[i]
END FOR
```

Variante sans `STEP` :

```text
FOR i = 0 TO N - 1 DO
  IF (i MOD 2) = 0 THEN
    OUTPUT temps[i]
  END IF
END FOR
```

```mermaid
flowchart TB
  A([START]) --> B["i = zero"]
  B --> C{i < N}
  C -->|Yes| D[/OUTPUT temps[i]/]
  D --> E["i = i + two"]
  E --> C
  C -->|No| F([END])
```

(`zero` = 0, `two` = 2 : valeurs seulement dans la *trace*.)

</details>

---

## 5.B : Somme des positifs seulement

Tableau `deltas[0..N-1]` (entiers, positifs ou négatifs). Calculer la somme des **seules** valeurs **strictement positives**. Afficher cette somme.

**Données de trace :** `N = 6`, `deltas = [3, -2, 5, 0, -1, 4]`.

1. Compléter une *trace table* (colonnes `i`, `deltas[i]`, test, `sum`).
2. Écrire le *pseudocode* (accumulateur + `IF` filtre).

<details class="corrige">
<summary>Corrigé</summary>

On ajoute `3`, `5` et `4`. Le `0` et les négatifs sont ignorés. **OUTPUT 12**.

| `i` | `deltas[i]` | `deltas[i] > 0` ? | `sum` |
| ---: | ---: | --- | ---: |
| (init) | | | 0 |
| 0 | 3 | Yes | 3 |
| 1 | -2 | No | 3 |
| 2 | 5 | Yes | 8 |
| 3 | 0 | No | 8 |
| 4 | -1 | No | 8 |
| 5 | 4 | Yes | 12 |

```text
sum = 0
FOR i = 0 TO N - 1 DO
  IF deltas[i] > 0 THEN
    sum = sum + deltas[i]
  END IF
END FOR
OUTPUT sum
```

</details>

---

## 5.C : Index du minimum (premier en cas d’égalité)

Tableau `scores[0..N-1]`. Trouver l’**indice** de la **plus petite** valeur. En cas d’égalité, **garder le premier** minimum (pas de `<=` qui écraserait).

**Données de trace :** `N = 5`, `scores = [7, 3, 9, 3, 5]`.

1. Compléter la *trace table* (init + boucle dès `i = 1`).
2. Écrire le *pseudocode* (`minIndex`, comparaison à `scores[minIndex]`).
3. Que se passerait-il si on utilisait `<=` au lieu de `<` ?

<details class="corrige">
<summary>Corrigé</summary>

Résultat : `minIndex = 1` (valeur `3`). Le second `3` (indice 3) **ne remplace pas**.

| `i` | `scores[i]` | Test | `minIndex` |
| ---: | ---: | --- | ---: |
| (init) | | | 0 |
| 1 | 3 | `3 < 7` → Yes | 1 |
| 2 | 9 | `9 < 3` → No | 1 |
| 3 | 3 | `3 < 3` → No | 1 |
| 4 | 5 | `5 < 3` → No | 1 |

```text
minIndex = 0
FOR i = 1 TO N - 1 DO
  IF scores[i] < scores[minIndex] THEN
    minIndex = i
  END IF
END FOR
OUTPUT minIndex, scores[minIndex]
```

Avec `<=` : au tour `i = 3`, `3 <= 3` → Yes → `minIndex = 3` (on garderait le **dernier** minimum).

</details>

---

## 5.D : Compter les valeurs dans un intervalle

Tableau `marks[0..N-1]` et deux bornes `low`, `high` (`low <= high`). Compter combien de notes sont **dans** l’intervalle fermé `[low, high]` (inclus).

**Données de trace :** `N = 6`, `marks = [8, 12, 15, 9, 11, 14]`, `low = 10`, `high = 14`.

1. Quelle est la valeur de `count` en fin de parcours ?
2. Écrire le *pseudocode* (compteur + `IF` à deux conditions).
3. *Edge :* que donne l’algo si `N = 0` (tableau vide) ?

<details class="corrige">
<summary>Corrigé</summary>

Dans `[10, 14]` : `12`, `11`, `14` → **`count = 3`**.

| `i` | `marks[i]` | Dans l’intervalle ? | `count` |
| ---: | ---: | --- | ---: |
| (init) | | | 0 |
| 0 | 8 | No | 0 |
| 1 | 12 | Yes | 1 |
| 2 | 15 | No | 1 |
| 3 | 9 | No | 1 |
| 4 | 11 | Yes | 2 |
| 5 | 14 | Yes | 3 |

```text
count = 0
FOR i = 0 TO N - 1 DO
  IF (marks[i] >= low) AND (marks[i] <= high) THEN
    count = count + 1
  END IF
END FOR
OUTPUT count
```

Si `N = 0` : la boucle ne tourne pas, `count` reste `0`.

</details>

---

## 5.E : Copie filtrée vers un second tableau

Deux tableaux de même capacité : `src[0..N-1]` (source) et `dst[0..N-1]` (destination). Copier dans `dst` les valeurs de `src` **strictement inférieures** à un seuil `threshold`, en les rangeant **à partir de l’indice 0** sans trou. Les cases restantes de `dst` sont mises à `0`. Afficher aussi `k` = nombre de valeurs copiées.

**Données de trace :** `N = 5`, `src = [4, 9, 2, 7, 1]`, `threshold = 5`.

1. Quel est `dst` final et la valeur de `k` ?
2. Écrire le *pseudocode* (index d’écriture `k` distinct de l’index de lecture `i`).
3. (Optionnel) Esquisse du *flowchart* du parcours de copie.

<details class="corrige">
<summary>Corrigé</summary>

Valeurs `< 5` : `4`, `2`, `1` → `k = 3`, `dst = [4, 2, 1, 0, 0]`.

| `i` | `src[i]` | Copié ? | `k` après | `dst` (aperçu) |
| ---: | ---: | --- | ---: | --- |
| (init) | | | 0 | |
| 0 | 4 | Yes | 1 | `[4, …]` |
| 1 | 9 | No | 1 | |
| 2 | 2 | Yes | 2 | `[4, 2, …]` |
| 3 | 7 | No | 2 | |
| 4 | 1 | Yes | 3 | `[4, 2, 1, …]` |
| fill | | | | `[4, 2, 1, 0, 0]` |

```text
k = 0
FOR i = 0 TO N - 1 DO
  IF src[i] < threshold THEN
    dst[k] = src[i]
    k = k + 1
  END IF
END FOR
FOR j = k TO N - 1 DO
  dst[j] = 0
END FOR
OUTPUT k
OUTPUT dst
```

```mermaid
flowchart TB
  A([START]) --> B["k = zero"]
  B --> C["i = zero"]
  C --> D{i < N}
  D -->|Yes| E{src[i] < threshold}
  E -->|Yes| F["dst[k] = src[i]"]
  F --> G["k = k + one"]
  G --> H["i = i + one"]
  E -->|No| H
  H --> D
  D -->|No| I["j = k"]
  I --> J{j < N}
  J -->|Yes| K["dst[j] = zero"]
  K --> L["j = j + one"]
  L --> J
  J -->|No| M[/OUTPUT k, dst/]
  M --> N([END])
```

(`zero` = 0, `one` = 1 : valeurs seulement dans la *trace*.)

</details>

<footer class="site-footer"><a href="mailto:shuraux@he2b.be">Sylvain Huraux - HE2B - ISIB</a></footer>
