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
 * Analyse la complexité d'un chunk pour choisir le meilleur modèle
 * @param {Array} blocks - Blocs SRT à analyser
 * @returns {string} - 'haiku' (rapide) ou 'sonnet' (qualité)
 */
function analyzeChunkComplexity(blocks) {
  // Critères de complexité qui nécessitent Sonnet :
  // 1. Blocs très longs (> 150 caractères) = grammaire complexe probable
  // 2. Nombreux dialogues/guillemets = contexte complexe
  // 3. Texte avec beaucoup de ponctuation = phrases longues

  const textSample = blocks.map(b => b.text).join(' ')
  const avgLength = textSample.length / blocks.length
  const hasComplexPunctuation = (textSample.match(/[;:,]/g) || []).length > blocks.length * 2
  const hasDialogues = (textSample.match(/[«»"]/g) || []).length > 4

  // Si complexe → Sonnet (qualité), sinon → Haiku (vitesse)
  if (avgLength > 150 || hasComplexPunctuation || hasDialogues) {
    return 'sonnet'
  }
  return 'haiku'
}

/**
 * Traitement du contenu SRT avec Claude (optimisé avec parallélisme)
 * Utilise Sonnet pour garantir la qualité maximale sur toutes les règles
 */
async function processSRT(srtContent) {
  // Parse les blocs SRT
  const blocks = parseSRTBlocks(srtContent)

  // CHUNK SIZE : Équilibre entre contexte et attention de Claude
  // Trop petit = manque de contexte, trop grand = Claude manque des erreurs
  const maxBlocksPerChunk = 75 // Optimisé pour qualité de détection
  const chunks = []

  for (let i = 0; i < blocks.length; i += maxBlocksPerChunk) {
    chunks.push(blocks.slice(i, i + maxBlocksPerChunk))
  }

  console.log(`[processSRT] Processing ${blocks.length} blocks in ${chunks.length} chunks with SINGLE-pass system...`)
  const startTime = Date.now()

  // ═══════════════════════════════════════════════════════════════
  // PASSE UNIQUE : Toutes les corrections françaises
  // ═══════════════════════════════════════════════════════════════
  console.log(`[processSRT] === Correcting ${chunks.length} chunks in parallel ===`)

  const correctedChunks = await Promise.all(
    chunks.map(chunk => correctWithClaude(chunk, 'sonnet'))
  )
  const correctedBlocks = correctedChunks.flat()

  // Fusionner les blocs corrigés avec TOUS les blocs originaux
  // Claude ne retourne que les blocs avec corrections, on doit rajouter les autres
  const correctedMap = new Map()
  correctedBlocks.forEach(block => correctedMap.set(block.index, block))

  const finalBlocks = blocks.map(originalBlock => {
    const correctedBlock = correctedMap.get(originalBlock.index)
    if (correctedBlock) {
      // Utiliser le bloc corrigé par Claude
      return correctedBlock
    } else {
      // Pas de corrections, garder l'original
      return {
        index: originalBlock.index,
        timecode: originalBlock.timecode,
        original: originalBlock.text,
        corrected: originalBlock.text,  // Identique à l'original
        corrections: []  // Aucune correction
      }
    }
  })

  const endTime = Date.now()
  console.log(`[processSRT] Total processing time: ${endTime - startTime}ms`)

  return finalBlocks
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
 * Nettoie les annotations entre parenthèses du texte
 * Exemple : "je salue (accord neutre)" → "je salue"
 */
function cleanAnnotations(text) {
  if (!text) return text

  // Supprimer les annotations entre parenthèses à la fin du texte
  // Pattern: texte suivi optionnellement d'un espace puis (annotation)
  return text.replace(/\s*\([^)]*\)\s*$/g, '').trim()
}

/**
 * Applique les corrections au texte original
 * Si Claude n'a pas appliqué les corrections dans le champ "corrected", on le fait nous-mêmes
 */
function applyCorrections(originalText, corrections) {
  if (!corrections || corrections.length === 0) {
    return originalText
  }

  let correctedText = originalText

  // Appliquer chaque correction
  for (const correction of corrections) {
    if (correction.original && correction.corrected) {
      // D'abord essayer un remplacement exact (case-sensitive)
      if (correctedText.includes(correction.original)) {
        correctedText = correctedText.split(correction.original).join(correction.corrected)
      } else {
        // Si pas trouvé, essayer case-insensitive pour gérer les inconsistances de Claude
        // Créer une regex case-insensitive pour trouver le texte
        const escapedOriginal = correction.original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const regex = new RegExp(escapedOriginal, 'gi')

        // Vérifier s'il y a une correspondance
        const match = correctedText.match(regex)
        if (match && match[0]) {
          // Préserver la casse du premier caractère si c'était une majuscule
          let replacement = correction.corrected
          if (match[0][0] === match[0][0].toUpperCase() &&
              correction.corrected[0] === correction.corrected[0].toLowerCase()) {
            // Le texte original commence par une majuscule mais la correction par une minuscule
            // Mettre la première lettre de la correction en majuscule
            replacement = correction.corrected[0].toUpperCase() + correction.corrected.slice(1)
          }

          correctedText = correctedText.replace(regex, replacement)
          console.log(`[applyCorrections] Case-insensitive replacement: "${match[0]}" → "${replacement}"`)
        }
      }
    }
  }

  return correctedText
}

/**
 * System prompt ultra-simple (comme l'utilisateur fait directement)
 */
function buildSystemPrompt() {
  return `Corrige toutes les fautes de français dans ce fichier SRT.

Exemples de corrections :
- rendez vous → rendez-vous
- c'est a dire → c'est-à-dire
- peut etre → peut-être
- c est → c'est
- "texte" → « texte »
- Bonjour? → Bonjour ?
- 10000 → 10 000 (espace milliers)
- 1000e → 1 000e (espace milliers même avec ordinal)
- 1000ᵉ → 1 000ᵉ (espace milliers même avec ordinal)

MAJUSCULES INSTITUTIONS (type "major") :
- le gouvernement → le Gouvernement
- l'assemblée nationale → l'Assemblée nationale
- le sénat → le Sénat
- le parlement → le Parlement

RÈGLE SPÉCIALE MINISTÈRES :
- "ministère" en minuscule
- Première lettre des mots thématiques en MAJUSCULE
Exemples :
- le ministère de la transition écologique → le ministère de la Transition écologique
- le ministère de l'intérieur → le ministère de l'Intérieur
- le ministère des affaires étrangères → le ministère des Affaires étrangères

AMBIGUÏTÉ DE GENRE - 1ère personne avec accord (type "doubt") :
Quand on utilise "je" avec un adjectif ou participe qui s'accorde, le genre est ambigu.
Suggérer l'AUTRE forme comme correction possible :

Avec ÊTRE au passé composé :
- "je suis venu" → suggérer "venue" (reason: "Si femme qui parle : venue")
- "je suis venue" → suggérer "venu" (reason: "Si homme qui parle : venu")
- "je suis allé" → suggérer "allée" (reason: "Si femme qui parle : allée")
- "je suis allée" → suggérer "allé" (reason: "Si homme qui parle : allé")

Avec SEMBLER, PARAÎTRE, DEVENIR, RESTER + adjectif :
- "je semble perdu" → suggérer "perdue" (reason: "Si femme qui parle : perdue")
- "je semble perdue" → suggérer "perdu" (reason: "Si homme qui parle : perdu")
- "je parais fatigué" → suggérer "fatiguée" (reason: "Si femme qui parle : fatiguée")
- "je deviens nerveux" → suggérer "nerveuse" (reason: "Si femme qui parle : nerveuse")
- "je reste concentré" → suggérer "concentrée" (reason: "Si femme qui parle : concentrée")

Participes avec "je suis" :
venu(e), allé(e), parti(e), arrivé(e), resté(e), devenu(e), rentré(e), sorti(e), tombé(e), né(e)

Format de réponse JSON :
{
  "blocks": [
    {
      "index": 1,
      "original": "texte EXACT du bloc (non modifié)",
      "corrected": "texte du bloc avec TOUTES les corrections APPLIQUÉES",
      "corrections": [
        {"type": "major", "original": "rendez vous", "corrected": "rendez-vous", "reason": "Tiret manquant"}
      ]
    }
  ]
}

IMPORTANT:
- "original" = texte tel quel, sans rien changer
- "corrected" = texte avec TOUTES les fautes corrigées (appliquer toutes les corrections)
- "corrections" = liste des corrections individuelles

Exemple concret:
Si le texte est "Je suis allé au rendez vous hier"
Alors:
- "original": "Je suis allé au rendez vous hier"
- "corrected": "Je suis allé au rendez-vous hier"  (avec le tiret appliqué!)
- "corrections": [{"original": "rendez vous", "corrected": "rendez-vous", ...}]

Types : "major" (fautes importantes), "minor" (typographie), "doubt" (ambiguïté genre)
Si aucune correction dans un bloc, ne pas inclure le bloc dans la réponse.`
}

/**
 * Construit le user prompt au format SRT natif (comme l'utilisateur fait)
 */
function buildUserPrompt(blocks) {
  // Garder le format SRT original avec timecodes
  const srtText = blocks.map(b => `${b.index}\n${b.timecode}\n${b.text}`).join('\n\n')
  return `Corrige ce fichier SRT :

${srtText}`
}

/**
 * Retry avec exponential backoff pour les erreurs API
 */
async function fetchWithRetry(url, options, maxRetries = 4) {
  const delays = [2000, 4000, 8000, 16000] // 2s, 4s, 8s, 16s

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options)

      // Si erreur 529 (overloaded) ou 429 (rate limit), retry
      if (response.status === 529 || response.status === 429) {
        if (attempt < maxRetries) {
          const delay = delays[attempt]
          const errorType = response.status === 529 ? 'API overloaded' : 'Rate limit'
          console.log(`[fetchWithRetry] ${errorType} (${response.status}), retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`)
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }
      }

      return response
    } catch (error) {
      // Erreur réseau
      if (attempt < maxRetries) {
        const delay = delays[attempt]
        console.log(`[fetchWithRetry] Network error, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`)
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
      throw error
    }
  }

  throw new Error('Max retries exceeded')
}

/**
 * Correction avec Claude + Prompt Caching
 * @param {Array} blocks - Blocs SRT à corriger
 * @param {string} modelType - Type de modèle : 'sonnet' (qualité max) ou 'haiku' (vitesse max)
 */
async function correctWithClaude(blocks, modelType = 'sonnet') {
  // Choisir le modèle selon le type
  const modelConfig = {
    sonnet: {
      name: 'claude-sonnet-4-5-20250929',
      maxTokens: 64000
    },
    haiku: {
      name: 'claude-haiku-4-5',
      maxTokens: 64000
    }
  }

  const config = modelConfig[modelType] || modelConfig.sonnet
  const systemPrompt = buildSystemPrompt()

  console.log(`[correctWithClaude] Using model: ${config.name} for ${blocks.length} blocks`)

  const response = await fetchWithRetry('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: config.name,
      max_tokens: config.maxTokens,
      temperature: 0,
      system: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" }
        }
      ],
      messages: [{
        role: 'user',
        content: buildUserPrompt(blocks)
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

    // Réinjecter les timecodes et valider les corrections
    return correctedBlocks.map(correctedBlock => {
      const originalBlock = blocks.find(b => b.index === correctedBlock.index)

      // Accepter toutes les corrections de Claude sans validation de position stricte
      // Claude sait ce qu'il corrige, on lui fait confiance
      let validatedCorrections = []
      if (correctedBlock.corrections && correctedBlock.corrections.length > 0) {
        // Juste s'assurer que les champs essentiels existent
        validatedCorrections = correctedBlock.corrections.filter(correction => {
          return correction.original && correction.corrected && correction.reason && correction.type
        }).map(correction => {
          // Nettoyer les annotations dans les corrections individuelles
          return {
            ...correction,
            corrected: cleanAnnotations(correction.corrected)
          }
        })
      }

      // Récupérer le texte original depuis NOS blocs parsés (source de vérité)
      // Ne PAS faire confiance à correctedBlock.original qui peut être incorrect
      const originalText = originalBlock ? originalBlock.text : ''

      // TOUJOURS reconstruire le texte corrigé nous-mêmes
      // Ne JAMAIS faire confiance à correctedBlock.corrected de Claude (peut être incorrect)
      let correctedText = originalText
      if (validatedCorrections.length > 0) {
        // Appliquer les corrections sur notre texte original
        correctedText = applyCorrections(originalText, validatedCorrections)
        console.log(`[correctWithClaude] Bloc ${correctedBlock.index}: Applied ${validatedCorrections.length} corrections`)
      }

      return {
        ...correctedBlock,
        timecode: originalBlock ? originalBlock.timecode : 'undefined',
        original: originalText,
        corrected: correctedText,
        corrections: validatedCorrections
      }
    })
  } catch (e) {
    console.error('Erreur parsing réponse Claude:', e)
    console.error('Contenu reçu:', content)
    throw new Error('Format de réponse invalide')
  }
}
