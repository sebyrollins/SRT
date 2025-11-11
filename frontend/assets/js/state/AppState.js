/**
 * AppState - Gestion centralisée de l'état de l'application
 *
 * Cet objet contient tout l'état global de l'application SRT Corrector Pro.
 * Les mutations doivent être effectuées via les fonctions de stateManager.js
 */

const AppState = {
  // Nom du fichier original uploadé
  originalFilename: null,

  // Array de blocs SRT avec leurs corrections
  // Structure d'un bloc : { index, original, corrected, corrections: [...] }
  blocks: [],

  // Set de IDs de corrections validées (format: "blockIndex-corrIndex")
  validatedCorrections: new Set(),

  // Set de IDs de corrections de genre basculées en forme alternative
  genderSwitched: new Set(),

  // Filtre actif : null = tous, 'minor', 'major', 'doubt', 'none'
  activeFilter: null
}

/**
 * Getters pour accéder à l'état de manière sécurisée
 */
export const getState = () => AppState

export const getBlocks = () => AppState.blocks

export const getBlock = (blockIndex) =>
  AppState.blocks.find(b => b.index === blockIndex)

export const getCorrection = (blockIndex, corrIndex) => {
  const block = getBlock(blockIndex)
  return block?.corrections?.[corrIndex]
}

export const getOriginalFilename = () => AppState.originalFilename

export const getActiveFilter = () => AppState.activeFilter

/**
 * Helpers pour vérifier l'état
 */
export const isValidated = (blockIndex, corrIndex) => {
  const correctionId = `${blockIndex}-${corrIndex}`
  return AppState.validatedCorrections.has(correctionId)
}

export const isGenderSwitched = (blockIndex, corrIndex) => {
  const correctionId = `${blockIndex}-${corrIndex}`
  return AppState.genderSwitched.has(correctionId)
}

export const isBlockFullyValidated = (blockIndex) => {
  const block = getBlock(blockIndex)
  if (!block || !block.corrections || block.corrections.length === 0) {
    return true
  }
  return block.corrections.every((_, idx) => isValidated(blockIndex, idx))
}

export const getValidatedCorrectionsCount = () => {
  return AppState.validatedCorrections.size
}

export const getTotalCorrectionsCount = () => {
  return AppState.blocks.reduce((total, block) => {
    return total + (block.corrections?.length || 0)
  }, 0)
}

export default AppState
