/**
 * Cloudflare Worker pour la correction de fichiers SRT
 * Utilise l'API Claude Sonnet 4 pour corriger le texte
 */

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

/**
 * Gestion de la requête principale
 */
async function handleRequest(request) {
  // CORS headers pour permettre les appels depuis le frontend
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  }

  // Gestion des requêtes OPTIONS (preflight)
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Seules les requêtes POST sont acceptées
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), {
      status: 405,
      headers: corsHeaders
    })
  }

  try {
    const data = await request.json()
    const { srtContent, fileName } = data

    if (!srtContent) {
      return new Response(JSON.stringify({ error: 'Contenu SRT manquant' }), {
        status: 400,
        headers: corsHeaders
      })
    }

    // Traitement du contenu SRT
    const result = await processSRT(srtContent)

    return new Response(JSON.stringify({
      success: true,
      data: result,
      fileName: fileName
    }), {
      status: 200,
      headers: corsHeaders
    })

  } catch (error) {
    console.error('Erreur lors du traitement:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Erreur lors du traitement'
    }), {
      status: 500,
      headers: corsHeaders
    })
  }
}

/**
 * Traitement du contenu SRT avec Claude
 */
async function processSRT(srtContent) {
  // Parse les blocs SRT
  const blocks = parseSRTBlocks(srtContent)

  // Si le contenu est trop volumineux, on découpe par chunks
  const maxBlocksPerChunk = 50 // ~3000-4000 tokens par chunk
  const chunks = []

  for (let i = 0; i < blocks.length; i += maxBlocksPerChunk) {
    chunks.push(blocks.slice(i, i + maxBlocksPerChunk))
  }

  // Traitement de chaque chunk
  const correctedChunks = []
  for (const chunk of chunks) {
    const corrected = await correctWithClaude(chunk)
    correctedChunks.push(...corrected)
  }

  return correctedChunks
}

/**
 * Parse le contenu SRT en blocs
 */
function parseSRTBlocks(srtContent) {
  const blocks = []
  const lines = srtContent.split('\n')

  let currentBlock = { index: null, timecode: null, text: [] }
  let lineIndex = 0

  while (lineIndex < lines.length) {
    const line = lines[lineIndex].trim()

    // Ligne vide = fin de bloc
    if (line === '') {
      if (currentBlock.index !== null && currentBlock.text.length > 0) {
        blocks.push({
          index: currentBlock.index,
          timecode: currentBlock.timecode,
          text: currentBlock.text.join('\n').trim()
        })
        currentBlock = { index: null, timecode: null, text: [] }
      }
      lineIndex++
      continue
    }

    // Détection de l'index (nombre seul)
    if (/^\d+$/.test(line) && currentBlock.index === null) {
      currentBlock.index = parseInt(line)
      lineIndex++
      continue
    }

    // Détection du timecode
    if (/^\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}$/.test(line)) {
      currentBlock.timecode = line
      lineIndex++
      continue
    }

    // Texte du sous-titre
    if (currentBlock.index !== null && currentBlock.timecode !== null) {
      currentBlock.text.push(line)
    }

    lineIndex++
  }

  // Ajouter le dernier bloc si nécessaire
  if (currentBlock.index !== null && currentBlock.text.length > 0) {
    blocks.push({
      index: currentBlock.index,
      timecode: currentBlock.timecode,
      text: currentBlock.text.join('\n').trim()
    })
  }

  return blocks
}

/**
 * Correction avec Claude Sonnet 4
 */
async function correctWithClaude(blocks) {
  const prompt = buildPrompt(blocks)

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 16000,
      temperature: 0,
      messages: [{
        role: 'user',
        content: prompt
      }]
    })
  })

  if (!response.ok) {
    const errorData = await response.text()
    throw new Error(`Erreur API Claude: ${response.status} - ${errorData}`)
  }

  const result = await response.json()
  let content = result.content[0].text

  // Nettoyer la réponse (enlever les balises markdown si présentes)
  // Claude Sonnet 4.5 retourne parfois ```json ... ``` au lieu de JSON pur
  content = content.trim()
  if (content.startsWith('```json')) {
    content = content.replace(/^```json\s*/, '').replace(/\s*```$/, '')
  } else if (content.startsWith('```')) {
    content = content.replace(/^```\s*/, '').replace(/\s*```$/, '')
  }

  // Parse la réponse JSON de Claude
  try {
    const parsed = JSON.parse(content.trim())
    const correctedBlocks = parsed.blocks || []

    // Réinjecter les timecodes depuis les blocs originaux
    return correctedBlocks.map(correctedBlock => {
      const originalBlock = blocks.find(b => b.index === correctedBlock.index)
      return {
        ...correctedBlock,
        timecode: originalBlock ? originalBlock.timecode : 'undefined'
      }
    })
  } catch (e) {
    console.error('Erreur parsing réponse Claude:', e)
    console.error('Contenu reçu:', content)
    throw new Error('Format de réponse invalide')
  }
}

/**
 * Construction du prompt pour Claude
 */
function buildPrompt(blocks) {
  const blocksText = blocks.map(b => `[Bloc ${b.index}]\n${b.text}`).join('\n\n')

  return `Tu es un correcteur professionnel français expert et secrétaire de rédaction.

MISSION : Corrige ce texte de sous-titres SRT en respectant scrupuleusement :
- Orthographe, grammaire, conjugaison, ponctuation
- Typographie française professionnelle :
  * Majuscules pour les institutions DÉFINIES :
    - "le gouvernement" → "le Gouvernement" (quand = institution française actuelle)
    - "l'assemblée nationale" → "l'Assemblée nationale"
    - "le sénat" → "le Sénat"
    - "le parlement européen" → "le Parlement européen"
    - Règle MINISTÈRES UNIQUEMENT (importante) :
      * "ministère" reste en minuscule
      * Premier mot de CHAQUE secteur en majuscule
      * Exemple : "le ministère de la Transition écologique, de la Biodiversité et des Négociations internationales"
      * Autre exemple : "le ministère de l'Économie, des Finances et de la Souveraineté industrielle"
    - Règle AUTRES INSTITUTIONS (agences, autorités, etc.) :
      * Seul le premier mot significatif prend une majuscule, le reste en minuscule
      * Exemple : "l'Agence nationale de la cohésion des territoires" (PAS "de la Cohésion")
      * Exemple : "l'Autorité de régulation des communications électroniques"
      * Exemple : "l'Organisation mondiale de la santé"
  * Espaces insécables avant : ; ! ? (espace fine)
  * Apostrophes typographiques ' (pas ')
  * Espaces insécables pour les milliers : 10 000 (SAUF années : 2024)
  * Guillemets français « » avec espaces insécables
  * Points de suspension … (caractère unique)

IMPORTANT : Retourne UNIQUEMENT un JSON valide (pas de markdown, pas de \`\`\`json) avec cette structure EXACTE :

{
  "blocks": [
    {
      "index": 1,
      "original": "texte original exact",
      "corrected": "texte corrigé",
      "corrections": [
        {
          "type": "major",
          "original": "rendez vous",
          "corrected": "rendez-vous",
          "reason": "Tiret obligatoire",
          "position": 0
        }
      ]
    }
  ]
}

CATÉGORISATION PROFESSIONNELLE (très important) :
- "minor" : corrections typographiques et cosmétiques
  * Apostrophes droites → courbes : remplacer ' par ' (ex: "l'eau" → "l'eau")
  * Guillemets droits → guillemets français : remplacer " par « » (ex: "bonjour" → « bonjour »)
  * Trois points → points de suspension : remplacer ... par … (ex: "et..." → "et…")
  * Espaces doubles difficiles à voir
  * Espaces insécables avant ponctuation (: ; ! ?)
  * Micro-ajustements typographiques subtils
  * IMPORTANT: Ces corrections sont VISUELLEMENT invisibles mais techniquement différentes

- "major" : corrections professionnelles visibles et certaines
  * Tirets manquants (rendez vous → rendez-vous)
  * Apostrophes MANQUANTES pour élision : AJOUTER une apostrophe (ex: "c est" → "c'est", "l eau" → "l'eau")
  * Fautes d'orthographe (language → langage)
  * Accord sujet-verbe (ils à fait → ils ont fait)
  * Conjugaison incorrecte (Il à pris → Il a pris)
  * Majuscules institutions définies (le gouvernement → le Gouvernement)
  * Majuscules début de phrase
  * Ponctuation manquante ou incorrecte

- "doubt" : corrections avec ambiguïté possible
  * Choix stylistiques subjectifs
  * Contexte ambigu nécessitant interprétation
  * Plusieurs interprétations possibles
  * Liaison peut-être/peut être selon contexte
  * Reformulations qui changent légèrement le sens

RÈGLES STRICTES :
1. Garde l'index exact du bloc original
2. Si aucune correction nécessaire : corrections = []
3. Reason doit être courte et claire (max 60 caractères)
4. Position = index du début de la correction dans le texte original
5. Ne change PAS le sens ou le style, uniquement les erreurs
6. CRITIQUE: Le champ "original" doit contenir EXACTEMENT le texte du fichier original (sans modification)
   - Si le fichier contient "l'eau" (apostrophe droite '), le champ original doit être "l'eau" (apostrophe droite ')
   - Si le fichier contient "Assemblée", le champ original doit être "Assemblée" (même texte, même caractères)
   - NE PAS corriger le texte dans le champ "original", garde-le TEL QUEL
7. Le champ "corrected" contient la version corrigée
   - Exemple: original="l'eau" corrected="l'eau" (apostrophe droite → courbe)
8. Ne crée JAMAIS de correction où "original" et "corrected" sont identiques caractère par caractère

TEXTE À CORRIGER :

${blocksText}

Retourne uniquement le JSON, rien d'autre.`
}
