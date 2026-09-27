---
marp: true
theme: methodo-algo
title: "Séance 7 — Searching, sorting & efficiency"
paginate: true
header: "Méthodo Algo — Séance 7 [Sylvain Huraux - HE2B - ISIB](mailto:shuraux@he2b.be)"
footer: "[← Retour à l'accueil](../../index.html)"
---

## Séance 7

Searching, sorting & efficiency

[→ Quiz](quiz_seance_07.html)
[→ Exercices](exercices_seance_07.html)

---

## Objectifs de la séance

- **Linear search** avec early exit
- **Binary search** sur tableau trié
- **Selection sort** et **bubble sort** (arrêt anticipé)
- Compter comparaisons et échanges
- Situer N, N², log N ; **Big O** sans formalisme ; best / worst case

**Livrable mental :** linear vs binary (prérequis) + pourquoi bubble/selection ~N².

---

## Outline

1. Linear search + early exit
2. Binary search (sorted) ; intuition log N
3. Selection sort ; bubble sort + early exit
4. Compter comparisons / swaps
5. Croissance N / N² / log N ; best vs worst

---

## Points clés à retenir

- Binary search exige un tableau **trié**
- Compter les opérations = première lecture de l'efficacité
- Big O = ordre de grandeur, pas une preuve

---

## Pour la suite

- Relire search & sort + un comptage de comparaisons
- Séance 8 *(optionnelle)* : review & mock exam
