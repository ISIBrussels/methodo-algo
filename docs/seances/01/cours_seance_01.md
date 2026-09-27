---
marp: true
theme: methodo-algo
title: "Séance 1 — Algorithmes et traitement séquentiel"
paginate: true
header: "Méthodo Algo — Séance 1 [Sylvain Huraux - HE2B - ISIB](mailto:shuraux@he2b.be)"
footer: "[← Retour à l'accueil](../../index.html)"
---

## Séance 1

Algorithmes et traitement séquentiel

Support : **flowcharts** (prose FR ; flowcharts + pseudocode EN)

[→ Quiz](quiz_seance_01.html)
[→ Exercices](exercices_seance_01.html)

---

## Objectifs de la séance

- Distinguer **algorithm**, **program** et **programming language**
- Appliquer **Input → Process → Output**
- Utiliser `START` / `END`, `INPUT` / `OUTPUT`, process
- Variables et types : `INTEGER`, `REAL`, `BOOLEAN`, `STRING`
- Affectation `←`, opérateurs `+ - * /`, `DIV`, `MOD`
- Remplir une **trace table** (dry run)

**Livrable mental :** flowchart séquentiel (5–7 boîtes) + une ligne de trace.

---

## Cadre du cours

- Penser **avant** de coder — pas de langage d'enseignement ici
- Support principal : **flowcharts** (organigrammes)
- Le **pseudocode** viendra progressivement (dès S2–S3)
- Travail sur **papier** : lire, tracer, produire

---

## Convention de langue

| Élément | Langue |
| --- | --- |
| Thèmes, consignes, prose | **français** |
| Flowcharts, pseudocode | **anglais** |
| Glosses | OK : *tableau (array)*, etc. |

Les mots-clés de structure (`WHILE`, `FOR`, `IF`…) restent en anglais.

---

## Plan de la séance

1. Algorithm / program / programming language
2. Démarche Input → Process → Output
3. Symboles flowchart (séquence)
4. Variables, types, affectation, opérateurs
5. Trace table (dry run)

**Rythme :** petit bloc exposé → pause exercice → reprise.

---

## Qu'est-ce qu'un algorithm ?

Un **algorithme** (*algorithm*) est une **suite finie d'étapes** précises pour résoudre un problème.

- Indépendant d'un langage
- Exécutable « à la main » (sur papier)
- Doit produire un résultat clair

Exemples de la vie courante : recette de cuisine, itinéraire GPS, mode d'emploi.

---

## Program et programming language

| Terme | Sens |
| --- | --- |
| **Algorithm** | Méthode / démarche (idées, étapes) |
| **Program** | Algorithme **écrit** dans un langage, exécutable par une machine |
| **Programming language** | Langage formel pour écrire des programmes (Python, C++…) |

L'algorithme **précède** le programme. Ce cours s'arrête volontairement avant le code.

---

## Input → Process → Output

Tout traitement informatisé suit cette démarche (**IPO**) :

1. **Input** — données d'entrée (saisie, valeurs connues)
2. **Process** — calculs, transformations, enchaînement d'étapes
3. **Output** — résultat affiché ou produit

Avant de dessiner : *qu'est-ce qui entre ? que fait-on ? que sort-on ?*

---

## Exemple IPO (mental)

**Problème :** moyenne de deux notes.

| Étape | Contenu |
| --- | --- |
| Input | deux notes |
| Process | les additionner, diviser par 2 |
| Output | la moyenne |

Même idée pour un prix TTC, une conversion, une somme…

---

## Pause exercice 1.A

**Classer** — format *Lire* — ≈ 8–10 min

Pour chaque item : **algorithm** / **program** / **neither** ?

1. Une recette de cuisine détaillée
2. Une application mobile déjà installée sur le téléphone
3. L'itinéraire affiché par un GPS
4. Le langage Python lui-même

→ détail : [Exercices](exercices_seance_01.html) § 1.A

---

## Reprise 1.A

| Item | Classe | Pourquoi |
| --- | --- |
| Recette | **algorithm** | Étapes précises, sans machine |
| App installée | **program** | Code déjà écrit / exécutable |
| Itinéraire GPS | **algorithm** *(ou résultat)* | Suite d'étapes pour aller d'A à B |
| Python | **neither** | C'est un *programming language* |

Nuance admissible : le GPS *produit* un algorithme (l'itinéraire).

---

## Symboles flowchart (séquence)

| Symbole | Forme | Rôle |
| --- | --- |
| `START` / `END` | ovale (terminator) | Début / fin |
| `INPUT` / `OUTPUT` | parallélogramme | Entrée / sortie |
| process | rectangle | Traitement, affectation |

Aujourd'hui : **séquence** uniquement (pas encore de losange Yes/No → S2).

---

## Premier flowchart

Lire deux nombres, calculer leur somme, afficher le résultat.

```text
         ( START )
             |
             v
      / INPUT a, b /
             |
             v
      [ sum ← a + b ]
             |
             v
      / OUTPUT sum /
             |
             v
          ( END )
```

---

## Lire un flowchart

De haut en bas, dans l'ordre :

1. Où commence-t-on ? (`START`)
2. Quelles **entrées** ? (`INPUT`)
3. Quels **traitements** ? (rectangles)
4. Quelle **sortie** ? (`OUTPUT`)
5. Où s'arrête-t-on ? (`END`)

Un flowchart séquentiel = **un seul chemin**, sans branche.

---

## Pause exercice 1.B

**Lire + Tracer** — ≈ 10–12 min

Flowchart fourni (somme de 2 nombres) :

1. Quelles sont les entrées ? la sortie ? l'ordre des étapes ?
2. Pour `a = 3`, `b = 5` : que produit l'algorithme ?

Compléter mentalement (ou sur papier) une mini **trace table**.

→ [Exercices](exercices_seance_01.html) § 1.B

---

## Reprise 1.B

- **Entrées :** `a`, `b` — **Sortie :** `sum`
- **Ordre :** `START` → `INPUT` → process → `OUTPUT` → `END`
- Pour `a = 3`, `b = 5` : `sum ← 3 + 5` → **OUTPUT 8**

| step | a | b | sum | OUTPUT |
| :---: | :---: | :---: | :---: | :---: |
| INPUT | 3 | 5 | — | |
| process | 3 | 5 | 8 | |
| OUTPUT | 3 | 5 | 8 | 8 |

---

## Variables

Une **variable** est une case nommée qui contient une valeur.

- On lui donne un **nom** (identifiant)
- On lui associe un **type** (nature de la valeur)
- On peut **changer** sa valeur par affectation

En flowchart / pseudocode : noms en anglais simples (`sum`, `price`, `mark`).

---

## Types de base

| Type | Contenu | Exemples |
| --- | --- | --- |
| `INTEGER` | entier | `3`, `-1`, `42` |
| `REAL` | réel (virgule) | `3.14`, `-0.5` |
| `BOOLEAN` | vrai / faux | `TRUE`, `FALSE` |
| `STRING` | texte | `"hello"`, `"ISIB"` |

Le type fixe **ce qu'on peut faire** avec la valeur (calcul, comparaison, affichage…).

---

## Affectation

Symbole d'affectation : **`←`**

```text
total ← a + b
```

- À **gauche** : la variable qui reçoit
- À **droite** : l'expression calculée
- Ce n'est **pas** l'égalité mathématique

Après cette étape, `total` contient le résultat de `a + b`.

---

## Opérateurs arithmétiques

| Opérateur | Sens |
| --- | --- |
| `+` `-` `*` `/` | addition, soustraction, multiplication, division |
| `DIV` | quotient entier |
| `MOD` | reste de la division entière |

Exemples (`INTEGER`) :

- `17 DIV 5` → `3`
- `17 MOD 5` → `2`

Utile pour : heures/minutes, parité, découpage en paquets…

---

## Exemple : types + opérateurs

```text
a ← 17          // INTEGER
b ← 5           // INTEGER
q ← a DIV b     // 3
r ← a MOD b     // 2
avg ← (a + b) / 2   // REAL si division réelle
```

Choisir le type selon le besoin : une moyenne est souvent un `REAL`.

---

## Pause exercice 1.C

**Tracer** — ≈ 12–15 min

Algorithme (3 affectations + 1 `OUTPUT`) :

```text
a ← 10
b ← 4
result ← (a DIV b) + (a MOD b)
OUTPUT result
```

Compléter la **trace table** (colonnes : step, `a`, `b`, `result`, OUTPUT).

→ [Exercices](exercices_seance_01.html) § 1.C

---

## Reprise 1.C

| step | a | b | result | OUTPUT |
| --- | :---: | :---: | :---: | :---: |
| `a ← 10` | 10 | — | — | |
| `b ← 4` | 10 | 4 | — | |
| `result ← …` | 10 | 4 | **4** | |
| `OUTPUT result` | 10 | 4 | 4 | **4** |

Rappel : `10 DIV 4 = 2`, `10 MOD 4 = 2` → `2 + 2 = 4`.

---

## Trace table = dry run

Une **trace table** simule l'exécution **ligne par ligne**.

- Une colonne par variable (+ OUTPUT si besoin)
- Une ligne par étape
- On met à jour **seulement** ce qui change

Compétence d'examen : vérifier un algorithme **sans machine**.

---

## Pause exercice 1.D

**Produire** — ≈ 8–10 min

Dessiner le flowchart IPO :

> Lire un prix HT (`priceHT`) et un taux (`rate`)  
> Calculer le prix TTC  
> Afficher le TTC

Formule : `priceTTC ← priceHT * (1 + rate)`  
(ex. `rate = 0.21` pour 21 %)

→ [Exercices](exercices_seance_01.html) § 1.D

---

## Reprise 1.D (structure attendue)

```text
            ( START )
                |
                v
    / INPUT priceHT, rate /
                |
                v
  [ priceTTC ← priceHT * (1 + rate) ]
                |
                v
      / OUTPUT priceTTC /
                |
                v
             ( END )
```

Variante OK : moyenne de 2 nombres (même squelette IPO).

---

## Points clés à retenir

- **Algorithm** ≠ **program** ≠ **programming language**
- Toujours cadrer avec **Input → Process → Output**
- Symboles : `START`/`END`, `INPUT`/`OUTPUT`, process
- Types : `INTEGER`, `REAL`, `BOOLEAN`, `STRING`
- Affectation `←` ; `DIV` / `MOD` pour le quotient et le reste
- **Trace table** = dry run sur papier

---

## Livrable mental

Sur papier, pour un petit problème au choix :

1. Flowchart séquentiel (**5–7 boîtes**)
2. Une ligne (ou table) de **trace** pour un jeu de données

Exemple : moyenne de 2 nombres, ou conversion minutes → heures + minutes (`DIV` / `MOD`).

---

## Pour la prochaine séance

- Relire IPO + symboles de base
- S'entraîner à une trace table courte
- **Séance 2 :** instructions conditionnelles — losange **Yes / No**, `IF` / `ELSE`
