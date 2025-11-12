/**
 * Gestion de la taille du texte via le slider
 */

const TEXT_SIZE_STORAGE_KEY = 'srt-text-size-scale'

/**
 * Initialise le contrôle de taille de texte
 * @param {Object} DOM - Références DOM
 */
export function initTextSizeControl(DOM) {
  const slider = document.getElementById('textSizeSlider')

  if (!slider) {
    console.warn('[TextSize] Slider not found')
    return
  }

  // Restaurer la valeur sauvegardée ou utiliser la valeur par défaut
  const savedScale = sessionStorage.getItem(TEXT_SIZE_STORAGE_KEY)
  if (savedScale) {
    const scale = parseFloat(savedScale)
    slider.value = scale
    applyTextScale(scale)
  }

  // Écouter les changements du slider
  slider.addEventListener('input', (e) => {
    const scale = parseFloat(e.target.value)
    applyTextScale(scale)
  })

  // Sauvegarder quand l'utilisateur termine l'ajustement
  slider.addEventListener('change', (e) => {
    const scale = parseFloat(e.target.value)
    sessionStorage.setItem(TEXT_SIZE_STORAGE_KEY, scale.toString())
  })

  console.log('[TextSize] Text size control initialized')
}

/**
 * Applique l'échelle de texte en modifiant la variable CSS
 * @param {number} scale - Échelle à appliquer (0.7 à 1.5)
 */
function applyTextScale(scale) {
  // Appliquer la variable CSS globalement
  document.documentElement.style.setProperty('--text-scale', scale.toString())

  console.log(`[TextSize] Text scale set to ${scale}`)
}

/**
 * Réinitialise la taille du texte à la valeur par défaut
 */
export function resetTextSize() {
  const slider = document.getElementById('textSizeSlider')

  if (slider) {
    slider.value = '1.0'
    applyTextScale(1.0)
    sessionStorage.removeItem(TEXT_SIZE_STORAGE_KEY)
  }
}
