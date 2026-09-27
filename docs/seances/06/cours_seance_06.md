---
marp: true
theme: methodo-algo
title: "Séance 6 — Functions & procedures"
paginate: true
header: "Méthodologie algorithmique — Séance 6 [Sylvain Huraux - HE2B - ISIB](mailto:shuraux@he2b.be)"
footer: "[← Retour à l'accueil](../../index.html)"
---

## Séance 6

Functions & procedures

[→ Quiz](quiz_seance_06.html)
[→ Questions amphi](questions_seance_06.html)

---

## Objectifs de la séance

- Découper un problème (**modular design**)
- Distinguer `FUNCTION … RETURN` et `PROCEDURE` ; utiliser `CALL`
- Parameters / arguments ; valeur de retour
- Portée **local / global**
- Fonctions sur tableaux : `average(values, n)`, `countAbove(values, n, limit)`
- Structure **main program + functions**

**Livrable mental :** main qui lit un tableau, appelle `average` et `countAbove`.

---

## Outline

1. Pourquoi modulariser ?
2. `FUNCTION` vs `PROCEDURE` ; `CALL` / `RETURN`
3. Parameters, arguments, return value
4. Local / global scope
5. Main + functions sur tableaux

---

## Points clés à retenir

- Une function **retourne** ; une procedure **fait**
- Préférer le local au global
- Le programme se lit depuis le **main**

---

## Pour la prochaine séance

- Refactoriser un monolithe « notes » en 2 fonctions
- On aborde **searching, sorting & efficiency**
