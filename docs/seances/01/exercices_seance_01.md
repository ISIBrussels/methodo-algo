# Séance 1 — Exercices

**Thème :** Algorithmes et traitement séquentiel  
**Support :** *flowcharts* + *trace table* (texte FR — flowcharts + *pseudocode* EN)

Pour **chaque** exercice : produire une *trace table* **et** un *flowchart*.

<nav class="page-nav">
  <a href="cours_seance_01.html">← Cours</a>
  <a href="quiz_seance_01.html">Quiz →</a>
  <a href="../../index.html">Accueil</a>
</nav>

## 1.A — `DIV` et `MOD`

Algorithme :

```text
a = 10
b = 4
result = (a DIV b) + (a MOD b)
OUTPUT result
```

1. Compléter la *trace table* :

| step | a | b | result | OUTPUT |
| --- | --- | --- | --- | --- |
| `a = 10` | | | | |
| `b = 4` | | | | |
| `result = …` | | | | |
| `OUTPUT result` | | | | |

2. Dessiner le *flowchart* correspondant (symboles `START` / `END`, process, `OUTPUT`).

Rappel : `DIV` = quotient entier ; `MOD` = reste.  
Rappel : `=` est une **affectation**, pas une égalité mathématique.

---

## 1.B — Prix TTC

> Lire un prix hors taxes (`priceHT`) et un taux (`rate`).  
> Calculer le prix TTC : `priceTTC = priceHT * (1 + rate)`.  
> Afficher `priceTTC`.

1. Dessiner le *flowchart* (`START` / `END`, `INPUT` / `OUTPUT`, process).
2. Compléter la *trace table* pour `priceHT = 100`, `rate = 0.21` :

| step | priceHT | rate | priceTTC | OUTPUT |
| --- | --- | --- | --- | --- |
| `INPUT priceHT, rate` | | | | |
| `priceTTC = …` | | | | |
| `OUTPUT priceTTC` | | | | |

---

## 1.C — Heures et minutes

Algorithme, avec `totalMinutes = 135` :

```text
totalMinutes = 135
hours = totalMinutes DIV 60
minutes = totalMinutes MOD 60
OUTPUT hours, minutes
```

1. Compléter la *trace table* :

| step | totalMinutes | hours | minutes | OUTPUT |
| --- | --- | --- | --- | --- |
| `totalMinutes = 135` | | | | |
| `hours = …` | | | | |
| `minutes = …` | | | | |
| `OUTPUT hours, minutes` | | | | |

2. Dessiner le *flowchart* correspondant.

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

*Flowchart :* `START` → `a = 10` → `b = 4` → `result = (a DIV b) + (a MOD b)` → `OUTPUT result` → `END`.

### 1.B

*Flowchart :* `START` → `INPUT priceHT, rate` → `priceTTC = priceHT * (1 + rate)` → `OUTPUT priceTTC` → `END`.

`100 * (1 + 0.21) = 121` → **OUTPUT 121**.

| step | priceHT | rate | priceTTC | OUTPUT |
| --- | --- | --- | --- | --- |
| `INPUT priceHT, rate` | 100 | 0.21 | | |
| `priceTTC = priceHT * (1 + rate)` | 100 | 0.21 | 121 | |
| `OUTPUT priceTTC` | 100 | 0.21 | 121 | 121 |

### 1.C

`135 DIV 60 = 2`, `135 MOD 60 = 15` → **OUTPUT 2, 15**.

| step | totalMinutes | hours | minutes | OUTPUT |
| --- | --- | --- | --- | --- |
| `totalMinutes = 135` | 135 | | | |
| `hours = totalMinutes DIV 60` | 135 | 2 | | |
| `minutes = totalMinutes MOD 60` | 135 | 2 | 15 | |
| `OUTPUT hours, minutes` | 135 | 2 | 15 | 2, 15 |

*Flowchart :* `START` → `totalMinutes = 135` → `hours = totalMinutes DIV 60` → `minutes = totalMinutes MOD 60` → `OUTPUT hours, minutes` → `END`.

<footer class="site-footer"><a href="mailto:shuraux@he2b.be">Sylvain Huraux - HE2B - ISIB</a></footer>
