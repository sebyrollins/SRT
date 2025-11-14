/**
 * Cloudflare Worker pour la correction de fichiers SRT
 * Utilise l'API Claude Sonnet 4 pour corriger le texte
 */

// Cache des règles de vocabulaire (en mémoire)
let CACHED_VOCABULARY_RULES = null
let CACHE_TIMESTAMP = 0
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

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
    const { srtContent, fileName, model, pass, inputBlocks } = data

    // Validation : soit srtContent soit inputBlocks doit être fourni
    if (!srtContent && !inputBlocks) {
      return new Response(JSON.stringify({ error: 'Contenu SRT ou blocs manquants' }), {
        status: 400,
        headers: corsHeaders
      })
    }

    // Déterminer le modèle à utiliser (sonnet par défaut)
    const modelType = model === 'cleaning' ? 'cleaning' : (model === 'sonnet' ? 'sonnet' : 'sonnet')
    console.log(`[handleRequest] Using model: ${modelType}`)
    console.log(`[handleRequest] Pass requested: ${pass || 'all'}`)

    // Traitement du contenu SRT
    const result = await processSRT(srtContent, modelType, pass, inputBlocks)

    return new Response(JSON.stringify({
      success: true,
      data: result.blocks,
      debugLogs: result.debugLogs,
      pass0Stats: result.pass0Stats,
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
 * Détecte si un chunk nécessite une passe 2 pour institutions + formatage
 * @param {Array} blocks - Blocs SRT à analyser
 * @returns {boolean} - true si le chunk nécessite une passe 2
 */
function needsSecondPass(blocks) {
  const text = blocks.map(b => b.text).join(' ')

  // PASSE 2 : Institutions + espaces milliers + traits d'union + majuscules abusives
  return (
    /gouvernement|assemblée|sénat|parlement/i.test(text) || // Institutions
    /\d{4,}e/i.test(text) ||                        // Ordinaux (1000e)
    /\d{1,3}(\d{3})+(?!\s)/.test(text) ||           // Milliers (10000)
    /au dela|par dessus/i.test(text) ||             // Traits d'union
    /\b(la|le|de|du|des)\s+[A-Z][a-z]+/.test(text)  // Majuscules abusives
  )
}

/**
 * Détecte si un chunk nécessite une passe 3 pour ministères + formules de politesse
 * @param {Array} blocks - Blocs SRT à analyser
 * @returns {boolean} - true si le chunk nécessite une passe 3
 */
function needsPass3(blocks) {
  const text = blocks.map(b => b.text).join(' ')

  // PASSE 3 : Ministères + Monsieur/Madame/Mademoiselle
  return (
    /ministère/i.test(text) ||
    /\b(monsieur|madame|mademoiselle|mesdames|messieurs)/i.test(text)
  )
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
      type: 'fault',
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
        type: 'fault',
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
        type: 'fault',
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
        type: 'fault',
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
        type: 'fault',
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
        type: 'fault',
        original: matches[0],
        corrected: matches[0].replace(/"/g, '«').replace(/«([^«]+)«/g, '«\u00A0$1\u00A0»'),
        reason: 'Guillemets français'
      })
      corrected = corrected.replace(/"([^"]+)"/g, '«\u00A0$1\u00A0»')
    }
  }

  // 6. ESPACES APRÈS APOSTROPHES : "l' école" → "l'école", "qu' on" → "qu'on"
  if (/\b([ldnjmtscq]|qu)'\s+/gi.test(corrected)) {
    const matches = corrected.match(/\b([ldnjmtscq]|qu)'\s+/gi)
    if (matches) {
      corrections.push({
        type: 'fault',
        original: matches[0],
        corrected: matches[0].replace(/'\s+/, "'"),
        reason: 'Espace après apostrophe'
      })
      corrected = corrected.replace(/\b([ldnjmtscq]|qu)'\s+/gi, "$1'")
    }
  }

  // 7. DOUBLES PONCTUATIONS : ",," → "," ou ";;" → ";"
  if (/([,;])\1/.test(corrected)) {
    const matches = corrected.match(/([,;])\1/g)
    if (matches) {
      corrections.push({
        type: 'fault',
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
        type: 'fault',
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
 * Pour les corrections de type "doubt", garde la plus longue (qui englobe les autres)
 * Supprime les corrections "fault" qui sont englobées par des corrections "doubt"
 * @param {Array} corrections - Liste de corrections
 * @param {number} blockIndex - Index du bloc pour les logs
 * @returns {Array} Liste dédupliquée
 */
function deduplicateCorrections(corrections, blockIndex) {
  const seen = new Map()
  const deduplicated = []
  const duplicates = []

  // Séparer les corrections "doubt" des autres
  const doubtCorrections = corrections.filter(c => c.type === 'doubt')
  const otherCorrections = corrections.filter(c => c.type !== 'doubt')

  // Pour les corrections "doubt", garder seulement la plus longue quand il y a chevauchement
  const filteredDoubtCorrections = []
  doubtCorrections.forEach(correction => {
    // Vérifier si cette correction est contenue dans une autre correction doubt plus longue
    const isContainedInLonger = doubtCorrections.some(other => {
      if (other === correction) return false

      // Construire les textes possibles pour chaque doute (original et alternative)
      const otherTexts = [other.original]
      if (other.alternative) otherTexts.push(other.alternative)

      const correctionTexts = [correction.original]
      if (correction.alternative) correctionTexts.push(correction.alternative)

      // Vérifier si n'importe quel texte de 'other' contient n'importe quel texte de 'correction'
      // ET que 'other' est plus long (plus de contexte)
      const hasOverlap = otherTexts.some(otherText =>
        correctionTexts.some(corrText =>
          otherText.includes(corrText) && otherText.length > corrText.length
        )
      )

      return hasOverlap
    })

    if (isContainedInLonger) {
      console.log(`[deduplicateCorrections] Block #${blockIndex} - Removing nested doubt: "${correction.original}" (contained in longer correction)`)
      duplicates.push({
        original: correction.original,
        corrected: correction.corrected,
        reason: correction.reason,
        firstReason: 'Nested in longer correction'
      })
    } else {
      filteredDoubtCorrections.push(correction)
    }
  })

  // Filtrer les corrections "fault" qui sont englobées par des corrections "doubt"
  const filteredOtherCorrections = []
  otherCorrections.forEach(correction => {
    // Vérifier si cette correction fault est englobée par un doute de genre
    const isEnglobed = filteredDoubtCorrections.some(doubt => {
      // Si le doute contient l'original OU le corrected de la fault, c'est un chevauchement
      // Exemple: doubt "Je semble perdu" englobe fault "perdue" → "perdu"
      // Vérifie les deux sens possibles pour être robuste
      const doubtTexts = [doubt.original]
      if (doubt.alternative) {
        doubtTexts.push(doubt.alternative)
      }

      const correctionTexts = [correction.original, correction.corrected]

      // Vérifier si n'importe quel texte du doute contient n'importe quel texte de la correction
      return doubtTexts.some(doubtText =>
        correctionTexts.some(corrText => doubtText.includes(corrText))
      )
    })

    if (isEnglobed) {
      console.log(`[deduplicateCorrections] Block #${blockIndex} - Removing fault englobed by doubt: "${correction.original}" → "${correction.corrected}"`)
      duplicates.push({
        original: correction.original,
        corrected: correction.corrected,
        reason: correction.reason,
        firstReason: 'Englobed by gender doubt correction'
      })
    } else {
      filteredOtherCorrections.push(correction)
    }
  })

  // Dédupliquer les corrections fault restantes (logique normale)
  filteredOtherCorrections.forEach(correction => {
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

  // Combiner les résultats
  const result = [...deduplicated, ...filteredDoubtCorrections]

  if (duplicates.length > 0) {
    console.log(`[deduplicateCorrections] Block #${blockIndex} - Removed ${duplicates.length} duplicate correction(s)`)
  }

  return result
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
      const trueOriginal = originalBlock ? (originalBlock.text || originalBlock.original) : blockPass1.original

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
    const trueOriginal = originalBlock ? (originalBlock.text || originalBlock.original) : blockPass1.original

    console.log(`[mergePass1AndPass2] Merging block #${blockPass1.index}`)
    console.log(`  - True original: "${trueOriginal.substring(0, 60)}..."`)
    console.log(`  - After Pass 1: "${(blockPass1.corrected || blockPass1.text || blockPass1.original || '').substring(0, 60)}..."`)
    console.log(`  - After Pass 2: "${(blockPass2.corrected || blockPass2.text || blockPass2.original || '').substring(0, 60)}..."`)
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
      blockPass1.corrected || blockPass1.text || blockPass1.original,  // Texte après la passe 1 (ou original si Pass 1 non exécutée)
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
 * @param {string} srtContent - Contenu du fichier SRT (optionnel si inputBlocks fourni)
 * @param {string} modelType - Type de modèle à utiliser : 'cleaning' (regex uniquement), 'sonnet' (qualité)
 * @param {number} pass - Numéro de passe à exécuter (1, 2, 3, 4) ou null pour toutes
 * @param {Array} inputBlocks - Blocs déjà traités (pour passes 2, 3, 4)
 */
async function processSRT(srtContent, modelType = 'sonnet', pass = null, inputBlocks = null) {
  // Tableau de logs pour debugging (sera renvoyé au frontend)
  const debugLogs = []

  // Parse les blocs SRT (ou utilise inputBlocks si fourni)
  const blocks = inputBlocks || parseSRTBlocks(srtContent)

  // CHUNK SIZE : Large pour maximum de contexte
  // L'ajout d'exemples explicites compense les chunks larges
  const maxBlocksPerChunk = 200 // Maximum de contexte, exemples explicites dans le prompt
  const chunks = []

  for (let i = 0; i < blocks.length; i += maxBlocksPerChunk) {
    chunks.push(blocks.slice(i, i + maxBlocksPerChunk))
  }

  console.log(`[processSRT] Processing ${blocks.length} blocks in ${chunks.length} chunks with MULTI-PASS system...`)
  console.log(`[processSRT] Requested pass: ${pass === null ? 'ALL' : pass}`)
  const startTime = Date.now()

  // Variables pour stocker les résultats de chaque passe
  let pass0Stats = null
  let blocksAfterPass1 = blocks
  let blocksAfterPass2 = blocks
  let blocksAfterPass3 = blocks

  // ═══════════════════════════════════════════════════════════════
  // PASSE 1 : Pass 0 (regex) + Pass 1 (général)
  // ═══════════════════════════════════════════════════════════════
  if (pass === 1 || pass === null) {
    console.log(`[processSRT] === PASS 0: Regex preprocessing on ${blocks.length} blocks ===`)

    // Compteurs pour les stats Pass 0
    pass0Stats = {
      trimSpaces: 0,
      ellipsis: 0,
      multipleSpaces: 0,
      spaceBeforePunctuation: 0,
      nonBreakingSpace: 0,
      frenchQuotes: 0,
      spaceAfterApostrophe: 0
    }

    const blocksAfterPass0 = blocks.map(block => {
      const { corrected, corrections } = preProcessWithRegex(block.text)

      // Compter les types de corrections
      corrections.forEach(corr => {
        if (corr.reason.includes('Espaces en début/fin')) pass0Stats.trimSpaces++
        else if (corr.reason.includes('Ellipsis')) pass0Stats.ellipsis++
        else if (corr.reason.includes('Espaces multiples')) pass0Stats.multipleSpaces++
        else if (corr.reason.includes('Espace avant ponctuation')) pass0Stats.spaceBeforePunctuation++
        else if (corr.reason.includes('Espace insécable')) pass0Stats.nonBreakingSpace++
        else if (corr.reason.includes('Guillemets')) pass0Stats.frenchQuotes++
        else if (corr.reason.includes('Espace après apostrophe')) pass0Stats.spaceAfterApostrophe++
      })

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
    console.log(`[processSRT] Pass 0 stats:`, pass0Stats)

    // ═══════════════════════════════════════════════════════════════
    // MODE CLEANING : Retourner uniquement les corrections regex
    // ═══════════════════════════════════════════════════════════════
    if (modelType === 'cleaning') {
      const totalTime = Date.now() - startTime
      console.log(`[processSRT] === CLEANING MODE: Completed in ${totalTime}ms ===`)
      return {
        blocks: blocksAfterPass0,
        debugLogs: [`Cleaning mode: ${pass0CorrectionsCount} blocks cleaned with regex in ${totalTime}ms`],
        pass0Stats: pass0Stats
      }
    }

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
        // Ne PAS fusionner les corrections de Pass 0 car elles sont déjà appliquées au texte
        // Le texte original est avant Pass 0, le texte corrigé est après Pass 1
        // Les corrections Pass 0 seraient redondantes et apparaîtraient comme "déjà corrigées"
        return {
          index: pass0Block.index,
          timecode: pass0Block.timecode,
          original: pass0Block.original,  // Le vrai original (avant Pass 0)
          corrected: pass1Block.corrected,  // Texte final après Pass 1
          corrections: pass1Block.corrections  // Seulement les corrections de Pass 1
        }
      } else {
        // Pas de corrections en Pass 1, mais on ne garde pas non plus les corrections Pass 0
        // car elles sont déjà appliquées dans le champ corrected
        return {
          index: pass0Block.index,
          timecode: pass0Block.timecode,
          original: pass0Block.original,
          corrected: pass0Block.corrected,  // Texte après Pass 0
          corrections: []  // Pas de corrections à afficher (déjà appliquées)
        }
      }
    })

    console.log(`[processSRT] Pass 1 completed: ${pass1Blocks.length}/${blocks.length} blocks corrected by Claude`)

    // DEBUG: Vérifier la structure des blocs APRÈS fusion Pass 0 + Pass 1
    if (blocksAfterPass1.length > 0) {
      console.log('[DEBUG] Sample block AFTER Pass 1 fusion:', {
        index: blocksAfterPass1[0].index,
        hasOriginal: 'original' in blocksAfterPass1[0],
        originalValue: blocksAfterPass1[0].original ? blocksAfterPass1[0].original.substring(0, 30) : null,
        hasText: 'text' in blocksAfterPass1[0],
        textValue: blocksAfterPass1[0].text ? blocksAfterPass1[0].text.substring(0, 30) : null,
        hasCorrected: 'corrected' in blocksAfterPass1[0],
        keys: Object.keys(blocksAfterPass1[0])
      })
    }

    // IMPORTANT : Ne plus retourner ici même si pass === 1
    // car la Pass 5 (vocabulaire) doit toujours s'exécuter après
  }

  // Pour les passes 2, 3, 4 : utiliser les blocs d'entrée
  blocksAfterPass2 = blocksAfterPass1

  // ═══════════════════════════════════════════════════════════════
  // PASSE 2 : Institutions + formatage
  // ═══════════════════════════════════════════════════════════════
  if (pass === 2 || pass === null) {
    console.log(`[processSRT] === PASS 2: Institutions + formatting ===`)

    // Recréer les chunks avec les blocs actuels
    const currentChunks = []
    for (let i = 0; i < blocksAfterPass1.length; i += maxBlocksPerChunk) {
      currentChunks.push(blocksAfterPass1.slice(i, i + maxBlocksPerChunk))
    }

    // Détection : Quels chunks nécessitent la passe 2 ?
    const chunksNeedingPass2 = []

    currentChunks.forEach((chunk, chunkIndex) => {
      // Convertir les blocs au format SRT simple pour la détection
      // Support pour inputBlocks (qui ont 'original') ET blocs parsés (qui ont 'text')
      const srtChunk = chunk.map(b => ({
        index: b.index,
        timecode: b.timecode,
        text: b.corrected || b.original || b.text
      }))

      if (needsSecondPass(srtChunk)) {
        // Utiliser le texte corrigé comme entrée pour Pass 2
        const inputChunk = chunk.map(b => ({
          index: b.index,
          timecode: b.timecode,
          text: b.corrected || b.original || b.text
        }))
        chunksNeedingPass2.push({ chunkIndex, chunk: inputChunk })
      }
    })

    console.log(`[processSRT] ${chunksNeedingPass2.length}/${currentChunks.length} chunks need pass 2`)

    if (chunksNeedingPass2.length > 0) {
      const pass2Results = await Promise.all(
        chunksNeedingPass2.map(({ chunk }) => correctWithClaude(chunk, modelType, 2))
      )
      const pass2Blocks = pass2Results.flat()

      console.log(`[processSRT] Pass 2 completed: ${pass2Blocks.length} blocks with institutions + formatting corrections`)

      // Fusion : Combiner les corrections de la passe 1 et de la passe 2
      const originalBlocks = pass === null ? blocks : blocksAfterPass1
      blocksAfterPass2 = mergePass1AndPass2(blocksAfterPass1, pass2Blocks, originalBlocks)
    }

    // IMPORTANT : Ne plus retourner ici même si pass === 2
    // car la Pass 5 (vocabulaire) doit toujours s'exécuter après
  }

  // ═══════════════════════════════════════════════════════════════
  // PASSE 3 : Ministères + formules de politesse
  // ═══════════════════════════════════════════════════════════════
  blocksAfterPass3 = blocksAfterPass2

  if (pass === 3 || pass === null) {
    console.log(`[processSRT] === PASS 3: Ministries + politeness formulas ===`)

    // Recréer les chunks avec les blocs actuels
    const currentChunks = []
    for (let i = 0; i < blocksAfterPass2.length; i += maxBlocksPerChunk) {
      currentChunks.push(blocksAfterPass2.slice(i, i + maxBlocksPerChunk))
    }

    // Détection : Quels chunks nécessitent la passe 3 ?
    const chunksNeedingPass3 = []

    currentChunks.forEach((chunk, chunkIndex) => {
      // Convertir les blocs au format SRT simple pour la détection
      // Support pour inputBlocks (qui ont 'original') ET blocs parsés (qui ont 'text')
      const srtChunk = chunk.map(b => ({
        index: b.index,
        timecode: b.timecode,
        text: b.corrected || b.original || b.text
      }))

      if (needsPass3(srtChunk)) {
        // Utiliser le texte corrigé comme entrée pour Pass 3
        const inputChunk = chunk.map(b => ({
          index: b.index,
          timecode: b.timecode,
          text: b.corrected || b.original || b.text
        }))
        chunksNeedingPass3.push({ chunkIndex, chunk: inputChunk })
      }
    })

    console.log(`[processSRT] ${chunksNeedingPass3.length}/${currentChunks.length} chunks need pass 3`)

    if (chunksNeedingPass3.length > 0) {
      const pass3Results = await Promise.all(
        chunksNeedingPass3.map(({ chunk }) => correctWithClaude(chunk, modelType, 3))
      )
      const pass3Blocks = pass3Results.flat()

      console.log(`[processSRT] Pass 3 completed: ${pass3Blocks.length} blocks with ministries + politeness corrections`)

      // Fusion : Combiner les corrections (passe 1 + 2 + 3)
      const originalBlocks = pass === null ? blocks : blocksAfterPass2
      blocksAfterPass3 = mergePass1AndPass2(blocksAfterPass2, pass3Blocks, originalBlocks)
    }

    // IMPORTANT : Ne plus retourner ici même si pass === 3
    // car la Pass 5 (vocabulaire) doit toujours s'exécuter après
  }

  // ═══════════════════════════════════════════════════════════════
  // PASSE 4 : UNIQUEMENT ambiguïté de genre (règle isolée)
  // ═══════════════════════════════════════════════════════════════
  let finalBlocks = blocksAfterPass3

  if (pass === 4 || pass === null) {
    console.log(`[processSRT] === PASS 4: Gender ambiguity ONLY ===`)

    // Recréer les chunks avec les blocs actuels
    const currentChunks = []
    for (let i = 0; i < blocksAfterPass3.length; i += maxBlocksPerChunk) {
      currentChunks.push(blocksAfterPass3.slice(i, i + maxBlocksPerChunk))
    }

    // Détection : Quels chunks nécessitent la passe 4 ?
    // Filtrer pour n'envoyer que les chunks contenant "je/Je/J'/j'"
    const chunksNeedingPass4 = []

    currentChunks.forEach((chunk, chunkIndex) => {
      // Vérifier si le chunk contient "je" (toute casse : je/Je/JE) ou "j'" (apostrophe droite/courbe)
      // Support pour inputBlocks (qui ont 'original') ET blocs parsés (qui ont 'text')
      const chunkText = chunk.map(b => b.corrected || b.original || b.text).join(' ')
      const containsJe = /\bje\b|\bj['\u2019]/i.test(chunkText)

      if (!containsJe) {
        return // Skip ce chunk, pas de "je"
      }

      // Utiliser le texte corrigé comme entrée pour Pass 4
      const inputChunk = chunk.map(b => ({
        index: b.index,
        timecode: b.timecode,
        text: b.corrected || b.original || b.text
      }))
      chunksNeedingPass4.push({ chunkIndex, chunk: inputChunk })
    })

    console.log(`[processSRT] ${chunksNeedingPass4.length}/${currentChunks.length} chunks sent to pass 4 (filtered by "je")`)

    if (chunksNeedingPass4.length > 0) {
      // DEBUG: Afficher le contenu des chunks envoyés à Pass 4
      console.log(`[DEBUG Pass 4] First chunk content:`, chunksNeedingPass4[0]?.chunk.slice(0, 3).map(b => b.text))

      const pass4Results = await Promise.all(
        chunksNeedingPass4.map(({ chunk }) => correctWithClaude(chunk, modelType, 4, debugLogs))
      )
      const pass4Blocks = pass4Results.flat()

      console.log(`[processSRT] Pass 4 completed: ${pass4Blocks.length} blocks with gender ambiguity suggestions`)

      // DEBUG: Afficher les corrections détectées par Pass 4
      const blocksWithCorrections = pass4Blocks.filter(b => b.corrections && b.corrections.length > 0)
      console.log(`[DEBUG Pass 4] Blocks with corrections: ${blocksWithCorrections.length}/${pass4Blocks.length}`)
      if (blocksWithCorrections.length > 0) {
        console.log(`[DEBUG Pass 4] First correction example:`, JSON.stringify(blocksWithCorrections[0], null, 2))
      } else {
        console.log(`[DEBUG Pass 4] No corrections found - checking first 3 blocks:`)
        pass4Blocks.slice(0, 3).forEach(b => {
          console.log(`  Block #${b.index}: "${b.original}" -> corrections: ${b.corrections?.length || 0}`)
        })
      }

      // Fusion : Combiner toutes les corrections (passe 1 + 2 + 3 + 4)
      // IMPORTANT : Pass 4 travaille sur le texte APRÈS Pass 3
      const originalBlocks = pass === null ? blocksAfterPass3 : blocksAfterPass3
      finalBlocks = mergePass1AndPass2(blocksAfterPass3, pass4Blocks, originalBlocks)
    }

    // IMPORTANT : Ne plus retourner ici même si pass === 4
    // car la Pass 5 (vocabulaire) doit toujours s'exécuter après
  }

  // ═══════════════════════════════════════════════════════════════
  // PASS 5 : VOCABULAIRE (SANS API CLAUDE - GRATUIT)
  // Cette passe s'exécute après la Pass 4 (dernière passe) ou en mode "toutes les passes"
  // PAS lors des passes intermédiaires isolées (1, 2, 3) pour éviter les doublons
  // ═══════════════════════════════════════════════════════════════
  if (pass === null || pass === 4 || pass === 5) {
    console.log('[processSRT] ========================================')
    console.log('[processSRT] Starting Pass 5: Vocabulary corrections (no API cost)')
    console.log('[processSRT] ========================================')

    const pass5StartTime = Date.now()

    // DEBUG: Vérifier la structure de finalBlocks AVANT Pass 5
    if (finalBlocks.length > 0) {
      console.log('[DEBUG PASS 5] Sample block structure BEFORE vocabulary:', {
        index: finalBlocks[0].index,
        hasOriginal: 'original' in finalBlocks[0],
        originalValue: finalBlocks[0].original,
        hasText: 'text' in finalBlocks[0],
        textValue: finalBlocks[0].text,
        hasCorrected: 'corrected' in finalBlocks[0],
        keys: Object.keys(finalBlocks[0])
      })
    }

    // Charger les règles de vocabulaire depuis l'API
    const vocabularyRules = await loadVocabularyRules()
    const rulesCount = vocabularyRules?.rules?.length || 0
    console.log(`[processSRT] Pass 5: Using ${rulesCount} vocabulary rules`)

    // Appliquer les règles de vocabulaire à tous les blocs finaux
    const blocksWithVocabulary = finalBlocks.map(block =>
      applyVocabularyRules(block, vocabularyRules)
    )

    // Compter les blocs modifiés
    const modifiedBlocks = blocksWithVocabulary.filter(b => b.correctedByPass5)
    const totalCorrections = blocksWithVocabulary.reduce((sum, b) =>
      sum + (b.corrections?.length || 0), 0
    )

    console.log(`[processSRT] Pass 5 completed:`)
    console.log(`[processSRT]   - ${modifiedBlocks.length}/${blocksWithVocabulary.length} blocks modified`)
    console.log(`[processSRT]   - ${totalCorrections} vocabulary corrections applied`)
    console.log(`[processSRT]   - Duration: ${Date.now() - pass5StartTime}ms`)
    console.log(`[processSRT]   - Cost: $0.00 (no API call)`)

    // Mettre à jour finalBlocks avec les corrections de vocabulaire
    finalBlocks = blocksWithVocabulary

    // Si on n'exécute que Pass 5, retourner maintenant
    if (pass === 5) {
      const totalTime = Date.now() - startTime
      console.log(`[processSRT] === PASS 5 ONLY: Completed in ${totalTime}ms ===`)
      return {
        blocks: finalBlocks,
        debugLogs: debugLogs,
        pass0Stats: null,
        pass5Stats: {
          modifiedBlocks: modifiedBlocks.length,
          totalBlocks: blocksWithVocabulary.length,
          totalCorrections: totalCorrections,
          rulesApplied: rulesCount
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // RÉSUMÉ FINAL (mode toutes les passes)
  // ═══════════════════════════════════════════════════════════════
  const endTime = Date.now()
  console.log(`[processSRT] ========================================`)
  console.log(`[processSRT] SUMMARY: All passes completed`)
  console.log(`[processSRT]   Total blocks: ${blocks.length}`)
  console.log(`[processSRT]   Total processing time: ${endTime - startTime}ms`)
  console.log(`[processSRT] ========================================`)

  // ═══════════════════════════════════════════════════════════════
  // NORMALISATION FINALE : Garantir que tous les blocs ont 'original'
  // ═══════════════════════════════════════════════════════════════
  const normalizedBlocks = finalBlocks.map(block => {
    // Si le bloc a déjà 'original', tout va bien
    if (block.original) {
      // Supprimer 'text' si présent pour éviter la confusion
      const { text, ...blockWithoutText } = block
      return blockWithoutText
    }

    // Si le bloc a 'text' mais pas 'original', utiliser 'text' comme 'original'
    if (block.text) {
      console.warn(`[processSRT] Block #${block.index} has 'text' but no 'original', normalizing...`)
      const { text, ...rest } = block
      return {
        ...rest,
        original: text,
        corrected: block.corrected || text
      }
    }

    // Cas rare : ni 'original' ni 'text'
    console.error(`[processSRT] Block #${block.index} has neither 'original' nor 'text'!`)
    return {
      ...block,
      original: '',
      corrected: block.corrected || ''
    }
  })

  return {
    blocks: normalizedBlocks,
    debugLogs: debugLogs,
    pass0Stats: pass === null && typeof pass0Stats !== 'undefined' ? pass0Stats : null
  }
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

// ═══════════════════════════════════════════════════════════════
// PASS 5 : VOCABULAIRE (SANS API CLAUDE)
// ═══════════════════════════════════════════════════════════════

/**
 * Charge les règles de vocabulaire depuis l'API
 * Utilise un cache pour éviter trop d'appels
 */
async function loadVocabularyRules() {
  // Vérifier le cache
  const now = Date.now()
  if (CACHED_VOCABULARY_RULES && (now - CACHE_TIMESTAMP < CACHE_DURATION)) {
    console.log('[Pass 5] Using cached vocabulary rules')
    return CACHED_VOCABULARY_RULES
  }

  // Vérifier que la variable d'environnement VOCABULARY_API_URL est définie
  if (typeof VOCABULARY_API_URL === 'undefined' || !VOCABULARY_API_URL) {
    console.error('[Pass 5] VOCABULARY_API_URL environment variable is not defined')
    console.log('[Pass 5] Falling back to default rules')
    return getDefaultVocabularyRules()
  }

  try {
    console.log('[Pass 5] Fetching vocabulary rules from API:', VOCABULARY_API_URL)

    const response = await fetch(VOCABULARY_API_URL, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      // Timeout après 5 secondes
      signal: AbortSignal.timeout(5000)
    })

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`)
    }

    const data = await response.json()

    if (data.success && data.rules) {
      console.log(`[Pass 5] Loaded ${data.rules.length} vocabulary rules from API`)

      // Mettre en cache
      CACHED_VOCABULARY_RULES = {
        version: data.version || '1.0',
        rules: data.rules
      }
      CACHE_TIMESTAMP = now

      return CACHED_VOCABULARY_RULES
    } else {
      throw new Error('Invalid API response format')
    }

  } catch (error) {
    console.error('[Pass 5] Failed to load vocabulary rules from API:', error.message)
    console.log('[Pass 5] Falling back to default rules')

    // Fallback : règles par défaut
    return getDefaultVocabularyRules()
  }
}

/**
 * Règles de vocabulaire par défaut (fallback)
 * Utilisées si l'API ne répond pas
 */
function getDefaultVocabularyRules() {
  return {
    version: '1.0',
    rules: [
      {
        id: 'rule-001',
        enabled: true,
        type: 'exact',
        variants: ['scanner', 'scanneur', 'scanneurs', 'Scanners', 'SCANNER'],
        replace: 'scanner',
        category: 'medical',
        reason: 'Uniformisation terminologie médicale'
      },
      {
        id: 'rule-002',
        enabled: true,
        type: 'exact',
        variants: ['covid', 'Covid', 'COVID', 'covid-19', 'Covid-19', 'COVID-19', 'covid 19'],
        replace: 'COVID-19',
        category: 'medical',
        reason: 'Normalisation acronyme'
      },
      {
        id: 'rule-003',
        enabled: true,
        type: 'regex',
        search: '\\bau\\s*niveau\\s*de\\b',
        replace: 'à propos de',
        category: 'expressions',
        options: { flags: 'gi' },
        reason: 'Expression impropre'
      }
    ]
  }
}

/**
 * Normalise un texte pour le matching souple
 */
function normalizeFuzzy(text, options = {}) {
  let normalized = text

  // Ignorer la casse
  if (options.ignoreCase) {
    normalized = normalized.toLowerCase()
  }

  // Ignorer les accents (approximation simple pour JavaScript)
  if (options.ignoreAccents) {
    normalized = normalized
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
  }

  // Ignorer les tirets et espaces
  if (options.ignoreHyphens) {
    normalized = normalized.replace(/[-\s]+/g, '')
  }

  // Ignorer les "s" finaux
  if (options.ignorePlural) {
    normalized = normalized.replace(/s\b/gi, '')
  }

  return normalized
}

/**
 * Normalise un texte SRT pour la comparaison (gère multi-lignes, espaces, etc.)
 */
function normalizeForComparison(text) {
  if (!text) return ''

  return text
    .toLowerCase()
    .trim()
    // Normaliser tous les types d'espaces (insécables, multiples, etc.)
    .replace(/\s+/g, ' ')
    // Normaliser les retours à la ligne
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Supprimer espaces en début/fin de chaque ligne
    .split('\n').map(line => line.trim()).join('\n')
    // Normaliser les apostrophes
    .replace(/['']/g, "'")
    // Normaliser les guillemets
    .replace(/[""]/g, '"')
}

/**
 * Construit un pattern regex pour la recherche souple
 * Permet d'ignorer les "s" sur CHAQUE mot de l'expression
 */
function buildFuzzyPattern(search, options = {}) {
  // Séparer en mots
  const words = search.trim().split(/\s+/)
  const patterns = []

  words.forEach(word => {
    // Échapper les caractères spéciaux regex
    let pattern = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

    // Si ignorePlural, rendre le "s" final optionnel pour chaque mot
    if (options.ignorePlural) {
      // Si le pattern se termine déjà par "s", le remplacer par "s?" (optionnel)
      if (/s$/.test(pattern)) {
        // Remplacer le "s" final par "s?" pour le rendre optionnel
        pattern = pattern.replace(/s$/, 's?')
      } else {
        // Sinon, ajouter "s?" à la fin
        pattern += 's?'
      }
    }

    // Si ignoreAccents, construire une version avec variantes d'accents
    if (options.ignoreAccents) {
      const accentMap = {
        'e': '[eéèêë]',
        'E': '[EÉÈÊË]',
        'a': '[aàâä]',
        'A': '[AÀÂÄ]',
        'i': '[iîï]',
        'I': '[IÎÏ]',
        'o': '[oôö]',
        'O': '[OÔÖ]',
        'u': '[uùûü]',
        'U': '[UÙÛÜ]',
        'c': '[cç]',
        'C': '[CÇ]'
      }

      for (const [base, classPattern] of Object.entries(accentMap)) {
        // Remplacer le caractère de base par sa classe
        const escapedBase = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        pattern = pattern.replace(new RegExp(escapedBase, 'g'), classPattern)
      }
    }

    // Si ignoreHyphens, permettre tiret ou espace ou rien entre les caractères
    if (options.ignoreHyphens) {
      pattern = pattern.replace(/\\-/g, '[-\\s]?').replace(/\\ /g, '[-\\s]?')
    }

    // Si ignoreApostrophes, accepter apostrophe droite, courbe ou espace
    if (options.ignoreApostrophes) {
      // Remplacer les apostrophes (droite échappée \' et courbe non-échappée ')
      pattern = pattern.replace(/\\'/g, '[\'\\u2019\\s]')  // Apostrophe droite échappée
      pattern = pattern.replace(/'/g, '[\'\\u2019\\s]')    // Apostrophe courbe (U+2019)
    }

    patterns.push(`\\b${pattern}\\b`)
  })

  // Joindre les mots avec des espaces/tirets selon les options
  const separator = options.ignoreHyphens ? '[-\\s]+' : '\\s+'
  const fullPattern = patterns.join(separator)

  // Construire les flags
  let flags = 'g'
  if (options.ignoreCase) {
    flags += 'i'
  }

  return new RegExp(fullPattern, flags)
}

/**
 * Applique une règle de vocabulaire à un texte
 */
function applyVocabularyRule(text, rule) {
  if (!rule.enabled) {
    return { text, matched: false, corrections: [] }
  }

  let corrected = text
  const corrections = []

  try {
    switch (rule.type) {
      case 'exact':
        // Recherche de variantes exactes
        if (rule.variants && Array.isArray(rule.variants)) {
          rule.variants.forEach(variant => {
            // Échapper les caractères spéciaux regex
            const escapedVariant = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            // Recherche avec limites de mots
            const pattern = new RegExp(`\\b${escapedVariant}\\b`, 'g')

            const matches = corrected.match(pattern)
            if (matches && matches.length > 0) {
              // Stocker le texte exact trouvé (le premier match) comme original
              const foundText = matches[0]
              corrected = corrected.replace(pattern, rule.replace)
              corrections.push({
                type: 'fault',
                original: foundText,  // Texte réellement trouvé, pas le pattern
                corrected: rule.replace,
                reason: rule.reason || 'Règle de vocabulaire',
                count: matches.length
              })
            }
          })
        }
        break

      case 'souple':
        // Recherche souple avec normalisation
        const options = rule.options || {}
        const search = rule.search || ''

        if (search) {
          // Construire un pattern regex intelligent basé sur les options
          // Cela permet d'ignorer les "s" sur CHAQUE mot de l'expression
          const pattern = buildFuzzyPattern(search, options)
          const matches = corrected.match(pattern)

          if (matches && matches.length > 0) {
            // Stocker le texte exact trouvé (le premier match) comme original
            const foundText = matches[0]
            corrected = corrected.replace(pattern, rule.replace)
            corrections.push({
              type: 'fault',
              original: foundText,  // Texte réellement trouvé, pas le pattern
              corrected: rule.replace,
              reason: rule.reason || 'Règle de vocabulaire',
              count: matches.length
            })
          }
        }
        break

      case 'regex':
        // Recherche avec regex personnalisée
        const regexFlags = rule.options?.flags || 'g'
        const regexPattern = new RegExp(rule.search, regexFlags)
        const regexMatches = corrected.match(regexPattern)

        if (regexMatches && regexMatches.length > 0) {
          // Stocker le texte exact trouvé (le premier match) comme original
          const foundText = regexMatches[0]
          corrected = corrected.replace(regexPattern, rule.replace)
          corrections.push({
            type: 'fault',
            original: foundText,  // Texte réellement trouvé, pas le pattern
            corrected: rule.replace,
            reason: rule.reason || 'Règle de vocabulaire',
            count: regexMatches.length
          })
        }
        break
    }
  } catch (error) {
    console.error(`[Pass 5] Error applying rule ${rule.id}:`, error.message)
  }

  return {
    text: corrected,
    matched: corrections.length > 0,
    corrections
  }
}

/**
 * Applique toutes les règles de vocabulaire à un bloc
 * @param {Object} block - Bloc SRT à corriger
 * @param {Object} vocabularyRules - Règles de vocabulaire à appliquer
 */
function applyVocabularyRules(block, vocabularyRules) {
  // Partir du texte déjà corrigé par les passes précédentes
  let corrected = block.corrected || block.text || ''
  const vocabularyCorrections = []

  const rules = vocabularyRules?.rules || []

  rules.forEach(rule => {
    const result = applyVocabularyRule(corrected, rule)
    if (result.matched) {
      corrected = result.text
      vocabularyCorrections.push(...result.corrections)
    }
  })

  // Fusionner les corrections existantes avec les nouvelles corrections de vocabulaire
  const existingCorrections = block.corrections || []
  const allCorrections = [...existingCorrections, ...vocabularyCorrections]

  return {
    ...block,
    corrected: corrected,  // Mettre à jour le champ "corrected", pas "text"
    corrections: allCorrections,  // Fusionner toutes les corrections
    correctedByPass5: vocabularyCorrections.length > 0
  }
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
  return `Corrige les sous-titres comme un professionnel de l'orthographe, conjugaison, grammaire et typographie, tout en respectant le parlé de la personne dans ce fichier SRT.

Format de réponse JSON :
{
  "blocks": [
    {
      "index": 1,
      "original": "texte EXACT du bloc (non modifié)",
      "corrected": "texte du bloc avec TOUTES les corrections APPLIQUÉES",
      "corrections": [
        {"type": "fault", "original": "rendez vous", "corrected": "rendez-vous", "reason": "Tiret manquant"}
      ]
    }
  ]
}

IMPORTANT:
- "original" = texte tel quel, sans rien changer
- "corrected" = texte avec TOUTES les fautes corrigées
- "corrections" = liste des corrections individuelles

Types : "fault" (faute à corriger), "doubt" (ambiguïté)
Si aucune correction dans un bloc, ne pas inclure le bloc dans la réponse.`
}

/**
 * PASSE 2 : Institutions + formatage
 */
function buildSystemPromptPass2() {
  return `Tu reçois un texte DÉJÀ CORRIGÉ.
Applique ces règles :

1. INSTITUTIONS :
   ✗ le gouvernement, l'assemblée nationale, le sénat, le parlement
   ✓ le Gouvernement, l'Assemblée nationale, le Sénat, le Parlement

2. ESPACES MILLIERS + ORDINAUX :
   ✗ 10000, 1000e
   ✓ 10 000, 1 000 e

3. TRAITS D'UNION :
   ✗ au dela, par dessus, rendez vous, au dessus, en dessous
   ✓ au-delà, par-dessus, rendez-vous, au-dessus, en-dessous

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
        {"type": "fault", "original": "le gouvernement", "corrected": "le Gouvernement", "reason": "Institution"},
        {"type": "fault", "original": "au dela", "corrected": "au-delà", "reason": "Trait d'union manquant"},
        {"type": "fault", "original": "10000", "corrected": "10 000", "reason": "Espace milliers"}
      ]
    }
  ]
}

IMPORTANT : Toutes les corrections sont de type "fault"`
}

/**
 * PASSE 3 : Ministères + Formules de politesse (après institutions)
 */
function buildSystemPromptPass3() {
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
        {"type": "fault", "original": "...", "corrected": "...", "reason": "..."}
      ]
    }
  ]
}

IMPORTANT : Toutes les corrections sont de type "fault"`
}

/**
 * PASSE 4 : UNIQUEMENT ambiguïté de genre (règle isolée pour fiabilité)
 */
function buildSystemPromptPass4() {
  return `Tu corriges des sous-titres français.

RÈGLE UNIQUE À APPLIQUER :
Quand tu vois "je" + verbe d'état (être, devenir, rester, paraître, sembler, etc.) + adjectif/participe passé accordable,
tu DOIS créer UNE SEULE correction de type "doubt" qui englobe TOUTE l'expression "je + verbe + adjectif".

IMPORTANT : Ne crée qu'UNE SEULE correction par ambiguïté détectée, pas plusieurs variations du même cas.

POURQUOI ? Dans un sous-titre, on ne sait pas si "je" est un homme ou une femme.

EXEMPLES :
- "je suis venu" → corrected: "je suis venu", alternative: "je suis venue"
- "je suis engagée" → corrected: "je suis engagée", alternative: "je suis engagé"
- "je reste très attachée" → corrected: "je reste très attachée", alternative: "je reste très attaché"
- "je ne suis plus compétitrice" → corrected: "je ne suis plus compétitrice", alternative: "je ne suis plus compétiteur"
- "Je semble perdue" → corrected: "Je semble perdue", alternative: "Je semble perdu"

FORMAT DE RÉPONSE :
{
  "blocks": [
    {
      "index": 1,
      "original": "texte exact reçu",
      "corrected": "texte exact reçu",
      "corrections": [
        {
          "type": "doubt",
          "original": "je suis venu",
          "corrected": "je suis venu",
          "alternative": "je suis venue",
          "reason": "Genre du locuteur inconnu"
        }
      ]
    }
  ]
}

NOTES :
- "corrected" doit être identique à "original" (forme du texte)
- "alternative" doit contenir l'autre forme de genre
- Si aucune ambiguïté trouvée : {"blocks": []}`
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
async function correctWithClaude(blocks, modelType = 'haiku', pass = 1, debugLogs = null) {
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

  // DEBUG Pass 4 : Log du user prompt pour voir ce qu'on envoie
  if (pass === 4) {
    const userPrompt = buildUserPrompt(blocks)
    console.log(`[DEBUG Pass 4] User prompt (first 1000 chars):`, userPrompt.substring(0, 1000))
    // Ajouter aux logs de debug pour le frontend
    if (debugLogs) {
      debugLogs.push({
        type: 'pass4_user_prompt',
        content: userPrompt,
        blocksCount: blocks.length,
        timestamp: new Date().toISOString()
      })
    }
  }

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

  // DEBUG Pass 4 : Log complet de la réponse pour comprendre pourquoi aucune correction
  if (pass === 4) {
    console.log(`[DEBUG Pass 4] FULL Claude response:`, content)
    // Ajouter aux logs de debug pour le frontend
    if (debugLogs) {
      debugLogs.push({
        type: 'pass4_claude_response',
        content: content,
        blocksCount: blocks.length,
        timestamp: new Date().toISOString()
      })
    }
  }

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
      let originalBlock = blocks.find(b => b.index === correctedBlock.index)

      // VALIDATION CRITIQUE : Vérifier que le bloc retourné par Claude correspond bien
      if (!originalBlock) {
        console.error(`[correctWithClaude] Pass ${pass} - Block #${correctedBlock.index} returned by Claude but not found in original blocks!`)
        return null
      }

      // Valider que l'original retourné par Claude correspond au texte du bloc
      // Support pour inputBlocks (qui ont 'original') ET blocs parsés (qui ont 'text')
      // Utiliser une normalisation robuste pour gérer espaces insécables, multi-lignes, etc.
      const normalizedClaudeOriginal = normalizeForComparison(correctedBlock.original || '')
      const originalBlockText = originalBlock.original || originalBlock.text
      let normalizedBlockText = normalizeForComparison(originalBlockText)

      if (normalizedClaudeOriginal && normalizedClaudeOriginal !== normalizedBlockText) {
        // Pour Pass 4, Claude peut se tromper d'index de ±1 car il y a beaucoup de blocs
        // Cherchons le bon bloc dans les blocs adjacents
        if (pass === 4) {
          const adjacentBlocks = [
            blocks.find(b => b.index === correctedBlock.index - 1),
            blocks.find(b => b.index === correctedBlock.index + 1)
          ].filter(Boolean)

          let foundCorrectBlock = null
          for (const adjacentBlock of adjacentBlocks) {
            const adjacentText = adjacentBlock.original || adjacentBlock.text
            const normalizedAdjacent = normalizeForComparison(adjacentText)
            if (normalizedAdjacent === normalizedClaudeOriginal) {
              foundCorrectBlock = adjacentBlock
              console.log(`[correctWithClaude] Pass 4 - Block #${correctedBlock.index}: Index mismatch, found correct text in block #${adjacentBlock.index}`)
              break
            }
          }

          if (foundCorrectBlock) {
            // Utiliser le bon bloc et corriger l'index
            originalBlock = foundCorrectBlock
            const foundText = foundCorrectBlock.original || foundCorrectBlock.text
            normalizedBlockText = normalizeForComparison(foundText)
            correctedBlock.index = foundCorrectBlock.index
          } else {
            const expectedText = originalBlock.original || originalBlock.text
            console.warn(`[correctWithClaude] Pass ${pass} - Block #${correctedBlock.index}: Claude's "original" doesn't match block text and no adjacent match found`)
            console.warn(`[correctWithClaude]   Expected: "${expectedText.substring(0, 60)}..."`)
            console.warn(`[correctWithClaude]   Got: "${correctedBlock.original?.substring(0, 60)}..."`)
            return null
          }
        } else {
          const expectedText = originalBlock.original || originalBlock.text
          console.warn(`[correctWithClaude] Pass ${pass} - Block #${correctedBlock.index}: Claude's "original" doesn't match block text`)
          console.warn(`[correctWithClaude]   Expected: "${expectedText.substring(0, 60)}..."`)
          console.warn(`[correctWithClaude]   Got: "${correctedBlock.original?.substring(0, 60)}..."`)
          // Ne pas retourner ce bloc, il y a une confusion d'index
          return null
        }
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
          // Support pour inputBlocks (qui ont 'original') ET blocs parsés (qui ont 'text')
          const blockTextToCheck = originalBlock.original || originalBlock.text

          // DEBUG Pass 4 : Log validation
          if (pass === 4) {
            const validationInfo = {
              blockIndex: correctedBlock.index,
              correctionOriginal: correction.original,
              blockText: blockTextToCheck,
              contains: blockTextToCheck.toLowerCase().includes(correction.original.toLowerCase())
            }
            console.log(`[DEBUG Pass 4 Validation] Block #${correctedBlock.index}:`)
            console.log(`  - Correction original: "${correction.original}"`)
            console.log(`  - Block text to check: "${blockTextToCheck}"`)
            console.log(`  - Does block contain correction? ${validationInfo.contains}`)

            if (debugLogs) {
              debugLogs.push({
                type: 'pass4_validation',
                ...validationInfo,
                timestamp: new Date().toISOString()
              })
            }
          }

          if (!validateCorrectionBelongsToBlock(correction, blockTextToCheck, correctedBlock.index)) {
            console.warn(`[correctWithClaude] Pass ${pass} - Rejecting correction from block #${correctedBlock.index}: "${correction.original}" → "${correction.corrected}"`)
            if (pass === 4) {
              console.log(`[DEBUG Pass 4] REJECTED - Block text: "${blockTextToCheck}"`)
              if (debugLogs) {
                debugLogs.push({
                  type: 'pass4_rejection',
                  blockIndex: correctedBlock.index,
                  correctionOriginal: correction.original,
                  correctionCorrected: correction.corrected,
                  blockText: blockTextToCheck,
                  timestamp: new Date().toISOString()
                })
              }
            }
            return false
          }

          return true
        }).map(correction => {
          // Nettoyer les annotations dans les corrections individuelles
          // SAUF pour Pass 4 où les parenthèses font partie de la correction (genre)
          return {
            ...correction,
            corrected: pass === 4 ? correction.corrected : cleanAnnotations(correction.corrected)
          }
        })
      }

      // Récupérer le texte original depuis NOS blocs parsés (source de vérité)
      // Ne PAS faire confiance à correctedBlock.original qui peut être incorrect
      // Support pour inputBlocks (qui ont 'original') ET blocs parsés (qui ont 'text')
      const originalText = originalBlock ? (originalBlock.original || originalBlock.text) : ''

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

    // DEBUG Pass 4 : Log final des corrections retournées
    if (pass === 4) {
      const totalCorrections = validatedBlocks.reduce((sum, block) => sum + (block.corrections?.length || 0), 0)
      console.log(`[DEBUG Pass 4] Returning ${validatedBlocks.length} blocks with ${totalCorrections} total corrections`)
      validatedBlocks.forEach(block => {
        if (block.corrections && block.corrections.length > 0) {
          console.log(`  Block #${block.index}: ${block.corrections.length} correction(s)`)
          block.corrections.forEach(c => {
            console.log(`    - "${c.original}" → "${c.corrected}"`)
          })
        }
      })
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
