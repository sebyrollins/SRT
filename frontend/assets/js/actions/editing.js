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
 * Édite le texte complet d'un bloc
 * @param {number} blockIndex - Index du bloc
 * @param {Object} AppState - État de l'application
 * @param {Object} SRTParser - Parser SRT
 * @param {Function} updateStats - Fonction de mise à jour des stats
 * @param {Function} renderBlocksTable - Fonction de rendu du tableau
 * @param {Function} updateMinimap - Fonction de mise à jour de la minimap
 */
export function editBlockText(blockIndex, AppState, SRTParser, updateStats, renderBlocksTable, updateMinimap) {
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
    const processedValue = convertApostrophes(newValue)
    const oldCorrected = block.corrected

    // Cas 1 : Aucun changement par rapport à la suggestion de Claude actuelle
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
      // Supprimer toutes les anciennes corrections de ce bloc
      const oldCorrections = block.corrections ? [...block.corrections] : []
      oldCorrections.forEach((_, idx) => {
        const correctionId = `${block.index}-${idx}`
        AppState.validatedCorrections.delete(correctionId)
      })

      // Déterminer le type original
      const originalType = (oldCorrections.length > 0 && oldCorrections[0].originalType)
        ? oldCorrections[0].originalType
        : (oldCorrections.length > 0 ? oldCorrections[0].type : 'fault')
      const originalReason = (oldCorrections.length > 0) ? oldCorrections[0].reason : 'Correction manuelle'

      // Remplacer par UNE SEULE correction
      block.corrections = [{
        type: originalType,
        original: block.original,
        corrected: processedValue,
        reason: 'Modifié manuellement',
        position: 0,
        originalSuggestion: oldCorrected,
        originalType: originalType,
        originalReason: originalReason,
        isManuallyEdited: true
      }]

      block.corrected = processedValue

      // Valider automatiquement cette correction
      AppState.validatedCorrections.add(`${block.index}-0`)

      // Mettre à jour les stats
      const stats = SRTParser.calculateStats(AppState.blocks)
      updateStats(stats)

      // Re-render
      renderBlocksTable()
      updateMinimap()
    }
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
        // Modifié différemment → marquer comme modifié manuellement mais GARDER le type original
        console.log(`Bloc #${block.index}, correction #${corrIndex}: Modification manuelle détectée`)
        console.log(`  Nouveau: "${processedValue}" (codes: ${Array.from(processedValue).map(c => c.charCodeAt(0)).join(',')})`)
        console.log(`  Suggestion: "${correction.originalSuggestion}" (codes: ${Array.from(correction.originalSuggestion).map(c => c.charCodeAt(0)).join(',')})`)

        // Sauvegarder le type et la raison originale si pas déjà fait
        if (!correction.hasOwnProperty('originalType')) {
          correction.originalType = correction.type
        }
        if (!correction.hasOwnProperty('originalReason')) {
          correction.originalReason = correction.reason
        }
        // Marquer comme modifié manuellement SANS changer le type
        correction.isManuallyEdited = true
        correction.reason = 'Modifié manuellement'
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
