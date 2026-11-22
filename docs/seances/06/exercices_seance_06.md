# Séance 6 — Exercices

**Thème :** Fonctions et procédures  
**Support :** *pseudocode* (`FUNCTION` / `PROCEDURE` / `CALL` / `RETURN`) + *trace table* (texte FR, *pseudocode* EN)

Dans les *flowcharts* : pas de littéraux numériques (les valeurs concrètes apparaissent **uniquement** dans la *trace table*).

<nav class="page-nav">
  <a href="../../index.html">Accueil</a>
  <a href="cours_seance_06.html">Slides</a>
  <a href="syllabus_seance_06.html">Syllabus</a>
  <a href="quiz_seance_06.html">Quiz</a>
</nav>

## 6.A : FUNCTION ou PROCEDURE ?

Pour chaque bloc, dire si c'est plutôt une **`FUNCTION`** ou une **`PROCEDURE`**, et pourquoi (une phrase).

**Bloc 1**

```text
…(n : INTEGER)…
  IF (n MOD 2) = 0 THEN
    RETURN TRUE
  ELSE
    RETURN FALSE
  END IF
```

**Bloc 2**

```text
…(title : STRING)…
  OUTPUT "===="
  OUTPUT title
  OUTPUT "===="
```

**Bloc 3**

```text
…(values : ARRAY, n : INTEGER, factor : INTEGER)…
  FOR i = 0 TO n - 1 DO
    values[i] = values[i] * factor
  END FOR
```

<details class="corrige">
<summary>Corrigé</summary>

| Bloc | Choix | Pourquoi |
| --- | --- | --- |
| 1 | `FUNCTION` | Produit une valeur booléenne via `RETURN` |
| 2 | `PROCEDURE` | Affiche seulement, pas de valeur à récupérer |
| 3 | `PROCEDURE` | Modifie le tableau sur place (effet), sans `RETURN` de résultat |

</details>

---

## 6.B : `maxOf`

Écrire une fonction qui renvoie le **plus grand** de deux entiers.

```text
FUNCTION maxOf(a : INTEGER, b : INTEGER) : INTEGER
  …
END FUNCTION
```

**Données de trace :** appel `maxOf(4, 9)`.

1. Écrire le corps complet (avec `RETURN`).
2. Compléter la *trace* de l'appel : paramètres, branche choisie, valeur renvoyée.
3. Que vaut `maxOf(7, 7)` ?

<details class="corrige">
<summary>Corrigé</summary>

```text
FUNCTION maxOf(a : INTEGER, b : INTEGER) : INTEGER
  IF a > b THEN
    RETURN a
  ELSE
    RETURN b
  END IF
END FUNCTION
```

Trace de `maxOf(4, 9)` :

| Étape | Détail |
| --- | --- |
| Entrée | `a = 4`, `b = 9` |
| Test | `4 > 9` → No |
| `RETURN` | `b` soit `9` |

`maxOf(7, 7)` : `7 > 7` → No → `RETURN b` → **`7`** (les deux branches donnent la même valeur).

</details>

---

## 6.C : `average` depuis un main

Écrire une fonction qui calcule la **moyenne** d'un tableau (indices `0..n-1`), puis un **main** qui :

1. lit `n` et les `n` valeurs,
2. appelle `average`,
3. affiche le résultat.

On suppose `n > 0`. Type de retour : `REAL` (ou préciser la division réelle).

**Données de trace :** `n = 4`, `values = [6, 8, 10, 4]`.

1. Écrire `FUNCTION average(values, n)`.
2. Écrire le main (squelette d'appels).
3. Quelle moyenne affiche-t-on pour la trace ?

<details class="corrige">
<summary>Corrigé</summary>

```text
FUNCTION average(values : ARRAY, n : INTEGER) : REAL
  sum = 0
  FOR i = 0 TO n - 1 DO
    sum = sum + values[i]
  END FOR
  RETURN sum / n
END FUNCTION

// main
INPUT n
FOR i = 0 TO n - 1 DO
  INPUT values[i]
END FOR
mean = average(values, n)
OUTPUT mean
```

Trace : `sum = 28`, `28 / 4 = 7` → **OUTPUT 7**.

</details>

---

## 6.D : `countAbove`

Écrire une fonction qui compte combien d'éléments sont **strictement au-dessus** d'une limite.

```text
FUNCTION countAbove(values : ARRAY, n : INTEGER, limit : INTEGER) : INTEGER
  …
END FUNCTION
```

**Données de trace :** `n = 5`, `values = [3, 10, 7, 10, 2]`, `limit = 7`.

1. Écrire le corps.
2. Compléter une *trace table* (`i`, `values[i]`, test, `count`).
3. *Edge :* que renvoie la fonction si **aucune** valeur n'est au-dessus de `limit` ?

<details class="corrige">
<summary>Corrigé</summary>

Au-dessus de `7` : `10` et `10` → **`2`**.

| `i` | `values[i]` | `> limit` ? | `count` |
| ---: | ---: | --- | ---: |
| (init) | | | 0 |
| 0 | 3 | No | 0 |
| 1 | 10 | Yes | 1 |
| 2 | 7 | No | 1 |
| 3 | 10 | Yes | 2 |
| 4 | 2 | No | 2 |

```text
FUNCTION countAbove(values : ARRAY, n : INTEGER, limit : INTEGER) : INTEGER
  count = 0
  FOR i = 0 TO n - 1 DO
    IF values[i] > limit THEN
      count = count + 1
    END IF
  END FOR
  RETURN count
END FUNCTION
```

Si aucune valeur ne dépasse `limit` : la boucle n'incrémente jamais → **`RETURN 0`**.

</details>

---

## 6.E : Corriger un bug de *scope*

Le main veut afficher le total **avant** et **après** un traitement. L'extrait suivant est incorrect.

```text
total = 100

PROCEDURE resetTotal()
  total = 0
END PROCEDURE

OUTPUT total
CALL resetTotal()
OUTPUT total
```

1. Qu'affiche-t-on (dans l'ordre) avec cet extrait tel quel, si `total` est globale ?
2. Quel est le problème de conception ?
3. Proposer une correction qui **préserve** le `100` du main (par ex. variable locale, ou procédure qui ne touche pas `total`, ou renommage clair).

<details class="corrige">
<summary>Corrigé</summary>

1. Affichage : `100`, puis `0` (la procédure a écrasé la globale).
2. Problème : effet de bord sur une **globale** partagée. Le nom `resetTotal` masque qu'on détruit la valeur du main.
3. Correction possible (locale dans la procédure, le main inchangé) :

```text
total = 100

PROCEDURE resetLocalDemo()
  localTotal = 0
  OUTPUT localTotal
END PROCEDURE

OUTPUT total
CALL resetLocalDemo()
OUTPUT total
```

Affichage : `100`, `0` (local), `100` (main intact).

Autre piste : passer la valeur en paramètre **sans** réassigner une globale du même nom, ou faire renvoyer une nouvelle valeur par une `FUNCTION` que le main choisit d'affecter ou non.

</details>

<footer class="site-footer"><a href="mailto:shuraux@he2b.be">Sylvain Huraux - HE2B - ISIB</a></footer>
