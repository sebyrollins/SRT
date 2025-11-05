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

  // CHUNK SIZE OPTIMISÉ pour qualité maximale sur règles spécifiques
  // Réduit à 25 blocs - tests montrent que 40 blocs trop grand pour fichiers longs
  // Chunks très petits = Claude applique TOUJOURS les règles
  const maxBlocksPerChunk = 25
  const chunks = []

  for (let i = 0; i < blocks.length; i += maxBlocksPerChunk) {
    chunks.push(blocks.slice(i, i + maxBlocksPerChunk))
  }

  console.log(`[processSRT] Processing ${blocks.length} blocks in ${chunks.length} chunks with 2-pass system...`)
  const startTime = Date.now()

  // ═══════════════════════════════════════════════════════════════
  // PASSE 1 : Correction des TIRETS uniquement (inversions, noms composés)
  // ═══════════════════════════════════════════════════════════════
  console.log(`[processSRT] === PASS 1: Hyphen corrections (${chunks.length} chunks in parallel) ===`)
  const pass1Start = Date.now()

  const correctedChunksPass1 = await Promise.all(
    chunks.map(chunk => correctWithClaude(chunk, 'sonnet', 1))
  )
  const blocksAfterPass1 = correctedChunksPass1.flat()

  const pass1End = Date.now()
  console.log(`[processSRT] Pass 1 completed in ${pass1End - pass1Start}ms`)

  // ═══════════════════════════════════════════════════════════════
  // PASSE 2 : Toutes les autres corrections (grammaire, orthographe, typo)
  // ═══════════════════════════════════════════════════════════════
  console.log(`[processSRT] === PASS 2: All other corrections (${chunks.length} chunks in parallel) ===`)
  const pass2Start = Date.now()

  // Préparer les blocs pour Pass 2 : le texte "corrected" de Pass 1 devient le point de départ
  // On garde les corrections de Pass 1 et on ajoutera celles de Pass 2
  const blocksForPass2 = blocksAfterPass1.map(block => ({
    index: block.index,
    timecode: block.timecode,
    text: block.corrected, // Le texte corrigé de Pass 1 devient le texte de départ pour Pass 2
    original: block.original, // On garde l'original pour traçabilité
    correctionsPass1: block.corrections || [] // Sauvegarder les corrections de Pass 1
  }))

  // Re-découper les blocs pour passe 2
  const chunksPass2 = []
  for (let i = 0; i < blocksForPass2.length; i += maxBlocksPerChunk) {
    chunksPass2.push(blocksForPass2.slice(i, i + maxBlocksPerChunk))
  }

  const correctedChunksPass2 = await Promise.all(
    chunksPass2.map(chunk => correctWithClaude(chunk, 'sonnet', 2))
  )

  // Fusionner les corrections des 2 passes
  const finalBlocks = correctedChunksPass2.flat().map((block, idx) => {
    const correspondingPass1Block = blocksAfterPass1[idx]
    return {
      ...block,
      original: correspondingPass1Block.original, // IMPORTANT: Garder le vrai original (avant Pass 1)
      corrections: [
        ...(correspondingPass1Block.corrections || []),
        ...(block.corrections || [])
      ]
    }
  })

  const pass2End = Date.now()
  console.log(`[processSRT] Pass 2 completed in ${pass2End - pass2Start}ms`)

  const endTime = Date.now()
  console.log(`[processSRT] Total processing time: ${endTime - startTime}ms (Pass 1: ${pass1End - pass1Start}ms, Pass 2: ${pass2End - pass2Start}ms)`)

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
 * Construit le system prompt PASSE 1 : Tirets uniquement
 * Prompt ultra-court et focalisé pour 100% de détection des tirets
 */
function buildSystemPromptPass1() {
  return `Tu es un correcteur professionnel français spécialisé dans la ponctuation.

MISSION UNIQUE : Détecte et corrige UNIQUEMENT les tirets manquants. Ignore tout le reste.

RÈGLES TIRETS (à appliquer systématiquement) :

1. INVERSIONS VERBE-SUJET dans questions :
   • "pensez vous" → "pensez-vous"
   • "qu'en pensez vous" → "qu'en pensez-vous"
   • "allez vous" → "allez-vous"
   • "avez vous" → "avez-vous"
   • Règle : TOUT verbe + (vous/tu/il/elle/on) dans question = TIRET OBLIGATOIRE

2. NOMS COMPOSÉS :
   • "avant première" → "avant-première"
   • "au delà" → "au-delà"
   • "rendez vous" → "rendez-vous"
   • "week end" → "week-end"
   • "arc en ciel" → "arc-en-ciel"

3. LOCUTIONS FIGÉES :
   • "c'est a dire" → "c'est-à-dire"
   • "c est a dire" → "c'est-à-dire"
   • "peut etre" → "peut-être"
   • "vis a vis" → "vis-à-vis"

IMPORTANT :
- NE corrige QUE les tirets manquants (type: "major")
- Ignore orthographe, grammaire, majuscules, espaces, guillemets, etc.
- Si aucun tiret manquant : corrections = []

Retourne UNIQUEMENT un JSON valide (pas de markdown) :
{
  "blocks": [
    {
      "index": 1,
      "original": "texte original exact",
      "corrected": "texte avec tirets corrigés",
      "corrections": [
        {
          "type": "major",
          "original": "pensez vous",
          "corrected": "pensez-vous",
          "reason": "Tiret inversion question",
          "position": 15
        }
      ]
    }
  ]
}

RÈGLES STRICTES :
1. Position = index exact (compte de 0) dans le texte original
2. "original" doit contenir EXACTEMENT le texte du fichier (tel quel)
3. Si aucune correction : corrections = []
4. Vérifie : text.substring(position, position + original.length) === original

Retourne uniquement le JSON, rien d'autre.`
}

/**
 * Construit le system prompt PASSE 2 : Toutes les autres corrections
 * Contient toutes les règles sauf les tirets (déjà traités en passe 1)
 */
function buildSystemPromptPass2() {
  return `Tu es un correcteur professionnel français expert et secrétaire de rédaction.

MISSION : Corrige ce texte de sous-titres SRT (les tirets ont déjà été corrigés en passe 1).

NE PAS RECORRIGER LES TIRETS - déjà traités.

RÈGLES À APPLIQUER :
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
  * Espaces insécables avant : ; ! ? UNIQUEMENT si complètement absents (ex: "Bonjour?" → "Bonjour ?")
  * NE PAS corriger si espace déjà présent (ex: "Bonjour ?" est correct, ne pas modifier)
  * Espaces insécables pour les milliers : 10 000, 1 000e, 2 500e (SAUF années : 2024)
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
  * Guillemets droits → guillemets français : remplacer " par « » (ex: "bonjour" → « bonjour »)
  * Trois points → points de suspension : remplacer ... par … (ex: "et..." → "et…")
  * Espaces insécables pour milliers : 10000 → 10 000, 1000e → 1 000e (SAUF années : 2024, 1789)
  * Espaces doubles difficiles à voir
  * Espaces insécables avant : ; ! ? UNIQUEMENT si absents (ex: "Bonjour?" → "Bonjour ?", mais "Bonjour ?" déjà correct)
  * Micro-ajustements typographiques subtils
  * IMPORTANT: Ces corrections sont VISUELLEMENT invisibles mais techniquement différentes

- "major" : corrections professionnelles visibles et certaines
  * Apostrophes MANQUANTES pour élision : AJOUTER une apostrophe (ex: "l eau" → "l'eau", "d accord" → "d'accord")
  * Fautes d'orthographe (language → langage)
  * Accord sujet-verbe (ils à fait → ils ont fait)
  * Accord des adjectifs en genre et nombre (ils sont beau → ils sont beaux, elle est grand → elle est grande)
  * Conjugaison incorrecte (Il à pris → Il a pris)
  * Majuscules institutions définies (le gouvernement → le Gouvernement)
  * Majuscules début de phrase SEULEMENT après . ! ? (PAS après virgule ou retour à la ligne)
  * Majuscules EN TROP après virgule : corriger en minuscule (", Mesdames" → ", mesdames")
  * Ponctuation manquante ou incorrecte

- "doubt" : corrections avec ambiguïté possible
  * Accord genre participe passé 1ère personne avec être/paraître/sembler/devenir/rester
    - "je suis venu" → "je suis venue" (reason: "Si femme qui parle : venue")
    - "je suis venue" → "je suis venu" (reason: "Si homme qui parle : venu")
    - Même logique pour : allé(e), resté(e), devenu(e), parti(e), arrivé(e), etc.
  * Choix stylistiques subjectifs
  * Contexte ambigu nécessitant interprétation
  * Plusieurs interprétations possibles
  * Liaison peut-être/peut être selon contexte
  * Reformulations qui changent légèrement le sens

RÈGLES STRICTES :
1. Garde l'index exact du bloc original
2. Si aucune correction nécessaire : corrections = []
3. Reason doit être courte et claire (max 60 caractères)
4. CRITIQUE - Position = index EXACT (compte de 0) du début de la correction dans le texte original
   - Les retours à la ligne \\n comptent comme UN caractère
   - Exemple: "Bonjour\\nle monde" → "le" commence à position 8 (B=0, o=1, n=2, j=3, o=4, u=5, r=6, \\n=7, l=8)
   - La position doit pointer EXACTEMENT où commence le texte à corriger
   - Vérifie que text.substring(position, position + original.length) === original
5. Ne change PAS le sens ou le style, uniquement les erreurs
6. CRITIQUE: Le champ "original" doit contenir EXACTEMENT le texte du fichier original (sans modification)
   - Si le fichier contient "l'eau" (apostrophe droite '), le champ original doit être "l'eau" (apostrophe droite ')
   - Si le fichier contient "Assemblée", le champ original doit être "Assemblée" (même texte, même caractères)
   - NE PAS corriger le texte dans le champ "original", garde-le TEL QUEL
   - IMPORTANT: Si le texte contient des retours à la ligne, inclus-les dans "original" si nécessaire
7. Le champ "corrected" contient la version corrigée
   - Exemple: original="l'eau" corrected="l'eau" (apostrophe droite → courbe)
8. Ne crée JAMAIS de correction où "original" et "corrected" sont identiques caractère par caractère
9. VÉRIFIE TOUJOURS que les corrections ne se chevauchent PAS (positions différentes sans overlap)

Retourne uniquement le JSON, rien d'autre.`
}

/**
 * Construit le user prompt (partie variable)
 * Contient uniquement les blocs SRT à corriger
 */
function buildUserPrompt(blocks) {
  const blocksText = blocks.map(b => `[Bloc ${b.index}]\n${b.text}`).join('\n\n')
  return `TEXTE À CORRIGER :

${blocksText}`
}

/**
 * Correction avec Claude + Prompt Caching
 * @param {Array} blocks - Blocs SRT à corriger
 * @param {string} modelType - Type de modèle : 'sonnet' (qualité max) ou 'haiku' (vitesse max)
 */
async function correctWithClaude(blocks, modelType = 'sonnet', pass = 1) {
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

  // Choisir le prompt selon la passe
  const systemPrompt = pass === 1 ? buildSystemPromptPass1() : buildSystemPromptPass2()

  console.log(`[correctWithClaude] Pass ${pass} - Using model: ${config.name} for ${blocks.length} blocks`)

  const response = await fetch('https://api.anthropic.com/v1/messages', {
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

      // Valider les corrections de ce bloc
      if (correctedBlock.corrections && correctedBlock.corrections.length > 0) {
        const validatedCorrections = correctedBlock.corrections.filter(correction => {
          // Vérifier que la position et la longueur sont valides
          const startPos = correction.position
          const endPos = startPos + correction.original.length
          const blockText = originalBlock ? originalBlock.text : correctedBlock.original

          if (!blockText || startPos < 0 || endPos > blockText.length) {
            console.warn(`Bloc ${correctedBlock.index}: Position invalide ${startPos}-${endPos} (texte length: ${blockText?.length})`)
            return false
          }

          // Vérifier que le texte à cette position correspond à correction.original
          const actualText = blockText.substring(startPos, endPos)
          if (actualText !== correction.original) {
            console.warn(`Bloc ${correctedBlock.index}: Texte ne correspond pas à position ${startPos}-${endPos}`)
            console.warn(`  Attendu: "${correction.original}"`)
            console.warn(`  Trouvé: "${actualText}"`)
            return false
          }

          return true
        })

        correctedBlock.corrections = validatedCorrections
      }

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
