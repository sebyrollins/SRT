/**
 * stateManager - Fonctions de mutation de l'état
 *
 * Toutes les modifications de AppState doivent passer par ces fonctions
 * pour garantir la cohérence et faciliter le débogage
 */

import AppState from './AppState.js'

/**
 * Initialise ou met à jour le nom du fichier
 */
export function setOriginalFilename(filename) {
  AppState.originalFilename = filename
}

/**
 * Définit les blocs SRT
 */
export function setBlocks(blocks) {
  AppState.blocks = blocks
}

/**
 * Définit le filtre actif
 */
export function setActiveFilter(filter) {
  AppState.activeFilter = filter
}

/**
 * Toggle le filtre : désactive si déjà actif, active sinon
 */
export function toggleFilter(filterType) {
  if (AppState.activeFilter === filterType) {
    AppState.activeFilter = null
  } else {
    AppState.activeFilter = filterType === 'all' ? null : filterType
  }
}

/**
 * Validation - Ajoute une correction aux corrections validées
 */
export function validateCorrection(blockIndex, corrIndex) {
  const correctionId = `${blockIndex}-${corrIndex}`
  AppState.validatedCorrections.add(correctionId)
}

/**
 * Validation - Retire une correction des corrections validées
 */
export function unvalidateCorrection(blockIndex, corrIndex) {
  const correctionId = `${blockIndex}-${corrIndex}`
  AppState.validatedCorrections.delete(correctionId)
}

/**
 * Validation - Valide toutes les corrections d'un bloc
 */
export function validateAllBlockCorrections(blockIndex) {
  const block = AppState.blocks.find(b => b.index === blockIndex)
  if (!block || !block.corrections) return

  block.corrections.forEach((_, corrIndex) => {
    validateCorrection(blockIndex, corrIndex)
  })
}

/**
 * Validation - Valide toutes les corrections de tous les blocs
 */
export function validateAllCorrections() {
  AppState.blocks.forEach(block => {
    if (block.corrections) {
      block.corrections.forEach((_, corrIndex) => {
        validateCorrection(block.index, corrIndex)
      })
    }
  })
}

/**
 * Validation - Valide toutes les corrections d'un type donné
 * @param {string} type - 'all', 'fault', 'doubt'
 */
export function validateCorrectionsByType(type) {
  AppState.blocks.forEach(block => {
    if (!block.corrections) return

    block.corrections.forEach((correction, corrIndex) => {
      if (type === 'all' ||
          (type === 'fault' && correction.type === 'fault') ||
          (type === 'doubt' && correction.type === 'doubt')) {
        validateCorrection(block.index, corrIndex)
      }
    })
  })
}

/**
 * Genre - Bascule une correction de genre en forme alternative
 */
export function switchGender(blockIndex, corrIndex) {
  const correctionId = `${blockIndex}-${corrIndex}`
  AppState.genderSwitched.add(correctionId)
}

/**
 * Genre - Revient à la forme originale pour une correction de genre
 */
export function unswitchGender(blockIndex, corrIndex) {
  const correctionId = `${blockIndex}-${corrIndex}`
  AppState.genderSwitched.delete(correctionId)
}

/**
 * Genre - Toggle la forme de genre
 */
export function toggleGenderSwitch(blockIndex, corrIndex) {
  const correctionId = `${blockIndex}-${corrIndex}`
  if (AppState.genderSwitched.has(correctionId)) {
    AppState.genderSwitched.delete(correctionId)
    return false // Revenu à l'original
  } else {
    AppState.genderSwitched.add(correctionId)
    return true // Basculé en alternatif
  }
}

/**
 * Reset - Réinitialise un bloc spécifique
 */
export function resetBlock(blockIndex) {
  const block = AppState.blocks.find(b => b.index === blockIndex)
  if (!block || !block.corrections) return

  // Supprimer toutes les validations et états de genre pour ce bloc
  block.corrections.forEach((_, corrIndex) => {
    unvalidateCorrection(blockIndex, corrIndex)
    unswitchGender(blockIndex, corrIndex)
  })
}

/**
 * Reset - Réinitialise toutes les validations et états de genre
 * Restaure tous les blocs à leur état initial
 */
export function resetAllValidations() {
  // Restaurer tous les blocs à leur état original
  AppState.blocks.forEach(block => {
    // CAS 1 : Bloc sans corrections - restaurer quand même le texte original
    if (!block.corrections || block.corrections.length === 0) {
      // Restaurer le texte corrigé original (NE PAS supprimer originalCorrected)
      if (block.hasOwnProperty('originalCorrected')) {
        block.corrected = block.originalCorrected
      }
      return
    }

    // CAS SPÉCIAL : Bloc créé sans corrections (wasNoCorrection)
    // Supprimer toutes les corrections créées
    if (block.corrections.length === 1 && block.corrections[0].wasNoCorrection) {
      block.corrections = []

      // Restaurer le texte corrigé original (NE PAS supprimer originalCorrected)
      if (block.hasOwnProperty('originalCorrected')) {
        block.corrected = block.originalCorrected
      }
      return
    }

    // CAS SPÉCIAL : Bloc avec corrections originales remplacées
    // Restaurer les corrections originales
    if (block.hasOwnProperty('originalCorrections')) {
      block.corrections = block.originalCorrections.map(c => ({...c}))
      delete block.originalCorrections
    }

    // Restaurer chaque correction à son état original
    block.corrections.forEach((correction, corrIndex) => {
      const correctionId = `${block.index}-${corrIndex}`

      // Restaurer la suggestion originale si elle a été modifiée
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

    // Restaurer le texte corrigé original si disponible
    // NE PAS supprimer originalCorrected, c'est une référence permanente pour les réinitialisations futures
    if (block.hasOwnProperty('originalCorrected')) {
      block.corrected = block.originalCorrected
    }
  })

  // Vider les validations et états de genre
  AppState.validatedCorrections.clear()
  AppState.genderSwitched.clear()
}

/**
 * Reset - Réinitialise complètement l'application
 */
export function resetApp() {
  AppState.originalFilename = null
  AppState.blocks = []
  AppState.validatedCorrections.clear()
  AppState.genderSwitched.clear()
  AppState.activeFilter = null
}

/**
 * Modifications de blocs - Met à jour le texte corrigé d'un bloc
 */
export function updateBlockCorrectedText(blockIndex, newText) {
  const block = AppState.blocks.find(b => b.index === blockIndex)
  if (block) {
    block.corrected = newText
  }
}

/**
 * Modifications de corrections - Met à jour une correction spécifique
 */
export function updateCorrection(blockIndex, corrIndex, updates) {
  const block = AppState.blocks.find(b => b.index === blockIndex)
  if (block && block.corrections && block.corrections[corrIndex]) {
    Object.assign(block.corrections[corrIndex], updates)
  }
}

/**
 * Modifications de corrections - Supprime une correction
 */
export function removeCorrection(blockIndex, corrIndex) {
  const block = AppState.blocks.find(b => b.index === blockIndex)
  if (block && block.corrections) {
    block.corrections.splice(corrIndex, 1)
    // Nettoyer aussi les validations
    unvalidateCorrection(blockIndex, corrIndex)
    unswitchGender(blockIndex, corrIndex)
  }
}

/**
 * Modifications de corrections - Ajoute une nouvelle correction
 */
export function addCorrection(blockIndex, correction) {
  const block = AppState.blocks.find(b => b.index === blockIndex)
  if (block) {
    if (!block.corrections) {
      block.corrections = []
    }
    block.corrections.push(correction)
  }
}

/**
 * Modifications de corrections - Supprime toutes les corrections d'un bloc
 */
export function clearBlockCorrections(blockIndex) {
  const block = AppState.blocks.find(b => b.index === blockIndex)
  if (block) {
    // Nettoyer les validations d'abord
    if (block.corrections) {
      block.corrections.forEach((_, corrIndex) => {
        unvalidateCorrection(blockIndex, corrIndex)
        unswitchGender(blockIndex, corrIndex)
      })
    }
    block.corrections = []
    // Restaurer le texte original (résultat de toutes les passes)
    block.corrected = block.originalCorrected || block.originalAfterPass0 || block.original
  }
}
