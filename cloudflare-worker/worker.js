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
    const { srtContent, fileName, model } = data

    if (!srtContent) {
      return new Response(JSON.stringify({ error: 'Contenu SRT manquant' }), {
        status: 400,
        headers: corsHeaders
      })
    }

    // Déterminer le modèle à utiliser (haiku par défaut)
    const modelType = model === 'sonnet' ? 'sonnet' : 'haiku'
    console.log(`[handleRequest] Using model: ${modelType}`)

    // Traitement du contenu SRT
    const result = await processSRT(srtContent, modelType)

    return new Response(JSON.stringify({
      success: true,
      data: result,
      fileName: fileName
    }), {
      status: 200,
      headers: corsHeaders
    })

  } catch (error) {
    console.error('[handleRequest] Error during processing:', error.message)
    console.error('[handleRequest] Stack trace:', error.stack)
    console.error('[handleRequest] Error type:', error.constructor.name)

    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Erreur lors du traitement',
      errorType: error.constructor.name,
      timestamp: new Date().toISOString()
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
 * Détecte si un chunk nécessite une passe 2 pour ministères + formules de politesse
 * @param {Array} blocks - Blocs SRT à analyser
 * @returns {boolean} - true si le chunk nécessite une passe 2
 */
function needsSecondPass(blocks) {
  const text = blocks.map(b => b.text).join(' ')

  // PASSE 2 : Ministères + Monsieur/Madame/Mademoiselle
  return (
    /ministère/i.test(text) ||
    /\b(monsieur|madame|mademoiselle|mesdames|messieurs)/i.test(text)
  )
}

/**
 * Détecte si un chunk nécessite une passe 3 pour les autres règles spécifiques
 * @param {Array} blocks - Blocs SRT à analyser
 * @returns {boolean} - true si le chunk nécessite une passe 3
 */
function needsPass3(blocks) {
  const text = blocks.map(b => b.text).join(' ')

  // PASSE 3 : Les 4 règles restantes (ambiguïté genre maintenant en Pass 4)
  return (
    /gouvernement|assemblée|sénat|parlement/i.test(text) || // Institutions
    /\d{4,}e/i.test(text) ||                        // Ordinaux (1000e)
    /\d{1,3}(\d{3})+(?!\s)/.test(text) ||           // Milliers (10000)
    /au dela|par dessus/i.test(text) ||             // Traits d'union
    /\b(la|le|de|du|des)\s+[A-Z][a-z]+/.test(text)  // Majuscules abusives
  )
}

/**
 * Détecte si un chunk nécessite une passe 4 pour l'ambiguïté de genre
 * @param {Array} blocks - Blocs SRT à analyser
 * @returns {boolean} - true si le chunk nécessite une passe 4
 */
function needsPass4(blocks) {
  const text = blocks.map(b => b.text).join(' ')

  // PASSE 4 : UNIQUEMENT ambiguïté de genre
  // Détecter "je suis" + participe passé (terminaisons: é/ée/és/ées, i/ie/is/ies, u/ue/us/ues, t/te/ts/tes, s/se)
  // Note: \b ne fonctionne pas avec les accents en JS, donc on utilise un lookahead (?=\s|$) pour fin de mot
  return /\bje suis \S*?(?:é|ée|és|ées|i|ie|is|ies|u|ue|us|ues|t|te|ts|tes|se)(?=\s|$)/i.test(text)
}

/**
 * PASSE 0 : Prétraitement avec regex (règles déterministes)
 * Applique des corrections typographiques sûres sans appel API
 * @param {string} text - Texte à corriger
 * @returns {Object} - { corrected: string, corrections: Array }
 */
function preProcessWithRegex(text) {
  let corrected = text
  const corrections = []

  // 0. TRIM : Espaces en début/fin de ligne
  const trimmed = corrected.trim()
  if (trimmed !== corrected) {
    corrections.push({
      type: 'minor',
      original: corrected,
      corrected: trimmed,
      reason: 'Espaces en début/fin'
    })
    corrected = trimmed
  }

  // 1. ELLIPSIS : ... → …
  if (/\.\.\./.test(corrected)) {
    const matches = corrected.match(/\.\.\./g)
    if (matches) {
      corrections.push({
        type: 'minor',
        original: '...',
        corrected: '…',
        reason: 'Ellipsis typographique'
      })
      corrected = corrected.replace(/\.\.\./g, '…')
    }
  }

  // 2. ESPACES MULTIPLES : "  " → " "
  if (/ {2,}/.test(corrected)) {
    const beforeSpaces = corrected.match(/ {2,}/g)
    if (beforeSpaces && beforeSpaces.length > 0) {
      corrections.push({
        type: 'minor',
        original: beforeSpaces[0],
        corrected: ' ',
        reason: 'Espaces multiples'
      })
      corrected = corrected.replace(/ {2,}/g, ' ')
    }
  }

  // 3. ESPACE AVANT PONCTUATION SIMPLE : "texte ." → "texte."
  if (/ ([,.])/.test(corrected)) {
    const matches = corrected.match(/ ([,.])/g)
    if (matches) {
      corrections.push({
        type: 'minor',
        original: matches[0],
        corrected: matches[0].trim(),
        reason: 'Espace avant ponctuation'
      })
      corrected = corrected.replace(/ ([,.])/g, '$1')
    }
  }

  // 4. ESPACE INSÉCABLE APRÈS PONCTUATION HAUTE : ": " → ":\u00A0"
  const punctuationHaute = /([;:!?]) /g
  if (punctuationHaute.test(corrected)) {
    const matches = corrected.match(/([;:!?]) /g)
    if (matches) {
      corrections.push({
        type: 'minor',
        original: matches[0],
        corrected: matches[0].replace(' ', '\u00A0'),
        reason: 'Espace insécable après ponctuation haute'
      })
      corrected = corrected.replace(/([;:!?]) /g, '$1\u00A0')
    }
  }

  // 5. GUILLEMETS FRANÇAIS : "texte" → « texte »
  if (/"[^"]+"/g.test(corrected)) {
    const matches = corrected.match(/"([^"]+)"/g)
    if (matches) {
      corrections.push({
        type: 'minor',
        original: matches[0],
        corrected: matches[0].replace(/"/g, '«').replace(/«([^«]+)«/g, '«\u00A0$1\u00A0»'),
        reason: 'Guillemets français'
      })
      corrected = corrected.replace(/"([^"]+)"/g, '«\u00A0$1\u00A0»')
    }
  }

  // 6. ESPACES AVANT APOSTROPHES : "l' école" → "l'école"
  if (/\b([ldnjmtsc])'\s+/gi.test(corrected)) {
    const matches = corrected.match(/\b([ldnjmtsc])'\s+/gi)
    if (matches) {
      corrections.push({
        type: 'minor',
        original: matches[0],
        corrected: matches[0].replace(/'\s+/, "'"),
        reason: 'Espace après apostrophe'
      })
      corrected = corrected.replace(/\b([ldnjmtsc])'\s+/gi, "$1'")
    }
  }

  // 7. DOUBLES PONCTUATIONS : ",," → "," ou ";;" → ";"
  if (/([,;])\1/.test(corrected)) {
    const matches = corrected.match(/([,;])\1/g)
    if (matches) {
      corrections.push({
        type: 'minor',
        original: matches[0],
        corrected: matches[0][0],
        reason: 'Ponctuation doublée'
      })
      corrected = corrected.replace(/([,;])\1/g, '$1')
    }
  }

  // 8. ESPACE INSÉCABLE AVANT UNITÉS
  // Liste des unités courantes avec leurs variantes
  const unites = [
    // Pourcentage et degré
    { pattern: /(\d+)\s*%/g, replacement: '$1\u00A0%', unit: '%' },
    { pattern: /(\d+)\s*°([CF]?)/g, replacement: '$1\u00A0°$2', unit: '°' },

    // Longueur
    { pattern: /(\d+)\s*(m|mètres?|metres?)\b/gi, replacement: '$1\u00A0m', unit: 'm' },
    { pattern: /(\d+)\s*(km|kilomètres?|kilometres?)\b/gi, replacement: '$1\u00A0km', unit: 'km' },
    { pattern: /(\d+)\s*(cm|centimètres?|centimetres?)\b/gi, replacement: '$1\u00A0cm', unit: 'cm' },
    { pattern: /(\d+)\s*(mm|millimètres?|millimetres?)\b/gi, replacement: '$1\u00A0mm', unit: 'mm' },

    // Masse
    { pattern: /(\d+)\s*(kg|kilos?|kilogrammes?)\b/gi, replacement: '$1\u00A0kg', unit: 'kg' },
    { pattern: /(\d+)\s*(g|grammes?)\b/gi, replacement: '$1\u00A0g', unit: 'g' },

    // Énergie/Puissance
    { pattern: /(\d+)\s*(kW|kilowatts?|Kilowatts?)\b/gi, replacement: '$1\u00A0kW', unit: 'kW' },
    { pattern: /(\d+)\s*(W|watts?|Watts?)\b/gi, replacement: '$1\u00A0W', unit: 'W' },

    // Volume
    { pattern: /(\d+)\s*(l|litres?)\b/gi, replacement: '$1\u00A0l', unit: 'l' },
    { pattern: /(\d+)\s*(ml|millilitres?)\b/gi, replacement: '$1\u00A0ml', unit: 'ml' },

    // Temps
    { pattern: /(\d+)\s*(h|heures?)\b/gi, replacement: '$1\u00A0h', unit: 'h' },
    { pattern: /(\d+)\s*(min|minutes?)\b/gi, replacement: '$1\u00A0min', unit: 'min' },
    { pattern: /(\d+)\s*(s|secondes?)\b/gi, replacement: '$1\u00A0s', unit: 's' },

    // Monnaie
    { pattern: /(\d+)\s*(€|euros?)\b/gi, replacement: '$1\u00A0€', unit: '€' },
  ]

  unites.forEach(({ pattern, replacement, unit }) => {
    const matches = corrected.match(pattern)
    if (matches && matches.length > 0) {
      corrections.push({
        type: 'minor',
        original: matches[0],
        corrected: matches[0].replace(pattern, replacement),
        reason: `Espace insécable avant unité (${unit})`
      })
      corrected = corrected.replace(pattern, replacement)
    }
  })

  return { corrected, corrections }
}

/**
 * Valide qu'une correction appartient bien au texte du bloc
 * @param {Object} correction - Correction à valider
 * @param {string} blockText - Texte du bloc (original ou corrigé selon la passe)
 * @param {number} blockIndex - Index du bloc pour les logs
 * @returns {boolean} - true si la correction est valide
 */
function validateCorrectionBelongsToBlock(correction, blockText, blockIndex) {
  // Normaliser pour comparaison insensible à la casse
  const normalizedBlockText = blockText.toLowerCase()
  const normalizedOriginal = correction.original.toLowerCase()

  // Vérifier si le texte à corriger existe dans le bloc
  if (!normalizedBlockText.includes(normalizedOriginal)) {
    console.log(`[validateCorrection] INVALID: Correction "${correction.original}" → "${correction.corrected}" does not belong to block #${blockIndex}`)
    console.log(`[validateCorrection]   Block text: "${blockText.substring(0, 100)}..."`)
    return false
  }

  return true
}

/**
 * Détecte et supprime les corrections contradictoires entre deux passes
 * @param {Array} pass1Corrections - Corrections de la passe 1
 * @param {Array} pass2Corrections - Corrections de la passe 2
 * @param {string} trueOriginal - Texte original du bloc
 * @param {string} textAfterPass1 - Texte après la passe 1
 * @param {number} blockIndex - Index du bloc pour les logs
 * @returns {Array} Liste nettoyée des corrections (sans contradictions)
 */
function detectContradictoryCorrections(pass1Corrections, pass2Corrections, trueOriginal, textAfterPass1, blockIndex) {
  const validCorrections = []
  const contradictions = []

  // Normaliser pour comparaison (trim + toLowerCase)
  const normalize = (text) => text.trim().toLowerCase()

  // ===================================================================
  // ÉTAPE 1 : Valider que les corrections appartiennent bien au bloc
  // ===================================================================
  const pass1BelongingToBlock = pass1Corrections.filter(corr1 =>
    validateCorrectionBelongsToBlock(corr1, trueOriginal, blockIndex)
  )

  const pass2BelongingToBlock = pass2Corrections.filter(corr2 =>
    validateCorrectionBelongsToBlock(corr2, textAfterPass1, blockIndex)
  )

  if (pass1Corrections.length !== pass1BelongingToBlock.length) {
    console.log(`[detectContradictoryCorrections] Removed ${pass1Corrections.length - pass1BelongingToBlock.length} invalid Pass 1 corrections from block #${blockIndex}`)
  }

  if (pass2Corrections.length !== pass2BelongingToBlock.length) {
    console.log(`[detectContradictoryCorrections] Removed ${pass2Corrections.length - pass2BelongingToBlock.length} invalid Pass 2 corrections from block #${blockIndex}`)
  }

  // ===================================================================
  // ÉTAPE 2 : Détecter les contradictions entre les corrections valides
  // ===================================================================
  const pass1Valid = []
  pass1BelongingToBlock.forEach(corr1 => {
    // Chercher si passe 2 annule cette correction
    // Contradiction = passe 2 ramène au texte de départ de passe 1
    const isContradicted = pass2BelongingToBlock.some(corr2 => {
      // Cas 1 : Correction exactement inverse
      // Pass1: A→B, Pass2: B→A
      const exactReverse = (
        normalize(corr1.corrected) === normalize(corr2.original) &&
        normalize(corr2.corrected) === normalize(corr1.original)
      )

      // Cas 2 : Passe 2 corrige ce que passe 1 a produit pour revenir à l'original
      // Pass1: A→B, Pass2: B→A (où A est dans l'original)
      const revertsToOriginal = (
        normalize(corr1.corrected) === normalize(corr2.original) &&
        normalize(corr2.corrected) === normalize(corr1.original) &&
        trueOriginal.toLowerCase().includes(normalize(corr1.original))
      )

      return exactReverse || revertsToOriginal
    })

    if (isContradicted) {
      contradictions.push({
        pass: 1,
        original: corr1.original,
        corrected: corr1.corrected,
        reason: corr1.reason
      })
      console.log(`[detectContradictoryCorrections] Block #${blockIndex} - Pass 1 contradiction: "${corr1.original}" → "${corr1.corrected}" (annulée par passe 2)`)
    } else {
      pass1Valid.push(corr1)
    }
  })

  // Vérifier chaque correction de passe 2
  const pass2Valid = []
  pass2BelongingToBlock.forEach(corr2 => {
    // Chercher si cette correction annule une correction de passe 1
    const isContradicting = pass1BelongingToBlock.some(corr1 => {
      const exactReverse = (
        normalize(corr1.corrected) === normalize(corr2.original) &&
        normalize(corr2.corrected) === normalize(corr1.original)
      )
      const revertsToOriginal = (
        normalize(corr1.corrected) === normalize(corr2.original) &&
        normalize(corr2.corrected) === normalize(corr1.original) &&
        trueOriginal.toLowerCase().includes(normalize(corr1.original))
      )
      return exactReverse || revertsToOriginal
    })

    if (isContradicting) {
      contradictions.push({
        pass: 2,
        original: corr2.original,
        corrected: corr2.corrected,
        reason: corr2.reason
      })
      console.log(`[detectContradictoryCorrections] Block #${blockIndex} - Pass 2 contradiction: "${corr2.original}" → "${corr2.corrected}" (annule passe 1)`)
    } else {
      pass2Valid.push(corr2)
    }
  })

  // Retourner les corrections valides (non contradictoires)
  return [...pass1Valid, ...pass2Valid]
}

/**
 * Déduplique les corrections identiques (même original → même corrected)
 * Garde la première occurrence et supprime les doublons
 * @param {Array} corrections - Liste de corrections
 * @param {number} blockIndex - Index du bloc pour les logs
 * @returns {Array} Liste dédupliquée
 */
function deduplicateCorrections(corrections, blockIndex) {
  const seen = new Map()
  const deduplicated = []
  const duplicates = []

  corrections.forEach(correction => {
    // Créer une clé unique basée sur original → corrected (normalisé)
    const key = `${correction.original.trim().toLowerCase()} → ${correction.corrected.trim().toLowerCase()}`

    if (seen.has(key)) {
      // Doublon détecté
      duplicates.push({
        original: correction.original,
        corrected: correction.corrected,
        reason: correction.reason,
        firstReason: seen.get(key).reason
      })
      console.log(`[deduplicateCorrections] Block #${blockIndex} - Duplicate: "${correction.original}" → "${correction.corrected}"`)
      console.log(`[deduplicateCorrections]   First reason: "${seen.get(key).reason}"`)
      console.log(`[deduplicateCorrections]   Duplicate reason: "${correction.reason}"`)
    } else {
      // Première occurrence, la garder
      seen.set(key, correction)
      deduplicated.push(correction)
    }
  })

  if (duplicates.length > 0) {
    console.log(`[deduplicateCorrections] Block #${blockIndex} - Removed ${duplicates.length} duplicate correction(s)`)
  }

  return deduplicated
}

/**
 * Fusionne intelligemment les corrections de la passe 1 et de la passe 2
 * @param {Array} blocksAfterPass1 - Blocs après la passe 1
 * @param {Array} pass2Blocks - Blocs corrigés par la passe 2
 * @param {Array} originalBlocks - Blocs originaux du fichier SRT (pour le vrai "original")
 * @returns {Array} Blocs fusionnés avec toutes les corrections
 */
function mergePass1AndPass2(blocksAfterPass1, pass2Blocks, originalBlocks) {
  // Créer une map des blocs de la passe 2 pour un accès rapide
  const pass2Map = new Map()
  pass2Blocks.forEach(block => pass2Map.set(block.index, block))

  // Créer une map des blocs originaux pour récupérer le vrai texte original
  const originalMap = new Map()
  originalBlocks.forEach(block => originalMap.set(block.index, block))

  return blocksAfterPass1.map(blockPass1 => {
    const blockPass2 = pass2Map.get(blockPass1.index)

    // Si ce bloc n'a pas été traité par la passe 2, valider quand même les corrections de passe 1
    if (!blockPass2) {
      const originalBlock = originalMap.get(blockPass1.index)
      const trueOriginal = originalBlock ? originalBlock.text : blockPass1.original

      // Valider les corrections de passe 1
      const validPass1Corrections = (blockPass1.corrections || []).filter(corr =>
        validateCorrectionBelongsToBlock(corr, trueOriginal, blockPass1.index)
      )

      if (validPass1Corrections.length !== (blockPass1.corrections || []).length) {
        console.log(`[mergePass1AndPass2] Block #${blockPass1.index}: Removed ${(blockPass1.corrections || []).length - validPass1Corrections.length} invalid Pass 1 corrections`)
      }

      return {
        ...blockPass1,
        original: trueOriginal,
        corrections: validPass1Corrections
      }
    }

    // FUSION : Ce bloc a été traité par les deux passes
    const originalBlock = originalMap.get(blockPass1.index)
    const trueOriginal = originalBlock ? originalBlock.text : blockPass1.original

    console.log(`[mergePass1AndPass2] Merging block #${blockPass1.index}`)
    console.log(`  - True original: "${trueOriginal.substring(0, 60)}..."`)
    console.log(`  - After Pass 1: "${blockPass1.corrected.substring(0, 60)}..."`)
    console.log(`  - After Pass 2: "${blockPass2.corrected.substring(0, 60)}..."`)
    console.log(`  - Pass 1: ${blockPass1.corrections?.length || 0} corrections`)
    console.log(`  - Pass 2: ${blockPass2.corrections?.length || 0} corrections`)

    // STRATÉGIE DE FUSION :
    // 1. Garder le vrai "original" (texte du fichier SRT d'origine)
    // 2. Utiliser le "corrected" de la passe 2 (qui contient TOUTES les corrections appliquées)
    // 3. Valider que les corrections appartiennent au bloc
    // 4. Fusionner les listes de corrections EN SUPPRIMANT LES CONTRADICTIONS

    const cleanedCorrections = detectContradictoryCorrections(
      blockPass1.corrections || [],
      blockPass2.corrections || [],
      trueOriginal,
      blockPass1.corrected,  // Texte après la passe 1 (pour valider les corrections de passe 2)
      blockPass1.index       // Index du bloc pour les logs
    )

    // Dédupliquer les corrections identiques
    const deduplicatedCorrections = deduplicateCorrections(cleanedCorrections, blockPass1.index)

    console.log(`  → Merged: ${deduplicatedCorrections.length} total corrections (${(blockPass1.corrections?.length || 0) + (blockPass2.corrections?.length || 0) - deduplicatedCorrections.length} invalid/contradictory/duplicate removed)`)

    return {
      index: blockPass1.index,
      timecode: blockPass1.timecode,
      original: trueOriginal,  // Le vrai original (avant toute correction)
      corrected: blockPass2.corrected,  // Le texte final (avec corrections passe 1 + passe 2)
      corrections: deduplicatedCorrections  // Liste nettoyée et dédupliquée des corrections
    }
  })
}

/**
 * Traitement du contenu SRT avec Claude (optimisé avec parallélisme)
 * @param {string} srtContent - Contenu du fichier SRT
 * @param {string} modelType - Type de modèle à utiliser : 'haiku' (rapide) ou 'sonnet' (qualité)
 */
async function processSRT(srtContent, modelType = 'haiku') {
  // Parse les blocs SRT
  const blocks = parseSRTBlocks(srtContent)

  // CHUNK SIZE : Large pour maximum de contexte
  // L'ajout d'exemples explicites compense les chunks larges
  const maxBlocksPerChunk = 200 // Maximum de contexte, exemples explicites dans le prompt
  const chunks = []

  for (let i = 0; i < blocks.length; i += maxBlocksPerChunk) {
    chunks.push(blocks.slice(i, i + maxBlocksPerChunk))
  }

  console.log(`[processSRT] Processing ${blocks.length} blocks in ${chunks.length} chunks with MULTI-PASS system...`)
  const startTime = Date.now()

  // ═══════════════════════════════════════════════════════════════
  // PASSE 0 : Prétraitement avec regex (corrections déterministes)
  // ═══════════════════════════════════════════════════════════════
  console.log(`[processSRT] === PASS 0: Regex preprocessing on ${blocks.length} blocks ===`)

  const blocksAfterPass0 = blocks.map(block => {
    const { corrected, corrections } = preProcessWithRegex(block.text)
    return {
      index: block.index,
      timecode: block.timecode,
      original: block.text,  // Le vrai texte original (avant regex)
      corrected: corrected,  // Texte après regex
      corrections: corrections  // Corrections faites par regex
    }
  })

  const pass0CorrectionsCount = blocksAfterPass0.filter(b => b.corrections.length > 0).length
  console.log(`[processSRT] Pass 0 completed: ${pass0CorrectionsCount}/${blocks.length} blocks with regex corrections`)

  // Recréer les chunks avec les blocs prétraités
  const preprocessedChunks = []
  for (let i = 0; i < blocksAfterPass0.length; i += maxBlocksPerChunk) {
    const chunkBlocks = blocksAfterPass0.slice(i, i + maxBlocksPerChunk)
    // Convertir au format attendu par correctWithClaude
    preprocessedChunks.push(chunkBlocks.map(b => ({
      index: b.index,
      timecode: b.timecode,
      text: b.corrected  // Utiliser le texte prétraité
    })))
  }

  // ═══════════════════════════════════════════════════════════════
  // PASSE 1 : Correction générale (orthographe, grammaire, tirets)
  // ═══════════════════════════════════════════════════════════════
  console.log(`[processSRT] === PASS 1: General corrections on ${preprocessedChunks.length} chunks in parallel ===`)

  const pass1Chunks = await Promise.all(
    preprocessedChunks.map(chunk => correctWithClaude(chunk, modelType, 1))
  )
  const pass1Blocks = pass1Chunks.flat()

  // Fusionner les blocs corrigés de la passe 1 avec la passe 0
  const pass1Map = new Map()
  pass1Blocks.forEach(block => pass1Map.set(block.index, block))

  const blocksAfterPass1 = blocksAfterPass0.map(pass0Block => {
    const pass1Block = pass1Map.get(pass0Block.index)

    if (pass1Block) {
      // Fusionner les corrections de Pass 0 et Pass 1
      return {
        index: pass0Block.index,
        timecode: pass0Block.timecode,
        original: pass0Block.original,  // Le vrai original (avant Pass 0)
        corrected: pass1Block.corrected,  // Texte final après Pass 1
        corrections: [...pass0Block.corrections, ...pass1Block.corrections]  // Combiner les corrections
      }
    } else {
      // Pas de corrections en Pass 1, garder seulement les corrections de Pass 0
      return pass0Block
    }
  })

  console.log(`[processSRT] Pass 1 completed: ${pass1Blocks.length}/${blocks.length} blocks corrected by Claude`)

  // ═══════════════════════════════════════════════════════════════
  // DÉTECTION : Quels chunks nécessitent la passe 2 ?
  // ═══════════════════════════════════════════════════════════════
  const chunksNeedingPass2 = []

  chunks.forEach((originalChunk, chunkIndex) => {
    if (needsSecondPass(originalChunk)) {
      // Récupérer les blocs DÉJÀ CORRIGÉS de la passe 1 pour ce chunk
      const correctedChunk = originalChunk.map(originalBlock => {
        const blockAfterPass1 = blocksAfterPass1.find(b => b.index === originalBlock.index)
        if (!blockAfterPass1) {
          console.error(`[processSRT] Block ${originalBlock.index} not found after pass 1!`)
          return originalBlock
        }
        // Créer un bloc avec le texte corrigé de la passe 1 comme "texte d'entrée"
        return {
          index: blockAfterPass1.index,
          timecode: blockAfterPass1.timecode,
          text: blockAfterPass1.corrected  // CRITIQUE : le texte corrigé devient le nouveau "text"
        }
      })
      chunksNeedingPass2.push({ chunkIndex, chunk: correctedChunk })
    }
  })

  console.log(`[processSRT] ${chunksNeedingPass2.length}/${chunks.length} chunks need pass 2`)

  // ═══════════════════════════════════════════════════════════════
  // PASSE 2 : Correction ciblée (ministères + formules de politesse)
  // ═══════════════════════════════════════════════════════════════
  let blocksAfterPass2 = [...blocksAfterPass1]

  if (chunksNeedingPass2.length > 0) {
    console.log(`[processSRT] === PASS 2: Ministries + politeness formulas on ${chunksNeedingPass2.length} chunks in parallel ===`)

    const pass2Results = await Promise.all(
      chunksNeedingPass2.map(({ chunk }) => correctWithClaude(chunk, modelType, 2))
    )
    const pass2Blocks = pass2Results.flat()

    console.log(`[processSRT] Pass 2 completed: ${pass2Blocks.length} blocks with ministries + politeness corrections`)

    // ═══════════════════════════════════════════════════════════════
    // FUSION : Combiner les corrections de la passe 1 et de la passe 2
    // ═══════════════════════════════════════════════════════════════
    blocksAfterPass2 = mergePass1AndPass2(blocksAfterPass1, pass2Blocks, blocks)
  }

  // ═══════════════════════════════════════════════════════════════
  // DÉTECTION : Quels chunks nécessitent la passe 3 ?
  // ═══════════════════════════════════════════════════════════════
  const chunksNeedingPass3 = []

  chunks.forEach((originalChunk, chunkIndex) => {
    if (needsPass3(originalChunk)) {
      // Récupérer les blocs DÉJÀ CORRIGÉS après la passe 2 pour ce chunk
      const correctedChunk = originalChunk.map(originalBlock => {
        const blockAfterPass2 = blocksAfterPass2.find(b => b.index === originalBlock.index)
        if (!blockAfterPass2) {
          console.error(`[processSRT] Block ${originalBlock.index} not found after pass 2!`)
          return originalBlock
        }
        // Créer un bloc avec le texte corrigé de la passe 2 comme "texte d'entrée"
        return {
          index: blockAfterPass2.index,
          timecode: blockAfterPass2.timecode,
          text: blockAfterPass2.corrected  // CRITIQUE : le texte corrigé devient le nouveau "text"
        }
      })
      chunksNeedingPass3.push({ chunkIndex, chunk: correctedChunk })
    }
  })

  console.log(`[processSRT] ${chunksNeedingPass3.length}/${chunks.length} chunks need pass 3`)

  // ═══════════════════════════════════════════════════════════════
  // PASSE 3 : Correction ciblée (4 règles : institutions, milliers, traits d'union, majuscules)
  // ═══════════════════════════════════════════════════════════════
  let blocksAfterPass3 = [...blocksAfterPass2]

  if (chunksNeedingPass3.length > 0) {
    console.log(`[processSRT] === PASS 3: Institutions + formatting rules on ${chunksNeedingPass3.length} chunks in parallel ===`)

    const pass3Results = await Promise.all(
      chunksNeedingPass3.map(({ chunk }) => correctWithClaude(chunk, modelType, 3))
    )
    const pass3Blocks = pass3Results.flat()

    console.log(`[processSRT] Pass 3 completed: ${pass3Blocks.length} blocks with institutions + formatting corrections`)

    // ═══════════════════════════════════════════════════════════════
    // FUSION : Combiner les corrections (passe 1 + 2 + 3)
    // ═══════════════════════════════════════════════════════════════
    blocksAfterPass3 = mergePass1AndPass2(blocksAfterPass2, pass3Blocks, blocks)
  }

  // ═══════════════════════════════════════════════════════════════
  // DÉTECTION : Quels chunks nécessitent la passe 4 ?
  // ═══════════════════════════════════════════════════════════════
  const chunksNeedingPass4 = []

  chunks.forEach((originalChunk, chunkIndex) => {
    if (needsPass4(originalChunk)) {
      // Récupérer les blocs DÉJÀ CORRIGÉS après la passe 3 pour ce chunk
      const correctedChunk = originalChunk.map(originalBlock => {
        const blockAfterPass3 = blocksAfterPass3.find(b => b.index === originalBlock.index)
        if (!blockAfterPass3) {
          console.error(`[processSRT] Block ${originalBlock.index} not found after pass 3!`)
          return originalBlock
        }
        // Créer un bloc avec le texte corrigé de la passe 3 comme "texte d'entrée"
        return {
          index: blockAfterPass3.index,
          timecode: blockAfterPass3.timecode,
          text: blockAfterPass3.corrected  // CRITIQUE : le texte corrigé devient le nouveau "text"
        }
      })
      chunksNeedingPass4.push({ chunkIndex, chunk: correctedChunk })
    }
  })

  console.log(`[processSRT] ${chunksNeedingPass4.length}/${chunks.length} chunks need pass 4`)

  // ═══════════════════════════════════════════════════════════════
  // PASSE 4 : UNIQUEMENT ambiguïté de genre (règle isolée)
  // ═══════════════════════════════════════════════════════════════
  let finalBlocks = [...blocksAfterPass3]

  if (chunksNeedingPass4.length > 0) {
    console.log(`[processSRT] === PASS 4: Gender ambiguity ONLY on ${chunksNeedingPass4.length} chunks in parallel ===`)

    const pass4Results = await Promise.all(
      chunksNeedingPass4.map(({ chunk }) => correctWithClaude(chunk, modelType, 4))
    )
    const pass4Blocks = pass4Results.flat()

    console.log(`[processSRT] Pass 4 completed: ${pass4Blocks.length} blocks with gender ambiguity suggestions`)

    // ═══════════════════════════════════════════════════════════════
    // FUSION : Combiner toutes les corrections (passe 1 + 2 + 3 + 4)
    // ═══════════════════════════════════════════════════════════════
    finalBlocks = mergePass1AndPass2(blocksAfterPass3, pass4Blocks, blocks)
  }

  const endTime = Date.now()
  console.log(`[processSRT] ========================================`)
  console.log(`[processSRT] SUMMARY:`)
  console.log(`[processSRT]   Total blocks: ${blocks.length}`)
  console.log(`[processSRT]   Pass 0 (regex): ${pass0CorrectionsCount} blocks`)
  console.log(`[processSRT]   Pass 1 (general): ${pass1Blocks.length} blocks`)
  console.log(`[processSRT]   Pass 2 (ministries + politeness): ${chunksNeedingPass2.length} chunks`)
  console.log(`[processSRT]   Pass 3 (institutions + formatting): ${chunksNeedingPass3.length} chunks`)
  console.log(`[processSRT]   Pass 4 (gender ambiguity ONLY): ${chunksNeedingPass4.length} chunks`)
  console.log(`[processSRT]   Total processing time: ${endTime - startTime}ms`)
  console.log(`[processSRT] ========================================`)

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
 * PASSE 1 : Prompt ultra-simple pour corrections naturelles
 * Laisse Claude détecter les fautes évidentes sans surcharge
 */
function buildSystemPromptPass1() {
  return `Corrige toutes les fautes de français dans ce fichier SRT.

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
- "corrected" = texte avec TOUTES les fautes corrigées
- "corrections" = liste des corrections individuelles

Types : "major" (fautes importantes), "minor" (typographie), "doubt" (ambiguïté)
Si aucune correction dans un bloc, ne pas inclure le bloc dans la réponse.`
}

/**
 * PASSE 2 : Ministères + Formules de politesse
 */
function buildSystemPromptPass2() {
  return `Tu reçois un texte DÉJÀ CORRIGÉ.
Applique CES DEUX règles :

1. MINISTÈRES :
   Quand tu vois "ministère de/du..." :
   - "ministère" en minuscule
   - "de", "du", "des", "de la", "de l'" en minuscule
   - MAJUSCULE première lettre de tous les autres mots

   ✗ ministère de l'écologie et des territoires
   ✓ ministère de l'Écologie et des Territoires

2. MONSIEUR / MADAME / MADEMOISELLE :
   Dans un discours oral (SRT), minuscule sauf début de phrase

   ✗ Bonjour Monsieur, Merci Madame, Mesdames et Messieurs
   ✓ Bonjour monsieur, Merci madame, Mesdames et messieurs

   ✗ Monsieur le président, Monsieur le Président
   ✓ Monsieur le président, monsieur le Président

Format JSON :
{
  "blocks": [
    {
      "index": 1,
      "original": "texte reçu",
      "corrected": "texte corrigé",
      "corrections": [
        {"type": "major", "original": "...", "corrected": "...", "reason": "..."}
      ]
    }
  ]
}`
}

/**
 * PASSE 3 : Autres règles spécifiques (après ministères et formules de politesse)
 */
function buildSystemPromptPass3() {
  return `Tu reçois un texte DÉJÀ CORRIGÉ.
Applique ces règles :

1. INSTITUTIONS :
   ✗ le gouvernement, l'assemblée nationale, le sénat, le parlement
   ✓ le Gouvernement, l'Assemblée nationale, le Sénat, le Parlement

2. ESPACES MILLIERS + ORDINAUX :
   ✗ 10000, 1000e
   ✓ 10 000, 1 000 e

3. TRAITS D'UNION :
   ✗ au dela, par dessus
   ✓ au-delà, par-dessus

4. MAJUSCULES ABUSIVES :
   ✗ la Plaque, le Bâtiment
   ✓ la plaque, le bâtiment

Format JSON :
{
  "blocks": [
    {
      "index": 1,
      "original": "texte reçu",
      "corrected": "texte corrigé",
      "corrections": [
        {"type": "major", "original": "le gouvernement", "corrected": "le Gouvernement", "reason": "Institution"}
      ]
    }
  ]
}`
}

/**
 * PASSE 4 : UNIQUEMENT ambiguïté de genre (règle isolée pour fiabilité)
 */
function buildSystemPromptPass4() {
  return `Tu reçois un texte DÉJÀ CORRIGÉ.
Applique UNIQUEMENT cette règle :

AMBIGUÏTÉ DE GENRE :
TYPE OBLIGATOIRE: "doubt" (PAS "major" !)
NE PAS corriger, SUGGÉRER l'autre forme avec "ou"

RÈGLE IMPORTANTE :
Dans un sous-titre (SRT), quand on voit "je suis" + participe passé, on ne peut PAS savoir si c'est un homme ou une femme qui parle.
MÊME SI le texte actuel indique un genre (ex: "engagée" = féminin), tu dois TOUJOURS suggérer l'autre forme.

Exemples (peu importe le genre actuel du texte) :
- je suis engagé → je suis engagé (ou engagée)
- je suis engagée → je suis engagée (ou engagé)
- je suis venue → je suis venue (ou venu)
- je suis venu → je suis venu (ou venue)
- je suis allé → je suis allé (ou allée)
- je suis allée → je suis allée (ou allé)
- je suis parti → je suis parti (ou partie)
- je suis partie → je suis partie (ou parti)

✗ INCORRECT : je suis venu → je suis venue (remplacement)
✓ CORRECT : je suis venu → je suis venu (ou venue) (suggestion)
✓ CORRECT : je suis engagée → je suis engagée (ou engagé) (suggestion de l'autre forme)

C'est une SUGGESTION, pas une correction !

Format JSON :
{
  "blocks": [
    {
      "index": 1,
      "original": "texte reçu",
      "corrected": "texte corrigé",
      "corrections": [
        {"type": "doubt", "original": "je suis engagée", "corrected": "je suis engagée (ou engagé)", "reason": "Ambiguïté de genre"}
      ]
    }
  ]
}

RAPPEL CRITIQUE:
- Type = "doubt" (JAMAIS "major")
- Ajouter "(ou ...)" pour suggérer l'AUTRE genre
- NE PAS remplacer le genre actuel, AJOUTER l'alternative
- Peu importe si le texte est masculin ou féminin, TOUJOURS suggérer l'autre forme`
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
 * @param {string} modelType - Type de modèle : 'haiku' (rapide, par défaut) ou 'sonnet' (qualité max)
 * @param {number} pass - Numéro de passe : 1 (général), 2 (ministères + politesse), 3 (4 règles), 4 (genre UNIQUEMENT)
 */
async function correctWithClaude(blocks, modelType = 'haiku', pass = 1) {
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
  const systemPrompt = pass === 1 ? buildSystemPromptPass1() :
                       pass === 2 ? buildSystemPromptPass2() :
                       pass === 3 ? buildSystemPromptPass3() :
                       buildSystemPromptPass4()

  console.log(`[correctWithClaude] Pass ${pass} - Using model: ${config.name} for ${blocks.length} blocks`)

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

  // Vérifier que la réponse est valide
  if (!result.content || !result.content[0] || !result.content[0].text) {
    console.error('[correctWithClaude] Invalid API response structure:', JSON.stringify(result))
    throw new Error('Invalid API response structure')
  }

  let content = result.content[0].text

  // Log de la réponse brute pour debugging (premiers 500 caractères)
  console.log(`[correctWithClaude] Pass ${pass} - Raw response preview: ${content.substring(0, 500)}...`)

  // Nettoyer la réponse (enlever les balises markdown si présentes)
  // Claude Sonnet 4.5 retourne parfois ```json ... ``` au lieu de JSON pur
  content = content.trim()
  if (content.startsWith('```json')) {
    content = content.replace(/^```json\s*/, '').replace(/\s*```$/, '')
  } else if (content.startsWith('```')) {
    content = content.replace(/^```\s*/, '').replace(/\s*```$/, '')
  }

  // Parse la réponse JSON de Claude
  let parsed
  try {
    parsed = JSON.parse(content.trim())
  } catch (parseError) {
    // Si le parsing échoue, c'est peut-être parce que Claude a ajouté du texte après le JSON
    // Essayer d'extraire uniquement la partie JSON valide
    console.warn('[correctWithClaude] Initial JSON parse failed, attempting to extract JSON portion...')

    try {
      // Trouver le début du JSON (premier '{')
      const jsonStart = content.indexOf('{')
      if (jsonStart === -1) {
        throw new Error('No JSON object found in response')
      }

      // Extraire depuis le début du JSON
      const jsonContent = content.substring(jsonStart)

      // Essayer de parser en trouvant la fin du JSON de manière incrémentale
      // On cherche le premier JSON valide complet
      let braceCount = 0
      let jsonEnd = -1
      let inString = false
      let escapeNext = false

      for (let i = 0; i < jsonContent.length; i++) {
        const char = jsonContent[i]

        if (escapeNext) {
          escapeNext = false
          continue
        }

        if (char === '\\') {
          escapeNext = true
          continue
        }

        if (char === '"') {
          inString = !inString
          continue
        }

        if (!inString) {
          if (char === '{') {
            braceCount++
          } else if (char === '}') {
            braceCount--
            if (braceCount === 0) {
              jsonEnd = i + 1
              break
            }
          }
        }
      }

      if (jsonEnd === -1) {
        throw new Error('Could not find end of JSON object')
      }

      const extractedJson = jsonContent.substring(0, jsonEnd)
      console.log(`[correctWithClaude] Extracted JSON (${extractedJson.length} chars), ignoring trailing content`)

      parsed = JSON.parse(extractedJson)
      console.log('[correctWithClaude] Successfully parsed extracted JSON')

    } catch (extractError) {
      console.error('[correctWithClaude] JSON parse error:', parseError.message)
      console.error('[correctWithClaude] Extract attempt also failed:', extractError.message)
      console.error('[correctWithClaude] Content that failed to parse (first 1000 chars):', content.substring(0, 1000))
      console.error('[correctWithClaude] Content that failed to parse (last 500 chars):', content.substring(Math.max(0, content.length - 500)))
      throw new Error(`JSON parsing failed: ${parseError.message}`)
    }
  }

  // Valider la structure de la réponse
  if (!parsed || typeof parsed !== 'object') {
    console.error('[correctWithClaude] Parsed content is not an object:', typeof parsed)
    throw new Error('Parsed response is not an object')
  }

  if (!parsed.blocks) {
    console.error('[correctWithClaude] No "blocks" field in parsed response:', Object.keys(parsed))
    throw new Error('No "blocks" field in response')
  }

  if (!Array.isArray(parsed.blocks)) {
    console.error('[correctWithClaude] "blocks" is not an array:', typeof parsed.blocks)
    throw new Error('"blocks" field is not an array')
  }

  try {
    const correctedBlocks = parsed.blocks

    // Réinjecter les timecodes et valider les corrections
    const validatedBlocks = correctedBlocks.map(correctedBlock => {
      const originalBlock = blocks.find(b => b.index === correctedBlock.index)

      // VALIDATION CRITIQUE : Vérifier que le bloc retourné par Claude correspond bien
      if (!originalBlock) {
        console.error(`[correctWithClaude] Pass ${pass} - Block #${correctedBlock.index} returned by Claude but not found in original blocks!`)
        return null
      }

      // Valider que l'original retourné par Claude correspond au texte du bloc
      const normalizedClaudeOriginal = correctedBlock.original?.toLowerCase().trim()
      const normalizedBlockText = originalBlock.text.toLowerCase().trim()

      if (normalizedClaudeOriginal && normalizedClaudeOriginal !== normalizedBlockText) {
        console.warn(`[correctWithClaude] Pass ${pass} - Block #${correctedBlock.index}: Claude's "original" doesn't match block text`)
        console.warn(`[correctWithClaude]   Expected: "${originalBlock.text.substring(0, 60)}..."`)
        console.warn(`[correctWithClaude]   Got: "${correctedBlock.original?.substring(0, 60)}..."`)
        // Ne pas retourner ce bloc, il y a une confusion d'index
        return null
      }

      // Valider les corrections individuellement
      let validatedCorrections = []
      if (correctedBlock.corrections && correctedBlock.corrections.length > 0) {
        validatedCorrections = correctedBlock.corrections.filter(correction => {
          // Vérifier que les champs essentiels existent
          if (!correction.original || !correction.corrected || !correction.reason || !correction.type) {
            return false
          }

          // VALIDATION : Vérifier que la correction appartient bien à ce bloc
          const blockTextToCheck = pass === 1 ? originalBlock.text : originalBlock.text  // Pour pass 2, on vérifie contre le texte d'entrée
          if (!validateCorrectionBelongsToBlock(correction, blockTextToCheck, correctedBlock.index)) {
            console.warn(`[correctWithClaude] Pass ${pass} - Rejecting correction from block #${correctedBlock.index}: "${correction.original}" → "${correction.corrected}"`)
            return false
          }

          return true
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
    }).filter(Boolean)  // Retirer les blocs null (rejetés par validation)

    // Log le nombre de blocs rejetés
    if (validatedBlocks.length < correctedBlocks.length) {
      console.log(`[correctWithClaude] Pass ${pass} - Rejected ${correctedBlocks.length - validatedBlocks.length} blocks due to validation failures`)
    }

    return validatedBlocks
  } catch (e) {
    console.error('[correctWithClaude] Error during block validation:', e.message)
    console.error('[correctWithClaude] Stack trace:', e.stack)
    console.error('[correctWithClaude] Number of blocks to validate:', correctedBlocks.length)
    console.error('[correctWithClaude] Input blocks count:', blocks.length)
    throw new Error(`Block validation failed: ${e.message}`)
  }
}
