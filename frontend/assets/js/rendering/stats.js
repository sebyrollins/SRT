/**
 * Stats - Rendu et mise à jour des statistiques
 */

/**
 * Met à jour les statistiques et la jauge de progression
 * @param {Object} stats - Statistiques calculées (total, fault, doubt)
 * @param {Object} AppState - État de l'application
 * @param {Object} DOM - Références DOM
 */
export function updateStats(stats, AppState, DOM) {
  // Afficher le nombre total de blocs dans le fichier SRT
  const totalBlocks = AppState.blocks.length

  // Calculer le nombre de blocs avec corrections (pour les filtres)
  let blocksWithCorrections = 0
  AppState.blocks.forEach(block => {
    if (block.corrections && block.corrections.length > 0) {
      blocksWithCorrections++
    }
  })

  if (DOM.statBlocks) DOM.statBlocks.textContent = totalBlocks
  if (DOM.statTotal) DOM.statTotal.textContent = stats.total
  if (DOM.statFault) DOM.statFault.textContent = stats.fault
  if (DOM.statDoubt) DOM.statDoubt.textContent = stats.doubt

  // Activer/désactiver les boutons de filtre selon les compteurs
  document.querySelectorAll('.stat-filter').forEach(filterBtn => {
    const filterType = filterBtn.dataset.filter
    let count = 0

    switch(filterType) {
      case 'all':
        count = blocksWithCorrections
        break
      case 'fault':
        count = stats.fault
        break
      case 'doubt':
        count = stats.doubt
        break
    }

    if (count === 0) {
      filterBtn.classList.add('disabled')
      filterBtn.style.pointerEvents = 'none'
      filterBtn.style.opacity = '0.5'
    } else {
      filterBtn.classList.remove('disabled')
      filterBtn.style.pointerEvents = 'auto'
      filterBtn.style.opacity = '1'
    }
  })

  // Calculer la progression (combien de corrections validées)
  const totalCorrections = stats.total
  const validatedCount = AppState.validatedCorrections.size
  const progressPercent = totalCorrections > 0 ? Math.round((validatedCount / totalCorrections) * 100) : 100

  // Calculer combien de corrections validées sont en mode "doubt"
  let validatedDoubtCount = 0
  let validatedNonDoubtCount = 0

  AppState.blocks.forEach(block => {
    if (!block.corrections) return
    block.corrections.forEach((correction, corrIndex) => {
      const correctionId = `${block.index}-${corrIndex}`
      if (AppState.validatedCorrections.has(correctionId)) {
        if (correction.type === 'doubt') {
          validatedDoubtCount++
        } else {
          validatedNonDoubtCount++
        }
      }
    })
  })

  // Mettre à jour la jauge avec gradient
  if (DOM.progressGaugeFill) {
    DOM.progressGaugeFill.style.width = `${progressPercent}%`

    // Appliquer le gradient uniquement si on a des corrections validées
    if (validatedCount > 0) {
      const nonDoubtProportion = (validatedNonDoubtCount / validatedCount) * 100
      const doubtProportion = (validatedDoubtCount / validatedCount) * 100

      if (validatedDoubtCount > 0 && validatedNonDoubtCount > 0) {
        // Les deux types sont présents - utiliser un gradient
        DOM.progressGaugeFill.style.background = `linear-gradient(to right, #10b981 0%, #10b981 ${nonDoubtProportion}%, #f59e0b ${nonDoubtProportion}%, #f59e0b 100%)`
      } else if (validatedDoubtCount > 0) {
        // Seulement des doutes - orange
        DOM.progressGaugeFill.style.background = '#f59e0b'
      } else {
        // Seulement des non-doutes - vert
        DOM.progressGaugeFill.style.background = '#10b981'
      }
    } else {
      // Aucune correction validée - couleur par défaut
      DOM.progressGaugeFill.style.background = '#10b981'
    }
  }
  if (DOM.progressGaugeValue) {
    DOM.progressGaugeValue.textContent = `${progressPercent}%`
  }

  // Mettre à jour l'état des boutons de validation
  updateValidationButtonsState(stats, AppState, DOM)
}

/**
 * Met à jour l'état des boutons de validation (désactive si toutes corrections validées)
 * @param {Object} stats - Statistiques calculées
 * @param {Object} AppState - État de l'application
 * @param {Object} DOM - Références DOM
 */
export function updateValidationButtonsState(stats, AppState, DOM) {
  // Compter combien de corrections de chaque type sont validées
  let validatedFaultCount = 0
  let validatedDoubtCount = 0

  AppState.blocks.forEach(block => {
    if (!block.corrections) return
    block.corrections.forEach((correction, corrIndex) => {
      const correctionId = `${block.index}-${corrIndex}`
      if (AppState.validatedCorrections.has(correctionId)) {
        if (correction.type === 'fault') validatedFaultCount++
        else if (correction.type === 'doubt') validatedDoubtCount++
      }
    })
  })

  // Désactiver/activer les boutons en fonction
  const allFaultValidated = stats.fault > 0 && validatedFaultCount === stats.fault
  const allDoubtValidated = stats.doubt > 0 && validatedDoubtCount === stats.doubt
  const allValidated = stats.total > 0 && AppState.validatedCorrections.size === stats.total

  if (DOM.validateFaultBtn) {
    DOM.validateFaultBtn.disabled = allFaultValidated || stats.fault === 0
    DOM.validateFaultBtn.classList.toggle('btn-disabled', allFaultValidated || stats.fault === 0)
  }

  if (DOM.validateDoubtBtn) {
    DOM.validateDoubtBtn.disabled = allDoubtValidated || stats.doubt === 0
    DOM.validateDoubtBtn.classList.toggle('btn-disabled', allDoubtValidated || stats.doubt === 0)
  }

  if (DOM.validateAllBtn) {
    DOM.validateAllBtn.disabled = allValidated
    DOM.validateAllBtn.classList.toggle('btn-disabled', allValidated)
  }
}
