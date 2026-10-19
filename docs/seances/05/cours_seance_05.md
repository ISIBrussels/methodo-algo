---
marp: true
theme: methodo-algo
title: "Séance 5 — Tableaux (arrays)"
paginate: true
header: "Méthodo Algo — Séance 5 [Sylvain Huraux - HE2B - ISIB](mailto:shuraux@he2b.be)"
footer: "[← Retour à l'accueil](../../index.html)"
---

## Séance 5

Tableaux (arrays)

[→ Quiz](quiz_seance_05.html)
[→ Exercices](exercices_seance_05.html)

---

## Pourquoi un tableau ?

Jusqu'ici : une **variable** = **une** valeur (`mark`, `sum`, `count`…).

Besoin fréquent : **garder plusieurs valeurs** du même type :

- les notes d'un groupe,
- une série de mesures,
- une liste de prix.

Sans tableau : `v1`, `v2`, `v3`… rapidement **ingérable**.  
On regroupe ces valeurs dans un **tableau** (*array*).

---

## Tableau (*array*) : idée

Un tableau est une **suite ordonnée** de cases, chacune accessible par un **indice** (*index*).

Exemple (indices de **1** à **N**, convention du cours) :

| Indice | 1 | 2 | 3 | 4 | 5 |
| ---: | ---: | ---: | ---: | ---: | ---: |
| Valeur | 12 | 7 | 15 | 9 | 11 |

- Taille (*size*) : `N = 5`
- Premier élément : `values[1]`
- Dernier élément : `values[N]` (ici `values[5]`)

---

## Déclaration

On déclare le nom, le type des éléments, et la plage d'indices.

```text
ARRAY values[1..N] OF INTEGER
```

| Élément | Sens |
| --- | --- |
| `ARRAY` | mot-clé tableau |
| `values` | nom |
| `[1..N]` | indices de 1 à N **inclus** |
| `OF INTEGER` | type de chaque case |

`N` est la **taille** : nombre de cases.  
Autres types possibles : `REAL`, `BOOLEAN`, `STRING`.

---

## Indice et contenu

Deux notions à ne **pas** confondre :

| Notion | Exemple | Sens |
| --- | --- | --- |
| **Indice** | `3` | **position** dans le tableau |
| **Contenu** | `values[3]` | **valeur** stockée à cette position |

Avec le tableau `[12, 7, 15, 9, 11]` :

- `values[1] = 12`
- `values[3] = 15`
- l'indice `3` n'est **pas** la valeur `3`

Affectation d'une case : `values[i] = 20` (le `=` d'affectation, comme en S1).

---

## Remplir un tableau

On lit (ou calcule) une valeur **par case**, souvent avec un `FOR`.

```text
INPUT N
FOR i = 1 TO N DO
  INPUT values[i]
END FOR
```

- `i` parcourt les **indices**
- `values[i]` reçoit la valeur saisie
- Plage **inclusive** : de `1` à `N`

Même idée qu'un `FOR` S4, mais le corps touche `values[i]` au lieu d'une seule variable.

---

## Parcourir (*traverse*)

**Parcourir** = passer sur **chaque** case, dans l'ordre des indices.

```text
FOR i = 1 TO N DO
  OUTPUT values[i]
END FOR
```

Affiche toutes les valeurs, de la première à la dernière.

C'est le squelette de presque tous les patterns de cette séance : somme, min/max, comptage…

---

## Parcours en *flowchart*

Même structure qu'un `FOR` : initialiser `i`, tester, corps, incrémenter.

<div class="two-cols">

<div>

- Losange : `i <= N`
- **Yes** → traiter `values[i]`, puis `i = i + 1`
- **No** → fin du parcours

Bornes : `i` de **1** à **N** inclus.

</div>

<div class="max-mermaid-lg">

```mermaid
flowchart TB
  A([START]) --> B["i = 1"]
  B --> C{i <= N}
  C -->|Yes| D[/OUTPUT values[i]/]
  D --> E["i = i + 1"]
  E --> C
  C -->|No| F([END])
```

</div>

</div>

---

## Pattern : somme (*sum*)

Accumulateur + parcours du tableau.

```text
sum = 0
FOR i = 1 TO N DO
  sum = sum + values[i]
END FOR
OUTPUT sum
```

- `sum` démarre à `0` **avant** la boucle
- Chaque tour **ajoute** `values[i]`
- Même idée que l'accumulateur S3, mais les valeurs sont déjà en mémoire

Avec `[12, 7, 15]` : `sum` vaut `12`, puis `19`, puis `34`.

---

## Pattern : moyenne (*average*)

Somme, puis division par la taille.

```text
sum = 0
FOR i = 1 TO N DO
  sum = sum + values[i]
END FOR
average = sum / N
OUTPUT average
```

Attention :

- `N` doit être **> 0** (sinon division impossible)
- type : si `sum` et `N` sont `INTEGER`, préciser si `average` est `REAL`

---

## Pattern : minimum / maximum

On garde le **meilleur** vu jusqu'ici.

```text
min = values[1]
max = values[1]
FOR i = 2 TO N DO
  IF values[i] < min THEN
    min = values[i]
  END IF
  IF values[i] > max THEN
    max = values[i]
  END IF
END FOR
```

- Initialiser avec la **première** case
- Boucle à partir de `i = 2` (déjà « vu » l'indice 1)
- Mettre à jour seulement si on trouve mieux

---

## Pattern : index du maximum

Souvent on veut **où** se trouve le max, pas seulement sa valeur.

```text
maxIndex = 1
FOR i = 2 TO N DO
  IF values[i] > values[maxIndex] THEN
    maxIndex = i
  END IF
END FOR
OUTPUT maxIndex, values[maxIndex]
```

- `maxIndex` stocke un **indice**, pas la valeur
- Comparer `values[i]` à `values[maxIndex]`
- En cas d'égalité : on **garde** le premier max (pas de `>=`)

---

<!-- _class: compact -->

## Trace : index of max

```text
values = [4, 9, 2, 9, 5]   (N = 5)
```

| `i` | `values[i]` | Test | `maxIndex` |
| ---: | ---: | --- | ---: |
| (init) | | | 1 |
| 2 | 9 | `9 > 4` → Yes | 2 |
| 3 | 2 | `2 > 9` → No | 2 |
| 4 | 9 | `9 > 9` → No | 2 |
| 5 | 5 | `5 > 9` → No | 2 |

Résultat : `maxIndex = 2`, valeur `9`. Le second `9` (indice 4) **ne remplace pas**.

---

## Pattern : compter selon un critère

Combien d'éléments satisfont une condition ?

```text
count = 0
FOR i = 1 TO N DO
  IF values[i] > limit THEN
    count = count + 1
  END IF
END FOR
OUTPUT count
```

- `count` = compteur (*counter*), initialisé à `0`
- Le `IF` filtre : on incrémente seulement si le critère est vrai
- Variantes : `>= limit`, `= target`, dans un intervalle…

---

## Décalage (*shift*) vers la gauche

Chaque case reçoit la valeur de sa voisine de **droite**. La dernière case est libérée (souvent mise à 0 ou lue ailleurs).

```text
FOR i = 1 TO N - 1 DO
  values[i] = values[i + 1]
END FOR
values[N] = 0
```

Avant : `[10, 20, 30, 40]`  
Après : `[20, 30, 40, 0]`

Sens : on « pousse » vers la gauche. Un décalage **droite** irait de `N` vers `2` (ordre inverse pour ne pas écraser trop tôt).

---

## Inversion (*reverse*) in-place

Échanger la première case avec la dernière, la 2<sup>e</sup> avec l'avant-dernière, etc.

```text
FOR i = 1 TO N DIV 2 DO
  temp = values[i]
  values[i] = values[N - i + 1]
  values[N - i + 1] = temp
END FOR
```

- `temp` : variable temporaire pour le **swap**
- On s'arrête à `N DIV 2` (sinon on **ré-inverse**)
- `N = 1` : la boucle ne tourne pas (rien à faire)

Avant : `[1, 2, 3, 4, 5]` → Après : `[5, 4, 3, 2, 1]`

---

## *Index out of bounds*

Accéder à un indice **hors** de `[1..N]` : erreur (*index out of bounds*).

| Accès | Pour `N = 5` | Valide ? |
| --- | --- | --- |
| `values[1]` | premier | oui |
| `values[5]` | dernier | oui |
| `values[0]` | sous le premier | **non** |
| `values[6]` | au-delà | **non** |
| `values[N + 1]` | au-delà | **non** |

Cause fréquente : `FOR i = 1 TO N + 1` ou `i = 0 TO N` (mélange avec d'autres conventions d'indices).

---

## Piège classique : `TO N + 1`

```text
FOR i = 1 TO N + 1 DO
  OUTPUT values[i]
END FOR
```

Avec `N = 3` : la boucle tente `i = 1, 2, 3, 4`.  
Quand `i = 4` : `values[4]` **n'existe pas**.

Correction : `FOR i = 1 TO N`.

Toujours se demander : **premier** indice ? **dernier** ? (rappel *off-by-one* S4)

---

## Checklist des bornes (tableaux)

Avant de valider un parcours :

1. Les indices vont-ils de **1** à **N** inclus ?
2. Le `FOR` s'arrête-t-il bien à **`N`**, pas `N + 1` ni `N - 1` par erreur ?
3. Pour min/max / index of max : init sur `values[1]`, boucle dès `i = 2` ?
4. Pour un *reverse* : borne `N DIV 2`, et swap avec `N - i + 1` ?
5. Une ***trace table*** sur `N` petit (3 à 5) confirme-t-elle le résultat ?

---

## Synthèse : patterns sur tableau

| Besoin | Idée clé |
| --- | --- |
| Afficher / traiter tout | `FOR i = 1 TO N` |
| Somme / moyenne | accumulateur + `/ N` |
| Min / max | init `values[1]`, comparer dès `i = 2` |
| Index du max | stocker l'**indice**, pas seulement la valeur |
| Comptage | compteur + `IF` critère |
| Décalage / inversion | attention à l'ordre des écritures |
| Sécurité | jamais hors de `[1..N]` |

Teaser S6 : encapsuler ces parcours dans des **fonctions** (`average`, `countAbove`…).

---

## Quiz

Questions pour tester la compréhension du contenu de la séance.

[→ Quiz](quiz_seance_05.html)
