/**
 * Module de réinitialisation et rejet des corrections
 * Gère la réinitialisation, le rejet et le basculement de genre
 */

/**
 * Extrait la forme alternative de genre d'une correction
 * @param {Object} correction - Correction avec champ alternative
 * @returns {string} - Forme alternative
 */
function extractAlternativeGender(correction) {
  // Nouveau format : champ "alternative" fourni directement par le worker
  if (correction.alternative) {
    return correction.alternative
  }

  // Ancien format : extraire "(ou XXX)" des parenthèses
  const corrected = correction.corrected
  const match = corrected.match(/\(ou\s+([^)]+)\)/)
  if (!match) {
    return corrected // Pas de forme alternative trouvée
  }

  const alternative = match[1].trim()
  const withoutParens = corrected.substring(0, match.index).trim()

  // Compter les mots dans l'alternative
  const alternativeWords = alternative.split(/\s+/)
  const alternativeWordCount = alternativeWords.length

  // Extraire les mots du texte avant parenthèses
  const words = withoutParens.split(/\s+/)

  // Remplacer les N derniers mots par l'alternative
  const beforeWords = words.slice(0, -alternativeWordCount)

  return [...beforeWords, ...alternativeWords].join(' ')
}

/**
 * Réinitialise une correction modifiée manuellement à la suggestion originale de Claude
 * @param {number} blockIndex - Index du bloc
 * @param {number} corrIndex - Index de la correction
 * @param {Object} AppState - État de l'application
 * @param {Object} SRTParser - Parser SRT
 * @param {Function} updateStats - Fonction de mise à jour des stats
 * @param {Function} renderBlocksTable - Fonction de rendu du tableau
 * @param {Function} updateMinimap - Fonction de mise à jour de la minimap
 */
export function resetToOriginalSuggestion(blockIndex, corrIndex, AppState, SRTParser, updateStats, renderBlocksTable, updateMinimap) {
  const block = AppState.blocks.find(b => b.index === blockIndex)
  if (!block || !block.corrections || !block.corrections[corrIndex]) {
    return
  }

  const correction = block.corrections[corrIndex]

  // Récupérer la suggestion originale de Claude
  const originalSuggestion = correction.originalSuggestion
  if (!originalSuggestion) {
    console.log(`[resetToOriginalSuggestion] Pas de suggestion originale pour bloc #${blockIndex}, correction #${corrIndex}`)
    return
  }

  // Remplacer la valeur actuelle par la suggestion originale
  const currentValue = correction.corrected
  block.corrected = block.corrected.replace(currentValue, originalSuggestion)
  correction.corrected = originalSuggestion

  // Restaurer le type et la raison originale
  if (correction.originalType) {
    correction.type = correction.originalType
  }
  if (correction.originalReason) {
    correction.reason = correction.originalReason
  }

  // Retirer de validatedCorrections pour revenir à l'état non validé
  const correctionId = `${blockIndex}-${corrIndex}`
  AppState.validatedCorrections.delete(correctionId)

  // Retirer le flag de modification manuelle
  correction.isManuallyEdited = false

  console.log(`[resetToOriginalSuggestion] Bloc #${blockIndex}, correction #${corrIndex} réinitialisée à "${originalSuggestion}"`)

  // Mettre à jour les stats et la jauge
  const stats = SRTParser.calculateStats(AppState.blocks)
  updateStats(stats)

  // Mettre à jour l'affichage
  renderBlocksTable()
  updateMinimap()
}

/**
 * Bascule entre les deux formes de genre pour une correction de type "doubt"
 * État 1 (défaut): texte original (ex: "je suis venu")
 * État 2: forme alternative (ex: "je suis venue")
 * @param {number} blockIndex - Index du bloc
 * @param {number} corrIndex - Index de la correction
 * @param {Object} AppState - État de l'application
 * @param {Object} SRTParser - Parser SRT
 * @param {Function} updateStats - Fonction de mise à jour des stats
 * @param {Function} renderBlocksTable - Fonction de rendu du tableau
 * @param {Function} updateMinimap - Fonction de mise à jour de la minimap
 */
export function toggleGender(blockIndex, corrIndex, AppState, SRTParser, updateStats, renderBlocksTable, updateMinimap) {
  const block = AppState.blocks.find(b => b.index === blockIndex)
  if (!block || !block.corrections || !block.corrections[corrIndex]) {
    return
  }

  const correction = block.corrections[corrIndex]
  const correctionId = `${blockIndex}-${corrIndex}`

  // Vérifier si c'est bien une correction de genre (avec champ alternative)
  if (correction.type !== 'doubt' || !correction.alternative) {
    console.log(`[toggleGender] Not a gender doubt correction (no alternative field)`)
    return
  }

  // Vérifier si le genre est déjà en forme alternative
  const isGenderSwitched = AppState.genderSwitched.has(correctionId)

  if (isGenderSwitched) {
    // Revenir à l'original
    AppState.genderSwitched.delete(correctionId)

    // Extraire la forme alternative
    const alternativeForm = extractAlternativeGender(correction)

    // Remplacer la forme alternative par l'original dans le texte
    if (block.corrected.includes(alternativeForm)) {
      block.corrected = block.corrected.replace(alternativeForm, correction.original)
    }
  } else {
    // Changer le genre : passer à la forme alternative
    AppState.genderSwitched.add(correctionId)

    // Extraire la forme alternative
    const alternativeForm = extractAlternativeGender(correction)

    // Remplacer l'original par la forme alternative
    if (block.corrected.includes(correction.original)) {
      block.corrected = block.corrected.replace(correction.original, alternativeForm)
    }
  }

  // Note: la correction reste toujours dans validatedCorrections (validée par défaut)

  // Mettre à jour les stats et l'affichage
  const stats = SRTParser.calculateStats(AppState.blocks)
  updateStats(stats)
  renderBlocksTable()
  updateMinimap()
}

/**
 * Rejette une correction et la convertit en doute validé
 * Garde le texte original (n'applique pas la correction)
 * @param {number} blockIndex - Index du bloc
 * @param {number} corrIndex - Index de la correction
 * @param {Object} AppState - État de l'application
 * @param {Object} SRTParser - Parser SRT
 * @param {Function} updateStats - Fonction de mise à jour des stats
 * @param {Function} renderBlocksTable - Fonction de rendu du tableau
 * @param {Function} updateMinimap - Fonction de mise à jour de la minimap
 */
export function rejectCorrection(blockIndex, corrIndex, AppState, SRTParser, updateStats, renderBlocksTable, updateMinimap) {
  const block = AppState.blocks.find(b => b.index === blockIndex)
  if (!block) return

  const correction = block.corrections[corrIndex]
  if (!correction) return

  // Sauvegarder la suggestion originale, le type et la raison si pas déjà fait
  if (!correction.hasOwnProperty('originalSuggestion')) {
    correction.originalSuggestion = correction.corrected
    correction.originalType = correction.type
    correction.originalReason = correction.reason
  }

  // Mettre à jour le texte du bloc pour garder l'original (défaire la correction)
  // block.corrected contient déjà toutes les corrections appliquées par Claude
  // On veut remplacer la suggestion par l'original
  if (block.corrected.includes(correction.originalSuggestion)) {
    block.corrected = block.corrected.replace(correction.originalSuggestion, correction.original)
  }

  // Mettre à jour la correction pour indiquer qu'on garde l'original
  correction.corrected = correction.original
  correction.reason = 'Rejeté (texte original conservé)'

  // Convertir en doute
  correction.type = 'doubt'

  // Marquer la correction comme validée (en tant que doute)
  const correctionId = `${blockIndex}-${corrIndex}`
  AppState.validatedCorrections.add(correctionId)

  // Mettre à jour les stats et la jauge
  const stats = SRTParser.calculateStats(AppState.blocks)
  updateStats(stats)

  // Re-render pour mettre à jour l'affichage avec couleur orange
  renderBlocksTable()
  updateMinimap()
}

/**
 * Réinitialise un bloc spécifique à son état initial
 * Supprime toutes les validations et restaure les types originaux pour ce bloc
 * @param {number} blockIndex - Index du bloc
 * @param {Object} AppState - État de l'application
 * @param {Object} SRTParser - Parser SRT
 * @param {Function} updateStats - Fonction de mise à jour des stats
 * @param {Function} renderBlocksTable - Fonction de rendu du tableau
 * @param {Function} updateMinimap - Fonction de mise à jour de la minimap
 */
export function resetBlockToInitialState(blockIndex, AppState, SRTParser, updateStats, renderBlocksTable, updateMinimap) {
  // Trouver le bloc
  const block = AppState.blocks.find(b => b.index === blockIndex)
  if (!block || !block.corrections || block.corrections.length === 0) {
    return
  }

  // CAS SPÉCIAL : Si le bloc n'avait pas de corrections à l'origine,
  // supprimer toutes les corrections créées manuellement
  if (block.hadOriginalCorrections === false) {
    // Supprimer toutes les validations et états de genre
    block.corrections.forEach((_, corrIndex) => {
      const correctionId = `${blockIndex}-${corrIndex}`
      AppState.validatedCorrections.delete(correctionId)
      AppState.genderSwitched.delete(correctionId)
    })

    // Supprimer toutes les corrections et restaurer le texte original
    block.corrections = []
    block.corrected = block.original

    // Mettre à jour les stats et la jauge
    const stats = SRTParser.calculateStats(AppState.blocks)
    updateStats(stats)

    // Re-render pour mettre à jour l'affichage
    renderBlocksTable()
    updateMinimap()
    return
  }

  // CAS NORMAL : Le bloc avait des corrections à l'origine, les restaurer
  // Supprimer toutes les validations pour ce bloc (sauf les corrections de type "doubt" de genre)
  block.corrections.forEach((correction, corrIndex) => {
    const correctionId = `${blockIndex}-${corrIndex}`

    // Pour les corrections de doute de GENRE (pas modifiées manuellement), on garde la validation mais on revient à l'original
    if (correction.type === 'doubt' && !correction.isManuallyEdited) {
      AppState.genderSwitched.delete(correctionId)
      // On garde dans validatedCorrections (reste validé)
    } else {
      // Pour les autres types (et corrections modifiées manuellement), retirer la validation
      AppState.validatedCorrections.delete(correctionId)
    }

    // Restaurer la suggestion originale si elle a été modifiée ou rejetée
    if (correction.hasOwnProperty('originalSuggestion')) {
      correction.corrected = correction.originalSuggestion
      delete correction.originalSuggestion
    }

    // Restaurer le type original si modifié
    if (correction.hasOwnProperty('originalType')) {
      correction.type = correction.originalType
      delete correction.originalType
    }
    // Restaurer la raison originale si elle existe
    if (correction.hasOwnProperty('originalReason')) {
      correction.reason = correction.originalReason
      delete correction.originalReason
    }
    // Retirer le flag de modification manuelle
    if (correction.isManuallyEdited) {
      correction.isManuallyEdited = false
    }
  })

  // Reconstruire block.corrected en appliquant toutes les corrections restaurées
  // SAUF les corrections de type "doubt" qui ne sont PAS validées (par défaut = original)
  // On trie les corrections par position pour les appliquer dans l'ordre
  const sortedCorrections = [...block.corrections].sort((a, b) => a.position - b.position)
  let correctedText = block.original
  let offset = 0

  sortedCorrections.forEach((correction, corrIndex) => {
    const correctionId = `${blockIndex}-${corrIndex}`

    // Pour les corrections "doubt" de GENRE (avec alternative), ne jamais les appliquer dans le rebuild
    // Elles restent validées mais montrent l'original par défaut
    // Elles seront appliquées seulement si on clique "Changer le genre"
    // MAIS pour les corrections modifiées manuellement, on DOIT les appliquer
    if (correction.type === 'doubt' && correction.alternative && !correction.isManuallyEdited) {
      return // Ne pas appliquer les corrections de genre dans le rebuild
    }

    const startPos = correction.position + offset
    const endPos = startPos + correction.original.length

    // Vérifier que la position est valide
    if (correctedText.substring(startPos, endPos) === correction.original) {
      // Remplacer l'original par le corrigé
      correctedText = correctedText.substring(0, startPos) + correction.corrected + correctedText.substring(endPos)

      // Ajuster l'offset pour les prochaines corrections
      offset += correction.corrected.length - correction.original.length
    }
  })

  block.corrected = correctedText

  // Mettre à jour les stats et la jauge
  const stats = SRTParser.calculateStats(AppState.blocks)
  updateStats(stats)

  // Re-render pour mettre à jour l'affichage
  renderBlocksTable()
  updateMinimap()
}
