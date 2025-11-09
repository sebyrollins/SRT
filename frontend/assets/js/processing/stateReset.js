/**
 * Module de réinitialisation d'état
 * Gère la réinitialisation de l'état après upload et le reset complet de l'application
 */

import { setActiveFilter, resetApp as resetAppState } from '../state/stateManager.js'
import { showSection as showSectionUI } from '../ui/sections.js'

/**
 * Valide automatiquement toutes les corrections de doute (genre)
 * @param {Object} AppState - État de l'application
 */
function autoValidateDoubtCorrections(AppState) {
  AppState.blocks.forEach(block => {
    if (block.corrections && block.corrections.length > 0) {
      block.corrections.forEach((correction, corrIndex) => {
        // Ne valider que les VRAIS doutes de genre (avec alternative), pas les corrections rejetées
        if (correction.type === 'doubt' && correction.alternative) {
          const correctionId = `${block.index}-${corrIndex}`
          AppState.validatedCorrections.add(correctionId)
        }
      })
    }
  })
  console.log('[Doubt] Corrections de genre auto-validées:', AppState.validatedCorrections.size)
}

/**
 * Réinitialise l'état initial (après upload)
 * Garde les corrections mineures pré-validées
 * @param {Object} AppState - État de l'application
 * @param {Object} SRTParser - Parser SRT
 * @param {Function} updateStats - Fonction de mise à jour des stats
 * @param {Function} renderBlocksTable - Fonction de rendu du tableau
 * @param {Function} updateMinimap - Fonction de mise à jour de la minimap
 */
export function resetToInitialState(AppState, SRTParser, updateStats, renderBlocksTable, updateMinimap) {
  // Vider toutes les validations et remettre les genres à l'original
  AppState.validatedCorrections.clear()
  AppState.genderSwitched.clear()

  // Restaurer les types originaux et supprimer les modifications
  AppState.blocks.forEach(block => {
    if (block.corrections && block.corrections.length > 0) {
      // CAS SPÉCIAL : Si le bloc n'avait pas de corrections à l'origine,
      // supprimer toutes les corrections créées manuellement
      if (block.hadOriginalCorrections === false) {
        block.corrections = []
        block.corrected = block.original
        return // Passer au bloc suivant
      }

      // CAS NORMAL : Le bloc avait des corrections à l'origine, les restaurer
      block.corrections.forEach((correction, corrIndex) => {
        // Restaurer la suggestion originale si elle a été modifiée ou rejetée
        if (correction.hasOwnProperty('originalSuggestion')) {
          correction.corrected = correction.originalSuggestion
          delete correction.originalSuggestion
        }

        // Si le type a été modifié, le restaurer
        if (correction.hasOwnProperty('originalType')) {
          correction.type = correction.originalType
          delete correction.originalType
        }
        // Restaurer la raison originale si elle existe
        if (correction.hasOwnProperty('originalReason')) {
          correction.reason = correction.originalReason
          delete correction.originalReason
        }
      })

      // Reconstruire block.corrected en appliquant toutes les corrections restaurées
      const sortedCorrections = [...block.corrections].sort((a, b) => a.position - b.position)
      let correctedText = block.original
      let offset = 0

      sortedCorrections.forEach(correction => {
        // Pour les corrections "doubt" de GENRE, ne jamais les appliquer dans le rebuild
        // Elles seront re-validées après mais montrent l'original par défaut
        // MAIS pour les corrections modifiées manuellement, on DOIT les appliquer
        if (correction.type === 'doubt' && correction.alternative && !correction.isManuallyEdited) {
          return
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
    }
  })

  // Re-valider automatiquement toutes les corrections de doute (genre)
  autoValidateDoubtCorrections(AppState)

  // Réinitialiser le filtre actif
  setActiveFilter(null)
  document.querySelectorAll('.stat-filter').forEach(btn => {
    btn.classList.remove('active')
  })

  // Mettre à jour les stats et la jauge
  const stats = SRTParser.calculateStats(AppState.blocks)
  updateStats(stats)

  // Re-render pour mettre à jour l'affichage
  renderBlocksTable()
  updateMinimap()

  console.log('État réinitialisé à l\'état initial (après upload)')
}

/**
 * Réinitialise l'application complètement
 * @param {Object} DOM - Références DOM
 * @param {Function} resetFileInput - Fonction de reset de l'input fichier
 */
export function resetApp(DOM, resetFileInput) {
  // Utiliser resetAppState du stateManager
  resetAppState()

  // Reset filter UI
  document.querySelectorAll('.stat-filter').forEach(btn => {
    btn.classList.remove('active')
  })

  // Reset minimap
  if (DOM.minimapBlocks) {
    DOM.minimapBlocks.innerHTML = ''
  }

  resetFileInput()
  showSectionUI('upload', DOM)
}
