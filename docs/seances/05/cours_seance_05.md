---
marp: true
theme: methodo-algo
title: "Séance 5 — Complexité : temps, espace, notation O"
paginate: true
header: "Methodologie algorithmique — Séance 5 [Sylvain Huraux - HE2B - ISIB](mailto:shuraux@he2b.be)"
footer: "[← Retour à l'accueil](../../index.html)"
---

## Séance 5

Complexité : temps, espace, notation O

[→ Quiz](quiz_seance_05.html)
[→ Questions amphi](questions_seance_05.html)

---

## Objectifs de la séance

- Expliquer **temps** et **espace** en termes intuitifs
- Lire O(1), O(n), O(n²) (log n en option)
- Relier la **forme du logigramme** (boucles) au coût

**Livrable mental :** devant un logigramme à une/deux boucles, dire O(1) / O(n) / O(n²) et pourquoi.

---

## Outline

1. Compter les passages dans un logigramme
2. Croissance : constant, linéaire, quadratique
3. O(…) = ordre de grandeur (lecture, pas preuves)
4. Espace mémoire : idée sommaire
5. Piège : micro-optimisation vs changer d'algorithme / de schéma

**Hors séance :** NP-complet, preuves formelles.

---

## Points clés à retenir

- On compare des **ordres de grandeur**, pas des millisecondes isolées
- Boucles imbriquées visibles sur le logigramme → souvent O(n²)
- Un meilleur algorithme bat une optimisation locale

---

## Pour la prochaine séance

- Classer 3–4 logigrammes vus au cours
- On abordera des **stratégies** (chacune illustrée par un organigramme)
