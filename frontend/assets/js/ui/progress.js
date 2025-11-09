/**
 * Progress - Gestion de la barre de progression
 *
 * Fonctions pour mettre à jour la barre de progression pendant le chargement
 */

/**
 * Met à jour la barre de progression
 * @param {number} percent - Pourcentage de progression (0-100)
 * @param {string} text - Texte descriptif à afficher
 * @param {Object} DOM - Objet contenant les références DOM
 */
export function updateProgress(percent, text, DOM) {
  if (!DOM) {
    console.error('[updateProgress] DOM object is required')
    return
  }

  if (DOM.progressFill) {
    DOM.progressFill.style.width = `${percent}%`
  }

  if (DOM.progressText) {
    DOM.progressText.textContent = text
  }
}

/**
 * Réinitialise la barre de progression
 * @param {Object} DOM - Objet contenant les références DOM
 */
export function resetProgress(DOM) {
  updateProgress(0, 'Initialisation...', DOM)
}

/**
 * Met la barre de progression à 100%
 * @param {string} text - Texte à afficher (par défaut "Terminé !")
 * @param {Object} DOM - Objet contenant les références DOM
 */
export function completeProgress(text = 'Terminé !', DOM) {
  updateProgress(100, text, DOM)
}
