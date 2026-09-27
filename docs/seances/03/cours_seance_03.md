---
marp: true
theme: methodo-algo
title: "Séance 3 — Structures de contrôle et décomposition"
paginate: true
header: "Methodologie algorithmique — Séance 3 [Sylvain Huraux - HE2B - ISIB](mailto:shuraux@he2b.be)"
footer: "[← Retour à l'accueil](../../index.html)"
---

## Séance 3

Structures de contrôle et décomposition

[→ Quiz](quiz_seance_03.html)
[→ Questions amphi](questions_seance_03.html)

---

## Objectifs de la séance

- Représenter **séquence**, **sélection**, **itération** dans un logigramme
- Imbriquer sans se perdre ; détecter une boucle dangereuse **sur le schéma**
- **Décomposer** en sous-problèmes / sous-logigrammes

**Livrable mental :** logigramme principal + un sous-logigramme pour un problème en 2–3 parties.

---

## Outline

1. Motifs de logigramme : SI / SINON, TANT QUE, POUR
2. Ordre des conditions, imbrications, boucles infinies visibles
3. Décomposition top-down
4. Procédures : contrat entrée → sortie et appel dans le schéma
5. Refactoriser un gros logigramme en blocs nommés

---

## Points clés à retenir

- Chaque structure a un **motif graphique** reconnaissable
- Nommer des sous-problèmes clarifie avant d'ajouter des boîtes
- Une boucle doit avoir une condition de fin **crédible** sur le dessin

---

## Pour la prochaine séance

- S'entraîner à dessiner les trois motifs
- On abordera les **structures de données** (choix méthodologiques)
