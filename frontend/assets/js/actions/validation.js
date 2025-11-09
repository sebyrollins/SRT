/**
 * Module de validation des corrections
 * Gère la validation individuelle et en masse des corrections
 */

/**
 * Trouve le prochain bloc avec des corrections non validées
 * @param {number} currentBlockIndex - Index du bloc actuel
 * @param {Array} blocks - Liste des blocs
 * @param {Set} validatedCorrections - Set des corrections validées
 * @returns {number|null} - Index du prochain bloc ou null
 */
function findNextUnvalidatedBlock(currentBlockIndex, blocks, validatedCorrections) {
  // Commencer à partir du bloc suivant
  const currentIdx = blocks.findIndex(b => b.index === currentBlockIndex)

  // Chercher dans les blocs suivants
  for (let i = currentIdx + 1; i < blocks.length; i++) {
    const block = blocks[i]
    if (!block.corrections || block.corrections.length === 0) continue

    // Vérifier s'il y a au moins une correction non validée
    const hasUnvalidated = block.corrections.some((c, idx) => {
      const correctionId = `${block.index}-${idx}`
      return !validatedCorrections.has(correctionId)
    })

    if (hasUnvalidated) {
      return block.index
    }
  }

  return null // Aucun bloc non validé trouvé
}

/**
 * Valide toutes les corrections d'un bloc en une seule fois
 * @param {number} blockIndex - Index du bloc
 * @param {Object} AppState - État de l'application
 * @param {Object} SRTParser - Parser SRT
 * @param {Function} updateStats - Fonction de mise à jour des stats
 * @param {Function} renderBlocksTable - Fonction de rendu du tableau
 * @param {Function} updateMinimap - Fonction de mise à jour de la minimap
 * @param {Function} scrollToBlock - Fonction de scroll vers un bloc
 */
export function validateAllBlockCorrections(blockIndex, AppState, SRTParser, updateStats, renderBlocksTable, updateMinimap, scrollToBlock) {
  const block = AppState.blocks.find(b => b.index === blockIndex)
  if (!block || !block.corrections || block.corrections.length === 0) {
    return
  }

  // Valider toutes les corrections du bloc
  block.corrections.forEach((correction, corrIndex) => {
    const correctionId = `${blockIndex}-${corrIndex}`
    if (!AppState.validatedCorrections.has(correctionId)) {
      AppState.validatedCorrections.add(correctionId)

      // Appliquer la correction au texte du bloc
      if (block.corrected.includes(correction.original)) {
        block.corrected = block.corrected.replace(correction.original, correction.corrected)
      }
    }
  })

  // Mettre à jour les stats et la jauge
  const stats = SRTParser.calculateStats(AppState.blocks)
  updateStats(stats)

  // Re-render pour mettre à jour l'affichage
  renderBlocksTable()
  updateMinimap()

  // Auto-scroll vers le prochain bloc non validé
  setTimeout(() => {
    const nextBlockIndex = findNextUnvalidatedBlock(blockIndex, AppState.blocks, AppState.validatedCorrections)
    if (nextBlockIndex !== null) {
      scrollToBlock(nextBlockIndex)
    }
  }, 300)
}

/**
 * Valide une correction unique
 * @param {number} blockIndex - Index du bloc
 * @param {number} corrIndex - Index de la correction
 * @param {Object} AppState - État de l'application
 * @param {Object} SRTParser - Parser SRT
 * @param {Function} updateStats - Fonction de mise à jour des stats
 * @param {Function} renderBlocksTable - Fonction de rendu du tableau
 * @param {Function} updateMinimap - Fonction de mise à jour de la minimap
 * @param {Function} scrollToBlock - Fonction de scroll vers un bloc
 */
export function validateSingleCorrection(blockIndex, corrIndex, AppState, SRTParser, updateStats, renderBlocksTable, updateMinimap, scrollToBlock) {
  const correctionId = `${blockIndex}-${corrIndex}`
  AppState.validatedCorrections.add(correctionId)

  // Trouver le bloc et la correction
  const block = AppState.blocks.find(b => b.index === blockIndex)
  if (block && block.corrections && block.corrections[corrIndex]) {
    const correction = block.corrections[corrIndex]

    // Appliquer la correction au texte du bloc
    // Remplacer le texte original par le texte corrigé
    if (block.corrected.includes(correction.original)) {
      block.corrected = block.corrected.replace(correction.original, correction.corrected)
    }
  }

  // Mettre à jour les stats et la jauge
  const stats = SRTParser.calculateStats(AppState.blocks)
  updateStats(stats)

  // Re-render pour mettre à jour le fond du bloc si toutes corrections validées
  renderBlocksTable()
  updateMinimap()

  // Auto-scroll vers le prochain bloc non validé
  setTimeout(() => {
    // D'abord vérifier si le bloc actuel a encore des corrections non validées
    const currentBlock = AppState.blocks.find(b => b.index === blockIndex)
    if (currentBlock && currentBlock.corrections) {
      const hasUnvalidatedInCurrentBlock = currentBlock.corrections.some((c, idx) => {
        const corrId = `${blockIndex}-${idx}`
        return !AppState.validatedCorrections.has(corrId)
      })

      // Si le bloc actuel a encore des corrections, ne pas scroller
      if (hasUnvalidatedInCurrentBlock) {
        return
      }
    }

    // Sinon, chercher le prochain bloc avec des corrections non validées
    const nextBlockIndex = findNextUnvalidatedBlock(blockIndex, AppState.blocks, AppState.validatedCorrections)
    if (nextBlockIndex !== null) {
      scrollToBlock(nextBlockIndex)
    }
  }, 300)
}

/**
 * Valide des corrections par type
 * @param {string} type - Type de corrections à valider ('all', 'fault', 'doubt')
 * @param {Object} AppState - État de l'application
 * @param {Object} SRTParser - Parser SRT
 * @param {Function} updateStats - Fonction de mise à jour des stats
 * @param {Function} renderBlocksTable - Fonction de rendu du tableau
 * @param {Function} updateMinimap - Fonction de mise à jour de la minimap
 */
export function validateCorrections(type, AppState, SRTParser, updateStats, renderBlocksTable, updateMinimap) {
  AppState.blocks.forEach(block => {
    if (!block.corrections) return

    block.corrections.forEach((correction, corrIndex) => {
      if (type === 'all' ||
          (type === 'fault' && correction.type === 'fault') ||
          (type === 'doubt' && correction.type === 'doubt')) {

        const correctionId = `${block.index}-${corrIndex}`
        AppState.validatedCorrections.add(correctionId)
      }
    })
  })

  // Mettre à jour les stats et la jauge
  const stats = SRTParser.calculateStats(AppState.blocks)
  updateStats(stats)

  // Re-render pour mettre à jour l'affichage
  renderBlocksTable()
  updateMinimap()
}
