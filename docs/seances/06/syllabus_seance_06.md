# Séance 6 — Chaînes et caractères

<nav class="page-nav">
  <a href="../../index.html">Accueil</a>
  <a href="cours_seance_06.html">Slides</a>
  <a href="quiz_seance_06.html">Quiz</a>
  <a href="exercices_seance_06.html">Exercices</a>
</nav>

## Pourquoi les chaînes ?

Jusqu'ici : nombres, booléens, tableaux de nombres.

Besoin fréquent : manipuler du **texte** :

- un mot, un nom, un message,
- un code saisi au clavier,
- une suite de symboles à inspecter un par un.

Une **chaîne** (*string*) est une suite ordonnée de **caractères** (*characters*).

## Type `STRING`

Déjà vu en S1 : `STRING` = texte entre guillemets.

```text
DECLARE word : STRING
word = "algo"
```

| Exemple | Longueur | Caractères |
| --- | ---: | --- |
| `"algo"` | 4 | `a`, `l`, `g`, `o` |
| `"ISIB"` | 4 | `I`, `S`, `I`, `B` |
| `""` | 0 | (chaîne vide) |

Un caractère isolé se traite comme une chaîne de longueur **1** (ex. `"a"`).

## Longueur (*length*)

`LENGTH(text)` renvoie le **nombre de caractères**.

```text
word = "algo"
n = LENGTH(word)   // n = 4
```

- `n` sert de **taille**, comme pour un tableau
- Indices utiles : de **0** à **n - 1**
- Chaîne vide : `LENGTH("") = 0`

Sans la longueur, on ne sait pas où s'arrête le parcours.

## Indices 0-based

Comme un tableau : chaque caractère a une **position**.

Exemple : `text = "algo"` (`n = 4`)

| Indice | 0 | 1 | 2 | 3 |
| ---: | :---: | :---: | :---: | :---: |
| Caractère | `a` | `l` | `g` | `o` |

- Premier : `text[0]`
- Dernier : `text[n - 1]` (ici `text[3]`)
- Hors bornes (`text[4]`, `text[-1]`) : **interdit** (même idée que *index out of bounds* S5)

## Accéder à un caractère

`text[i]` = caractère à l'indice `i` (lecture).

```text
text = "algo"
ch = text[2]    // ch = "g"
OUTPUT text[0]  // affiche a
```

Deux notions distinctes :

| Notion | Exemple | Sens |
| --- | --- | --- |
| **Indice** | `2` | position |
| **Caractère** | `text[2]` | contenu à cette position |

Comparer un caractère : `IF text[i] = target THEN …`

## Parcourir avec `FOR`

**Parcourir** = passer sur **chaque** caractère, dans l'ordre.

```text
n = LENGTH(text)
FOR i = 0 TO n - 1 DO
  OUTPUT text[i]
END FOR
```

- `i` parcourt les **indices**
- Corps : on lit `text[i]` (afficher, compter, recopier…)
- Plage inclusive : `0` … `n - 1`

Même squelette que le parcours de tableau S5.

## Parcours en *flowchart*

Même structure qu'un `FOR` : init, test, corps, incrément.

<div class="two-cols">

<div>

- Losange : `i < n`
- **Yes** → traiter `text[i]`, puis `i = i + 1`
- **No** → fin du parcours

Bornes : `i` de **0** à **n - 1**.

</div>

<div class="max-mermaid-lg">

```mermaid
flowchart TB
  A([START]) --> B["i = 0"]
  B --> C{i < n}
  C -->|Yes| D[/OUTPUT text[i]/]
  D --> E["i = i + 1"]
  E --> C
  C -->|No| F([END])
```

</div>

</div>

## Compter un caractère

Combien de fois `target` apparaît dans `text` ?

```text
n = LENGTH(text)
count = 0
FOR i = 0 TO n - 1 DO
  IF text[i] = target THEN
    count = count + 1
  END IF
END FOR
OUTPUT count
```

Exemple : `text = "banana"`, `target = "a"` → `count = 3`.

Pattern *counter* S3, appliqué aux caractères.

## Construire / concaténer

On **construit** une nouvelle chaîne en ajoutant des morceaux (`+`).

```text
greeting = "Hi"
name = "Ada"
msg = greeting + ", " + name
OUTPUT msg    // Hi, Ada
```

Recopie caractère par caractère :

```text
result = ""
n = LENGTH(text)
FOR i = 0 TO n - 1 DO
  result = result + text[i]
END FOR
```

- `""` = départ vide
- `result = result + …` **ajoute à la fin**
- Ordre des `+` = ordre final des caractères

## Palindrome : idée

Un **palindrome** se lit pareil à l'endroit et à l'envers  
(ex. `"kayak"`, `"radar"`, `"noon"`).

Deux approches simples :

1. **Deux pointeurs** : comparer les bouts, puis se rapprocher
2. **Inverser** puis comparer à l'original

On détaille d'abord les **deux pointeurs** (pas besoin d'une 2ᵉ chaîne).

## Palindrome : deux pointeurs

```text
n = LENGTH(text)
left = 0
right = n - 1
isPal = TRUE
WHILE left < right AND isPal DO
  IF text[left] <> text[right] THEN
    isPal = FALSE
  ELSE
    left = left + 1
    right = right - 1
  END IF
END WHILE
OUTPUT isPal
```

- `left` avance, `right` recule
- Dès qu'une paire diffère → **pas** palindrome
- Chaîne vide ou 1 caractère → palindrome (`left < right` faux tout de suite)

## Trace : `"kayak"`

`n = 5` · indices `0..4` · caractères `k a y a k`

| Étape | `left` | `right` | Comparaison | `isPal` |
| ---: | ---: | ---: | --- | --- |
| 1 | 0 | 4 | `k` = `k` | TRUE |
| 2 | 1 | 3 | `a` = `a` | TRUE |
| 3 | 2 | 2 | (stop : `left < right` faux) | TRUE |

Résultat : **TRUE**.

Contre-exemple `"abc"` (`n = 3`) : dès la 1ʳᵉ paire, `a` ≠ `c` → `isPal = FALSE`.

## Variante : inverser puis comparer

```text
n = LENGTH(text)
rev = ""
FOR i = n - 1 TO 0 STEP -1 DO
  rev = rev + text[i]
END FOR
IF text = rev THEN
  OUTPUT TRUE
ELSE
  OUTPUT FALSE
END IF
```

- On **construit** l'envers dans `rev`
- Puis comparaison globale `text = rev`
- Utile si on a **aussi** besoin de la chaîne inversée

Deux pointeurs : souvent plus direct si on veut seulement un booléen.

## Pièges fréquents

1. Oublier `n = LENGTH(text)` avant le `FOR`
2. Bornes : `TO n` au lieu de `TO n - 1` (hors bornes)
3. Confondre **indice** et **caractère** (`i` vs `text[i]`)
4. Concaténation : partir de `""`, pas d'une valeur « magique »
5. Palindrome : s'arrêter quand `left >= right` (ne pas croiser sans test)
6. Sensibilité à la casse : `"A"` ≠ `"a"` (sauf consigne contraire)

## Checklist

1. Ai-je la **longueur** `n` ?
2. Indices de **0** à **n - 1** inclus ?
3. Est-ce un **parcours** (`FOR`), un **compte**, une **construction** ?
4. Pour un palindrome : deux pointeurs **ou** reverse + compare ?

## Synthèse

| Idée | À retenir |
| --- | --- |
| `STRING` | suite ordonnée de caractères |
| `LENGTH` | taille `n`, indices `0..n-1` |
| `text[i]` | caractère à la position `i` |
| Parcours | `FOR i = 0 TO n - 1` |
| Compter | compteur + `IF text[i] = target` |
| Construire | `result = ""` puis `result = result + …` |
| Palindrome | deux pointeurs, ou reverse + compare |

## Quiz

Questions pour tester la compréhension du contenu de la séance.

[Quiz](quiz_seance_06.html)

## Exercice 6.A : Compter les voyelles

Chaîne `word`. Compter les voyelles `a e i o u` (minuscules seulement).

Données de trace : `word = "education"`.

[Exercices](exercices_seance_06.html) § 6.A

## Exercice 6.B : Inverser une chaîne

Construire `rev`, l'envers de `text`, caractère par caractère.

Données de trace : `text = "method"`.

[Exercices](exercices_seance_06.html) § 6.B

## Exercice 6.C : Palindrome (trace)

Tracer l'algo à deux pointeurs sur une chaîne donnée. Dire si c'est un palindrome.

Données de trace : `text = "level"`, puis `text = "lemma"`.

[Exercices](exercices_seance_06.html) § 6.C

## Exercice 6.D : Filtrer les chiffres

À partir de `raw`, construire `digits` avec **uniquement** les caractères `'0'`…`'9'`.

Données de trace : `raw = "a1b23c"`.

[Exercices](exercices_seance_06.html) § 6.D

## Exercice 6.E : Construire un message

Lire `title` et `n`. Afficher une ligne de `n` étoiles, puis `title`, puis encore `n` étoiles.

Données de trace : `title = "ISIB"`, `n = 5`.

[Exercices](exercices_seance_06.html) § 6.E

<nav class="page-nav">
  <a href="../../index.html">Accueil</a>
  <a href="cours_seance_06.html">Slides</a>
  <a href="quiz_seance_06.html">Quiz</a>
  <a href="exercices_seance_06.html">Exercices</a>
</nav>

<footer class="site-footer"><a href="mailto:shuraux@he2b.be">Sylvain Huraux - HE2B - ISIB</a></footer>
