---
marp: true
theme: methodo-algo
title: "Séance 3 — Loops (1) : WHILE / REPEAT … UNTIL"
paginate: true
header: "Méthodo Algo — Séance 3 [Sylvain Huraux - HE2B - ISIB](mailto:shuraux@he2b.be)"
footer: "[← Retour à l'accueil](../../index.html)"
---

## Séance 3

Loops (1) : WHILE / REPEAT … UNTIL

[→ Quiz](quiz_seance_03.html)
[→ Exercices](exercices_seance_03.html)

---

## Objectifs de la séance

- Expliquer itération, condition d'arrêt, **infinite loop**
- Différencier `WHILE … DO … END WHILE` et `REPEAT … UNTIL`
- Appliquer **counter**, **accumulator**, **sentinel value**
- Mettre en place une **input validation**
- Chercher **min / max** sur des saisies successives

**Livrable mental :** saisie contrôlée + accumulateur, avec condition d'arrêt claire.

---

## Outline

1. Principe de l'itération ; infinite loop sur un flowchart
2. `WHILE` vs `REPEAT … UNTIL` (flowchart + pseudocode)
3. Patterns : counter, accumulator, sentinel
4. Input validation (saisie contrôlée)
5. Min / max sur saisies successives

---

## Points clés à retenir

- Toute boucle a une **condition de sortie crédible**
- `WHILE` teste **avant** ; `REPEAT` teste **après**
- Sentinel / validation = patterns d'examen fréquents

---

## Pour la prochaine séance

- Refaire un `REPEAT` de validation + un accumulateur
- On aborde `FOR`, `STEP` et les **nested loops**
