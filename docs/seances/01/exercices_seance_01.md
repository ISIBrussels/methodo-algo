# Séance 1 — Exercices

**Thème :** Algorithmes et traitement séquentiel  
**Support :** *flowcharts* + *trace table* (texte FR — flowcharts + *pseudocode* EN)

<nav class="page-nav">
  <a href="cours_seance_01.html">← Cours</a>
  <a href="quiz_seance_01.html">Quiz →</a>
  <a href="../../index.html">Accueil</a>
</nav>

## 1.A — Compléter une *trace table*

Exécuter « à la main » l'algorithme suivant :

```text
a = 10
b = 4
result = (a DIV b) + (a MOD b)
OUTPUT result
```

Compléter :

| step | a | b | result | OUTPUT |
| --- | --- | --- | --- | --- |
| `a = 10` | | | | |
| `b = 4` | | | | |
| `result = …` | | | | |
| `OUTPUT result` | | | | |

Rappel : `DIV` = quotient entier ; `MOD` = reste.  
Rappel : `=` est une **affectation**, pas une égalité mathématique.

---

## 1.B — Produire un *flowchart* (prix TTC)

Dessiner un *flowchart* (symboles `START` / `END`, `INPUT` / `OUTPUT`, process) pour :

> Lire un prix hors taxes (`priceHT`) et un taux (`rate`).  
> Calculer le prix TTC : `priceTTC = priceHT * (1 + rate)`.  
> Afficher `priceTTC`.

---

## 1.C — *Trace table* (heures et minutes)

Exécuter « à la main » l'algorithme suivant, avec `totalMinutes = 135` :

```text
totalMinutes = 135
hours = totalMinutes DIV 60
minutes = totalMinutes MOD 60
OUTPUT hours, minutes
```

Compléter :

| step | totalMinutes | hours | minutes | OUTPUT |
| --- | --- | --- | --- | --- |
| `totalMinutes = 135` | | | | |
| `hours = …` | | | | |
| `minutes = …` | | | | |
| `OUTPUT hours, minutes` | | | | |

---

## 1.D — Produire un *flowchart* (moyenne)

Dessiner un *flowchart* pour :

> Lire deux notes (`a`, `b`).  
> Calculer la moyenne : `avg = (a + b) / 2`.  
> Afficher `avg`.

---

## Corrigé (enseignant)

### 1.A

`10 DIV 4 = 2`, `10 MOD 4 = 2` → `result = 4` → **OUTPUT 4**.

| step | a | b | result | OUTPUT |
| --- | --- | --- | --- | --- |
| `a = 10` | 10 | | | |
| `b = 4` | 10 | 4 | | |
| `result = (a DIV b) + (a MOD b)` | 10 | 4 | 4 | |
| `OUTPUT result` | 10 | 4 | 4 | 4 |

### 1.B

`START` → `INPUT priceHT, rate` → `priceTTC = priceHT * (1 + rate)` → `OUTPUT priceTTC` → `END`.

### 1.C

`135 DIV 60 = 2`, `135 MOD 60 = 15` → **OUTPUT 2, 15**.

| step | totalMinutes | hours | minutes | OUTPUT |
| --- | --- | --- | --- | --- |
| `totalMinutes = 135` | 135 | | | |
| `hours = totalMinutes DIV 60` | 135 | 2 | | |
| `minutes = totalMinutes MOD 60` | 135 | 2 | 15 | |
| `OUTPUT hours, minutes` | 135 | 2 | 15 | 2, 15 |

### 1.D

`START` → `INPUT a, b` → `avg = (a + b) / 2` → `OUTPUT avg` → `END`.

<footer class="site-footer"><a href="mailto:shuraux@he2b.be">Sylvain Huraux - HE2B - ISIB</a></footer>
