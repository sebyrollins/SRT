/**
 * Module d'édition des corrections
 * Gère l'édition des blocs et des corrections individuelles
 */

import { openEditModal } from '../ui/modal.js'

/**
 * Convertit un texte en remplaçant apostrophes droites (') par courbes (')
 * SAUF les apostrophes doubles ('') qui sont préservées
 * @param {string} text - Texte à convertir
 * @returns {string} - Texte converti
 */
function convertApostrophes(text) {
  if (!text) return text
  // Protéger les doubles apostrophes avec un placeholder temporaire
  const placeholder = '\uFFFF' // Caractère Unicode privé jamais utilisé
  return text
    .replace(/''/g, placeholder)  // Protéger ''
    .replace(/'/g, '\u2019')      // Convertir ' simple
    .replace(new RegExp(placeholder, 'g'), "''") // Restaurer ''
}

/**
 * Applique un ensemble de corrections à un texte original
 * @param {string} originalText - Texte original
 * @param {Array} corrections - Liste de toutes les corrections
 * @param {Array} indexesToApply - Indices des corrections à appliquer
 * @returns {string} - Texte avec les corrections appliquées
 */
function applyCorrections(originalText, corrections, indexesToApply) {
  // Trier les corrections par position (de la fin vers le début pour éviter les décalages de position)
  const sortedCorrections = corrections
    .map((corr, idx) => ({ corr, idx }))
    .filter(item => indexesToApply.includes(item.idx))
    .sort((a, b) => b.corr.position - a.corr.position)

  let result = originalText
  for (const { corr } of sortedCorrections) {
    const before = result.substring(0, corr.position)
    const after = result.substring(corr.position + corr.original.length)
    result = before + corr.corrected + after
  }
  return result
}

/**
 * Édite le texte complet d'un bloc
 * @param {number} blockIndex - Index du bloc
 * @param {Object|string} AppStateOrNewText - État de l'application OU nouveau texte (pour édition inline)
 * @param {Object} SRTParser - Parser SRT
 * @param {Function} updateStats - Fonction de mise à jour des stats
 * @param {Function} renderBlocksTable - Fonction de rendu du tableau
 * @param {Function} updateMinimap - Fonction de mise à jour de la minimap
 */
export function editBlockText(blockIndex, AppStateOrNewText, SRTParser, updateStats, renderBlocksTable, updateMinimap) {
  // Si le deuxième argument est une string, c'est l'édition inline directe
  if (typeof AppStateOrNewText === 'string') {
    const newText = AppStateOrNewText
    // Récupérer les dépendances depuis window pour l'édition inline
    const AppState = window.AppState
    const block = AppState.blocks.find(b => b.index === blockIndex)
    if (!block) return

    // Sauvegarder la suggestion originale de Claude si pas déjà fait
    if (!block.hasOwnProperty('originalCorrected')) {
      block.originalCorrected = block.corrected
    }

    // Utiliser SRTParser depuis les paramètres de fonction (défini dans la signature)
    processBlockEdit(newText, block, AppState, SRTParser, updateStats, renderBlocksTable, updateMinimap)
    return
  }

  // Sinon, c'est l'ancien système avec modal
  const AppState = AppStateOrNewText
  const block = AppState.blocks.find(b => b.index === blockIndex)
  if (!block) return

  // Sauvegarder la suggestion originale de Claude si pas déjà fait
  if (!block.hasOwnProperty('originalCorrected')) {
    block.originalCorrected = block.corrected
  }

  // Debug : afficher les codes des caractères pour vérifier les apostrophes
  console.log('[editBlockText] Original:', block.original)
  console.log('[editBlockText] Original codes:', Array.from(block.original).map(c => `${c}=${c.charCodeAt(0)}`).join(' '))
  console.log('[editBlockText] Corrected:', block.corrected)
  console.log('[editBlockText] Corrected codes:', Array.from(block.corrected).map(c => `${c}=${c.charCodeAt(0)}`).join(' '))

  // Déterminer la suggestion à afficher
  const suggestionToShow = block.hasOwnProperty('originalCorrected') && block.originalCorrected !== undefined
    ? block.originalCorrected
    : block.corrected

  // Callback de sauvegarde
  const handleSave = (newValue) => {
    processBlockEdit(newValue, block, AppState, SRTParser, updateStats, renderBlocksTable, updateMinimap)
  }

  // Ouvrir le modal avec le système réutilisable
  openEditModal({
    originalText: block.original,
    suggestedText: suggestionToShow,
    currentValue: block.corrected,
    showSuggestion: false, // Cacher la section suggestion pour l'édition de bloc entier
    onSave: handleSave,
    multiline: true // Mode textarea avec Ctrl+Enter
  })
}

/**
 * Traite l'édition d'un bloc (factorisation de la logique commune)
 * @param {string} newValue - Nouvelle valeur
 * @param {Object} block - Bloc à éditer
 * @param {Object} AppState - État de l'application
 * @param {Object} SRTParser - Parser SRT
 * @param {Function} updateStats - Fonction de mise à jour des stats
 * @param {Function} renderBlocksTable - Fonction de rendu du tableau
 * @param {Function} updateMinimap - Fonction de mise à jour de la minimap
 */
function processBlockEdit(newValue, block, AppState, SRTParser, updateStats, renderBlocksTable, updateMinimap) {
    const processedValue = convertApostrophes(newValue)
    const oldCorrected = block.corrected

    // Cas 1 : Aucun changement par rapport à la suggestion de Claude actuelle
    // L'utilisateur a cliqué et sorti sans modifier → ne rien faire
    // (toutes les corrections sont déjà validées puisqu'on vérifie avant d'autoriser l'édition)
    if (processedValue === oldCorrected) {
      return
    }

    // Cas 2 : Retour au texte original → Dévalider les corrections (ne pas les supprimer)
    if (processedValue === block.original) {
      // Dévalider toutes les corrections de ce bloc (mais les garder)
      if (block.corrections && block.corrections.length > 0) {
        block.corrections.forEach((_, idx) => {
          const correctionId = `${block.index}-${idx}`
          AppState.validatedCorrections.delete(correctionId)
        })
      }

      // Restaurer le texte corrigé original de Claude (pas l'original avec fautes)
      if (block.hasOwnProperty('originalCorrected') && block.originalCorrected !== undefined) {
        block.corrected = block.originalCorrected
      }

      // Mettre à jour les stats
      const stats = SRTParser.calculateStats(AppState.blocks)
      updateStats(stats)

      // Re-render
      renderBlocksTable()
      updateMinimap()
      return
    }

    // Cas 3 : Retour à la suggestion originale de Claude → Restaurer et valider
    if (block.hasOwnProperty('originalCorrected') && processedValue === block.originalCorrected) {
      // Valider toutes les corrections et restaurer leurs propriétés originales
      if (block.corrections && block.corrections.length > 0) {
        block.corrections.forEach((correction, idx) => {
          const correctionId = `${block.index}-${idx}`

          // Restaurer les types et raisons originaux si modifiés
          if (correction.hasOwnProperty('originalSuggestion')) {
            correction.corrected = correction.originalSuggestion
            delete correction.originalSuggestion
          }
          if (correction.hasOwnProperty('originalType')) {
            correction.type = correction.originalType
            delete correction.originalType
          }
          if (correction.hasOwnProperty('originalReason')) {
            correction.reason = correction.originalReason
            delete correction.originalReason
          }
          if (correction.isManuallyEdited) {
            correction.isManuallyEdited = false
          }

          // VALIDER la correction
          AppState.validatedCorrections.add(correctionId)
        })
      }

      // Restaurer le texte corrigé de Claude
      block.corrected = block.originalCorrected

      // Mettre à jour les stats
      const stats = SRTParser.calculateStats(AppState.blocks)
      updateStats(stats)

      // Re-render
      renderBlocksTable()
      updateMinimap()
      return
    }

    // Cas 4 : Modification du texte (différent de l'original et de la suggestion)
    if (processedValue && processedValue !== block.original && processedValue !== oldCorrected) {
      const oldCorrections = block.corrections ? [...block.corrections] : []

      if (oldCorrections.length === 0) {
        // Pas de corrections → créer une correction de type doute validée
        console.log(`Bloc #${block.index}: Pas de corrections, création d'une correction doute`)

        block.corrections = [{
          type: 'doubt',
          original: block.original,
          corrected: processedValue,
          reason: 'Modifié manuellement',
          position: 0,
          isManuallyEdited: true
        }]

        block.corrected = processedValue

        // Valider automatiquement cette correction en doute
        AppState.validatedCorrections.add(`${block.index}-0`)

        // Mettre à jour les stats
        const stats = SRTParser.calculateStats(AppState.blocks)
        updateStats(stats)

        // Re-render
        renderBlocksTable()
        updateMinimap()
        return
      }

      // Analyser chaque correction pour voir si elle a été acceptée ou rejetée
      // Tester toutes les combinaisons possibles (2^n)
      let foundMatch = false
      let acceptedCorrections = []

      const numCorrections = oldCorrections.length
      const maxCombinations = 1 << numCorrections // 2^n

      for (let mask = 0; mask < maxCombinations; mask++) {
        const correctionIndexesToApply = []
        for (let i = 0; i < numCorrections; i++) {
          if (mask & (1 << i)) {
            correctionIndexesToApply.push(i)
          }
        }

        // Reconstruire le texte avec cette combinaison de corrections
        const reconstructed = applyCorrections(block.original, oldCorrections, correctionIndexesToApply)

        if (reconstructed === processedValue) {
          // On a trouvé la combinaison correspondante !
          acceptedCorrections = correctionIndexesToApply
          foundMatch = true
          console.log(`Bloc #${block.index}: Corrections acceptées: ${acceptedCorrections.join(', ')}`)
          break
        }
      }

      // Dévalider toutes les corrections d'abord
      oldCorrections.forEach((_, idx) => {
        const correctionId = `${block.index}-${idx}`
        AppState.validatedCorrections.delete(correctionId)
      })

      if (foundMatch) {
        // Marquer chaque correction individuellement
        oldCorrections.forEach((correction, idx) => {
          const correctionId = `${block.index}-${idx}`

          if (acceptedCorrections.includes(idx)) {
            // Correction acceptée → garder le type original et valider
            // Sauvegarder le type original si pas déjà fait
            if (!correction.hasOwnProperty('originalType')) {
              correction.originalType = correction.type
            }
            // Garder le type original (fault ou doubt)
            correction.isManuallyEdited = false
            // Valider cette correction
            AppState.validatedCorrections.add(correctionId)
          } else {
            // Correction rejetée → passer en doute validé
            // Sauvegarder le type original si pas déjà fait
            if (!correction.hasOwnProperty('originalType')) {
              correction.originalType = correction.type
            }
            correction.type = 'doubt'
            correction.reason = 'Correction rejetée par l\'utilisateur'
            correction.isManuallyEdited = true
            // Valider cette correction en tant que doute
            AppState.validatedCorrections.add(correctionId)
          }
        })

        // Mettre à jour le texte corrigé
        block.corrected = processedValue

        // Déterminer le type global du bloc (le plus restrictif)
        const hasDoubt = oldCorrections.some(c => c.type === 'doubt')
        console.log(`Bloc #${block.index}: Type global = ${hasDoubt ? 'doubt' : 'fault'}`)
      } else {
        // Aucune combinaison ne correspond → créer une nouvelle correction manuelle
        console.log(`Bloc #${block.index}: Modification manuelle, aucune combinaison ne correspond`)

        block.corrections = [{
          type: 'doubt',
          original: block.original,
          corrected: processedValue,
          reason: 'Modifié manuellement',
          position: 0,
          originalSuggestion: oldCorrected,
          isManuallyEdited: true
        }]

        block.corrected = processedValue

        // Valider automatiquement cette correction en doute
        AppState.validatedCorrections.add(`${block.index}-0`)
      }

      // Mettre à jour les stats
      const stats = SRTParser.calculateStats(AppState.blocks)
      updateStats(stats)

      // Re-render
      renderBlocksTable()
      updateMinimap()
    }
}

/**
 * Édite une correction avec modal moderne
 * @param {number} blockIndex - Index du bloc
 * @param {number} corrIndex - Index de la correction
 * @param {Object} AppState - État de l'application
 * @param {Object} SRTParser - Parser SRT
 * @param {Function} updateStats - Fonction de mise à jour des stats
 * @param {Function} renderBlocksTable - Fonction de rendu du tableau
 * @param {Function} updateMinimap - Fonction de mise à jour de la minimap
 */
export function editCorrection(blockIndex, corrIndex, AppState, SRTParser, updateStats, renderBlocksTable, updateMinimap) {
  const block = AppState.blocks.find(b => b.index === blockIndex)
  if (!block) return

  const correction = block.corrections[corrIndex]
  if (!correction) return

  // ID de correction pour validation
  const correctionId = `${blockIndex}-${corrIndex}`

  // Sauvegarder la suggestion originale, le type original et la raison originale si pas déjà fait
  if (!correction.hasOwnProperty('originalSuggestion')) {
    correction.originalSuggestion = correction.corrected
    correction.originalType = correction.type
    correction.originalReason = correction.reason
  }

  // Déterminer la suggestion à afficher
  const suggestionToShow = correction.hasOwnProperty('originalSuggestion') && correction.originalSuggestion !== undefined
    ? correction.originalSuggestion
    : correction.corrected

  // Callback de sauvegarde
  const handleSave = (newValue) => {
    const processedValue = convertApostrophes(newValue)

    if (processedValue) {
      const oldCorrected = correction.corrected

      // Mettre à jour la correction
      correction.corrected = processedValue

      // Mettre à jour le texte du bloc
      block.corrected = block.corrected.replace(oldCorrected, processedValue)

      // Vérifier si la modification est différente de la suggestion originale
      const isDifferentFromSuggestion = processedValue !== correction.originalSuggestion

      if (isDifferentFromSuggestion) {
        // Sauvegarder le type et la raison originale si pas déjà fait
        if (!correction.hasOwnProperty('originalType')) {
          correction.originalType = correction.type
        }
        if (!correction.hasOwnProperty('originalReason')) {
          correction.originalReason = correction.reason
        }

        // Toute modification différente de la suggestion de Claude → passer en doute validé
        console.log(`Bloc #${block.index}, correction #${corrIndex}: Modification différente de la suggestion → doute validé`)
        console.log(`  Modifié: "${processedValue}"`)
        console.log(`  Suggestion: "${correction.originalSuggestion}"`)

        correction.type = 'doubt'
        correction.reason = 'Modifié manuellement'
        correction.isManuallyEdited = true
      } else {
        // Remis comme la suggestion → repasser au type original
        correction.type = correction.originalType || 'fault'
        correction.reason = correction.originalReason
        correction.isManuallyEdited = false
      }

      // Marquer la correction comme validée
      AppState.validatedCorrections.add(correctionId)

      // Mettre à jour les stats et la jauge
      const stats = SRTParser.calculateStats(AppState.blocks)
      updateStats(stats)

      // Re-render
      renderBlocksTable()
      updateMinimap()
    }
  }

  // Ouvrir le modal avec le système réutilisable
  openEditModal({
    originalText: correction.original,
    suggestedText: suggestionToShow,
    currentValue: correction.corrected,
    showSuggestion: true, // Afficher la section suggestion pour l'édition de correction
    onSave: handleSave,
    multiline: false // Mode single line avec Enter
  })
}
