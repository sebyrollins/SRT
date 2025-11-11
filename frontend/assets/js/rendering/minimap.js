/**
 * Minimap - Rendu et gestion de la minimap de navigation
 */

// Variables pour le throttling
let scrollTimeout = null
let resizeTimeout = null

/**
 * Génère la minimap de navigation
 * @param {Object} DOM - Références DOM
 */
export function renderMinimap(DOM) {
  if (!DOM.minimapBlocks) return

  // Attendre que le DOM soit prêt
  setTimeout(() => {
    rebuildMinimap(DOM)
  }, 100)
}

/**
 * Reconstruit complètement la minimap
 * @param {Object} DOM - Références DOM
 * @param {Object} AppState - État de l'application (global)
 */
export function rebuildMinimap(DOM, AppState) {
  if (!DOM || !DOM.minimapBlocks) {
    console.warn('[Minimap] DOM or minimapBlocks not available')
    return
  }

  // Utiliser AppState global si non fourni
  const state = AppState || window.AppState

  if (!state || !state.blocks || state.blocks.length === 0) {
    console.warn('[Minimap] No blocks to display')
    return
  }

  // Vider la minimap
  DOM.minimapBlocks.innerHTML = ''

  // Utiliser requestAnimationFrame pour s'assurer que le DOM est à jour
  // après le resize et que les media queries CSS sont appliquées
  requestAnimationFrame(() => {
    // Double requestAnimationFrame pour garantir que le reflow est complet
    requestAnimationFrame(() => {
      // Récupérer les dimensions (la hauteur peut changer avec le responsive)
      const minimapHeight = DOM.minimapBlocks.offsetHeight
      const windowWidth = window.innerWidth
      const windowHeight = window.innerHeight

      if (minimapHeight === 0) {
        console.warn('[Minimap] Container height is 0, skipping rebuild')
        return
      }

      console.log(`[Minimap] Rebuild - Container: ${minimapHeight}px, Window: ${windowWidth}x${windowHeight}px`)
      console.log(`[Minimap] Total blocks: ${state.blocks.length}`)

      // Appeler la fonction interne qui fait le vrai travail
      buildMinimapBlocks(DOM, state, minimapHeight, windowWidth)
    })
  })
}

/**
 * Construit les blocs de la minimap (fonction interne)
 * @param {Object} DOM - Références DOM
 * @param {Object} state - État de l'application
 * @param {number} minimapHeight - Hauteur du conteneur
 * @param {number} windowWidth - Largeur de la fenêtre
 */
function buildMinimapBlocks(DOM, state, minimapHeight, windowWidth) {

  // Première passe : collecter les données des blocs
  const blocksData = []

  state.blocks.forEach((block) => {
    const blockRow = document.getElementById(`block-row-${block.index}`)
    if (!blockRow) {
      console.warn(`[Minimap] Block row not found for block #${block.index}`)
      return
    }

    const blockClass = getBlockMinimapClass(block, state)
    const isHidden = blockClass === 'minimap-hidden'

    blocksData.push({
      block,
      blockClass,
      isHidden
    })
  })

  // Compter les blocs visibles
  const visibleBlocksCount = blocksData.filter(d => !d.isHidden).length

  if (visibleBlocksCount === 0) return

  // Déterminer le gap entre les blocs (responsive selon la largeur de fenêtre)
  let gap = 3
  let minBlockHeight = 3

  // Ajuster selon la taille d'écran pour le responsive
  if (windowWidth <= 359) {
    // Très petit écran
    gap = 0.5
    minBlockHeight = 1
  } else if (windowWidth <= 480) {
    // Mobile portrait
    gap = 1
    minBlockHeight = 1
  } else if (windowWidth <= 767) {
    // Mobile paysage
    gap = 1
    minBlockHeight = 2
  } else if (windowWidth <= 1024) {
    // Tablette
    gap = 2
    minBlockHeight = 2
  } else {
    // Desktop
    if (visibleBlocksCount > 100) {
      gap = 1
    } else if (visibleBlocksCount > 50) {
      gap = 2
    } else {
      gap = 3
    }
    minBlockHeight = 3
  }

  // Calculer l'espace total pour les gaps
  const totalGapsHeight = Math.max(0, (visibleBlocksCount - 1) * gap)

  // Calculer la hauteur disponible pour les blocs
  const availableHeightForBlocks = minimapHeight - totalGapsHeight

  // Hauteur uniforme pour chaque bloc (avec minimum responsive)
  const uniformBlockHeight = Math.max(minBlockHeight, availableHeightForBlocks / visibleBlocksCount)

  console.log(`[Minimap] ${visibleBlocksCount} visible blocks, gap: ${gap}px, uniform height: ${uniformBlockHeight.toFixed(1)}px (min: ${minBlockHeight}px)`)

  // Deuxième passe : créer les blocs avec taille uniforme
  blocksData.forEach(({ block, blockClass, isHidden }) => {
    const minimapBlock = document.createElement('div')
    minimapBlock.className = 'minimap-block'
    minimapBlock.dataset.blockIndex = block.index
    minimapBlock.dataset.blockLabel = `Bloc #${block.index}`
    minimapBlock.classList.add(blockClass)

    if (!isHidden) {
      minimapBlock.style.height = `${uniformBlockHeight}px`
    } else {
      minimapBlock.style.height = '0px'
    }

    minimapBlock.style.flexShrink = '0'
    minimapBlock.style.marginBottom = `${gap}px`

    // Clic pour naviguer
    minimapBlock.addEventListener('click', () => {
      scrollToBlock(block.index)
    })

    DOM.minimapBlocks.appendChild(minimapBlock)
  })

  console.log(`[Minimap] Created ${DOM.minimapBlocks.children.length} minimap blocks`)
}

/**
 * Détermine la classe CSS de la minimap pour un bloc
 * @param {Object} block - Le bloc à analyser
 * @param {Object} AppState - État de l'application
 * @returns {string} Classe CSS
 */
export function getBlockMinimapClass(block, AppState) {
  // Utiliser AppState global si non fourni
  const state = AppState || window.AppState

  // Vérifier si toutes les corrections sont validées
  const allValidated = block.corrections && block.corrections.length > 0 &&
    block.corrections.every((c, idx) => state.validatedCorrections.has(`${block.index}-${idx}`))

  // Pas de correction
  if (!block.corrections || block.corrections.length === 0) {
    return 'minimap-no-correction'
  }

  // Si toutes validées, vérifier le type pour la couleur
  if (allValidated) {
    const hasFault = block.corrections.some(c => c.type === 'fault')
    const hasDoubt = block.corrections.some(c => c.type === 'doubt')

    if (hasFault) {
      return 'minimap-validated'
    } else if (hasDoubt) {
      return 'minimap-validated-doubt'
    } else {
      return 'minimap-validated'
    }
  }

  // Non validées : déterminer le type dominant
  const hasUnvalidatedFault = block.corrections.some((c, idx) =>
    c.type === 'fault' && !state.validatedCorrections.has(`${block.index}-${idx}`)
  )

  if (hasUnvalidatedFault) {
    return 'minimap-fault'
  }

  // Vérifier si le bloc contient au moins un doute
  const hasDoubt = block.corrections.some(c => c.type === 'doubt')
  if (hasDoubt) {
    return 'minimap-doubt'
  }

  return 'minimap-validated'
}

/**
 * Met à jour la minimap (appelé après validation)
 * @param {Object} DOM - Références DOM
 * @param {Object} AppState - État de l'application
 */
export function updateMinimap(DOM, AppState) {
  if (!DOM.minimapBlocks) return

  // Utiliser AppState global si non fourni
  const state = AppState || window.AppState

  state.blocks.forEach(block => {
    const minimapBlock = DOM.minimapBlocks.querySelector(`[data-block-index="${block.index}"]`)
    if (!minimapBlock) return

    // Retirer toutes les classes d'état
    minimapBlock.classList.remove('minimap-validated', 'minimap-validated-doubt', 'minimap-no-correction', 'minimap-fault', 'minimap-doubt')

    // Ajouter la nouvelle classe
    const blockClass = getBlockMinimapClass(block, state)
    minimapBlock.classList.add(blockClass)
  })
}

/**
 * Scroll vers un bloc spécifique
 * @param {number} blockIndex - Index du bloc
 */
export function scrollToBlock(blockIndex) {
  const blockRow = document.getElementById(`block-row-${blockIndex}`)
  if (blockRow) {
    blockRow.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    })

    // Effet visuel temporaire
    blockRow.style.transition = 'background-color 0.3s ease'
    const originalBg = blockRow.style.backgroundColor
    blockRow.style.backgroundColor = 'rgba(79, 70, 229, 0.1)'

    setTimeout(() => {
      blockRow.style.backgroundColor = originalBg
    }, 1000)

    // Mettre à jour la position actuelle dans la minimap après le scroll
    setTimeout(() => {
      updateMinimapCurrentPosition()
    }, 500)
  }
}

/**
 * Met à jour l'indicateur de position actuelle dans la minimap
 * @param {Object} DOM - Références DOM (optionnel)
 * @param {Object} AppState - État de l'application (optionnel)
 */
export function updateMinimapCurrentPosition(DOM, AppState) {
  // Utiliser les objets globaux si non fournis
  const domRef = DOM || window.DOM
  const state = AppState || window.AppState

  if (!domRef.minimapBlocks) return

  // Retirer l'ancienne classe current
  const oldCurrent = domRef.minimapBlocks.querySelector('.minimap-current')
  if (oldCurrent) {
    oldCurrent.classList.remove('minimap-current')
  }

  // Trouver le bloc visible au centre de l'écran
  const viewportCenter = window.scrollY + (window.innerHeight / 2)

  let closestBlock = null
  let closestDistance = Infinity

  state.blocks.forEach(block => {
    const blockRow = document.getElementById(`block-row-${block.index}`)
    if (blockRow) {
      const rect = blockRow.getBoundingClientRect()
      const blockCenter = window.scrollY + rect.top + (rect.height / 2)
      const distance = Math.abs(blockCenter - viewportCenter)

      if (distance < closestDistance) {
        closestDistance = distance
        closestBlock = block
      }
    }
  })

  // Ajouter la classe current au bloc le plus proche
  if (closestBlock) {
    const minimapBlock = domRef.minimapBlocks.querySelector(`[data-block-index="${closestBlock.index}"]`)
    if (minimapBlock) {
      minimapBlock.classList.add('minimap-current')
    }
  }
}

/**
 * Throttle pour éviter trop d'appels lors du scroll
 */
export function onScrollThrottled() {
  if (scrollTimeout) return

  scrollTimeout = setTimeout(() => {
    updateMinimapCurrentPosition()
    scrollTimeout = null
  }, 100)
}

/**
 * Throttle pour éviter trop d'appels lors du resize
 * @param {Object} DOM - Références DOM (optionnel)
 */
export function onResizeThrottled(DOM) {
  if (resizeTimeout) {
    clearTimeout(resizeTimeout)
  }

  resizeTimeout = setTimeout(() => {
    console.log('[Minimap] Window resized, rebuilding minimap...')

    // Utiliser window.DOM si DOM n'est pas fourni
    const domRef = DOM || window.DOM

    if (!domRef || !domRef.minimapBlocks) {
      console.warn('[Minimap] Cannot rebuild - DOM not available')
      resizeTimeout = null
      return
    }

    // Reconstruire complètement la minimap avec les nouvelles dimensions
    rebuildMinimap(domRef)
    resizeTimeout = null
  }, 100) // 100ms pour resize rapide et réactif
}
