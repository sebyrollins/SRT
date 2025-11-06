# PROMPT EXACT ENVOYÉ À L'API CLAUDE

## Structure de l'appel API

```json
{
  "model": "claude-sonnet-4-5-20250929",
  "max_tokens": 64000,
  "temperature": 0,
  "system": [
    {
      "type": "text",
      "text": "[VOIR CI-DESSOUS: SYSTEM PROMPT]",
      "cache_control": { "type": "ephemeral" }
    }
  ],
  "messages": [
    {
      "role": "user",
      "content": "[VOIR CI-DESSOUS: USER PROMPT]"
    }
  ]
}
```

---

## SYSTEM PROMPT (envoyé tel quel)

```
Corrige toutes les fautes de français dans ce fichier SRT.

Règles simples :
- rendez vous → rendez-vous
- c'est a dire → c'est-à-dire
- peut etre → peut-être
- c est → c'est
- "texte" → « texte »
- Bonjour? → Bonjour ?

AMBIGUÏTÉ DE GENRE (type "doubt") :
- "je suis venu" peut être "je suis venue" (si femme qui parle)

Retourne le JSON suivant :
{"blocks": [{"index": 1, "original": "texte exact", "corrected": "texte corrigé", "corrections": [{"type": "major", "original": "rendez vous", "corrected": "rendez-vous", "reason": "Tiret manquant", "position": 12}]}]}

Types : "major" (fautes importantes), "minor" (typographie), "doubt" (ambiguïté genre)
```

---

## USER PROMPT (exemple avec votre fichier example.srt)

```
Corrige ce fichier SRT :

1
00:00:01,000 --> 00:00:03,500
Bonjour, c est un test de correction.

2
00:00:04,000 --> 00:00:07,000
L'organisation mondiale de la santé
a publié un rapport.

3
00:00:07,500 --> 00:00:10,000
Il y avait 10000 personnes présentes
en 2024 pour cet évènement.

4
00:00:10,500 --> 00:00:13,000
Il était peut être là,
mais je ne suis pas sur.

5
00:00:13,500 --> 00:00:16,000
Les régles de typographie française
sont importantes !

6
00:00:16,500 --> 00:00:19,000
J'aime les guillemets "francais"
et les points de suspension...

7
00:00:19,500 --> 00:00:22,000
Est-ce que vous avez compris?
C'est tres important.

8
00:00:22,500 --> 00:00:25,000
Nous avons analysé la situation,
et voici notre conclusion.

9
00:00:25,500 --> 00:00:28,000
Je suis venu hier
pour discuter de ce projet.

10
00:00:28,500 --> 00:00:31,000
Ils ont compris l'importance
d'organiser un rendez vous urgent.

11
00:00:31,500 --> 00:00:34,000
C est a dire que nous devons
préparer le dossier maintenant.

12
00:00:34,500 --> 00:00:37,000
À dire vrai, je ne suis pas
entièrement convaincu.
```

---

## PROBLÈME POTENTIEL IDENTIFIÉ

Le **SYSTEM PROMPT** demande un format JSON strict avec positions exactes :

```json
{"blocks": [{"index": 1, "original": "texte exact", "corrected": "texte corrigé", "corrections": [{"type": "major", "original": "rendez vous", "corrected": "rendez-vous", "reason": "Tiret manquant", "position": 12}]}]}
```

Cette contrainte JSON avec `position` exacte peut **bloquer** Claude et le rendre trop conservateur.

---

## POUR COMPARER DANS CLAUDE.AI

Copiez EXACTEMENT ceci dans une conversation Claude :

### Message 1 (System instructions - collé au début) :
```
Corrige toutes les fautes de français dans ce fichier SRT.

Règles simples :
- rendez vous → rendez-vous
- c'est a dire → c'est-à-dire
- peut etre → peut-être
- c est → c'est
- "texte" → « texte »
- Bonjour? → Bonjour ?

AMBIGUÏTÉ DE GENRE (type "doubt") :
- "je suis venu" peut être "je suis venue" (si femme qui parle)

Retourne le JSON suivant :
{"blocks": [{"index": 1, "original": "texte exact", "corrected": "texte corrigé", "corrections": [{"type": "major", "original": "rendez vous", "corrected": "rendez-vous", "reason": "Tiret manquant", "position": 12}]}]}

Types : "major" (fautes importantes), "minor" (typographie), "doubt" (ambiguïté genre)
```

### Message 2 (User prompt - votre fichier) :
```
Corrige ce fichier SRT :

[COLLEZ ICI LE CONTENU EXACT DE VOTRE FICHIER SRT]
```

---

## SI CLAUDE.AI CORRIGE MIEUX QUE LE WORKER

Cela signifie que la **contrainte JSON** est le problème. Solution :
- Retirer l'exigence de `position` exacte
- Simplifier encore plus le format de sortie
- Ou parser la réponse text de Claude différemment
