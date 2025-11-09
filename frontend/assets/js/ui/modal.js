/**
 * Modal - Système de modal réutilisable
 *
 * Élimine la duplication de code entre editBlockText et editCorrection
 */

/**
 * Ouvre un modal d'édition avec logique personnalisable
 *
 * @param {Object} config - Configuration du modal
 * @param {string} config.originalText - Texte original (avec erreur)
 * @param {string} config.suggestedText - Texte suggéré par l'IA
 * @param {string} config.currentValue - Valeur actuelle à éditer
 * @param {boolean} config.showSuggestion - Afficher la section suggestion (true pour editCorrection, false pour editBlockText)
 * @param {Function} config.onSave - Callback appelé lors de la sauvegarde avec la nouvelle valeur
 * @param {Function} config.onCancel - Callback appelé lors de l'annulation (optionnel)
 * @param {boolean} config.multiline - Si true, Ctrl+Enter pour sauvegarder, sinon Enter seul
 */
export function openEditModal(config) {
  const {
    originalText,
    suggestedText,
    currentValue,
    showSuggestion = true,
    onSave,
    onCancel = null,
    multiline = false
  } = config

  // Récupérer les éléments du DOM
  const modal = document.getElementById('editModal')
  const modalOriginal = document.getElementById('modalOriginal')
  const modalSuggestion = document.getElementById('modalSuggestion')
  const modalSuggestionField = document.getElementById('modalSuggestionField')
  const modalInput = document.getElementById('modalInput')
  const modalSaveBtn = document.getElementById('modalSaveBtn')
  const modalCancelBtn = document.getElementById('modalCancelBtn')
  const modalCloseBtn = document.getElementById('modalCloseBtn')
  const modalOverlay = document.getElementById('modalOverlay')
  const modalRestoreBtn = document.getElementById('modalRestoreBtn')
  const modalRestoreOriginalBtn = document.getElementById('modalRestoreOriginalBtn')

  // Afficher/cacher la section suggestion
  if (modalSuggestionField) {
    modalSuggestionField.style.display = showSuggestion ? 'block' : 'none'
  }

  // Remplir le modal avec textContent pour préserver les apostrophes et caractères spéciaux
  modalOriginal.textContent = originalText
  modalSuggestion.textContent = suggestedText
  modalInput.value = currentValue

  // Afficher le modal et focus
  modal.style.display = 'flex'
  modalInput.focus()

  // Positionner le curseur selon le mode
  if (multiline) {
    // Pour textarea, curseur à la fin
    modalInput.setSelectionRange(modalInput.value.length, modalInput.value.length)
  } else {
    // Pour input simple, sélectionner tout
    modalInput.setSelectionRange(0, modalInput.value.length)
  }

  // Fonction pour restaurer l'original (avec erreur)
  const restoreOriginal = () => {
    modalInput.value = originalText
    modalInput.focus()
    if (multiline) {
      modalInput.setSelectionRange(modalInput.value.length, modalInput.value.length)
    } else {
      modalInput.setSelectionRange(0, modalInput.value.length)
    }
  }

  // Fonction pour restaurer la suggestion
  const restoreSuggestion = () => {
    modalInput.value = suggestedText
    modalInput.focus()
    if (multiline) {
      modalInput.setSelectionRange(modalInput.value.length, modalInput.value.length)
    } else {
      modalInput.setSelectionRange(0, modalInput.value.length)
    }
  }

  // Fonction pour fermer le modal
  const closeModal = () => {
    modal.style.display = 'none'

    // Nettoyer tous les event listeners
    modalSaveBtn.onclick = null
    modalCancelBtn.onclick = null
    modalCloseBtn.onclick = null
    modalOverlay.onclick = null
    modalRestoreBtn.onclick = null
    modalRestoreOriginalBtn.onclick = null
    modalInput.onkeydown = null
  }

  // Fonction pour sauvegarder
  const saveEdit = () => {
    const newValue = modalInput.value.trim()
    onSave(newValue)
    closeModal()
  }

  // Fonction pour annuler
  const cancelEdit = () => {
    if (onCancel) {
      onCancel()
    }
    closeModal()
  }

  // Attacher les événements
  modalSaveBtn.onclick = saveEdit
  modalCancelBtn.onclick = cancelEdit
  modalCloseBtn.onclick = cancelEdit
  modalOverlay.onclick = cancelEdit
  modalRestoreOriginalBtn.onclick = restoreOriginal
  modalRestoreBtn.onclick = restoreSuggestion

  // Gestion du clavier
  modalInput.onkeydown = (e) => {
    if (multiline) {
      // Mode multiline : Ctrl+Enter pour sauvegarder
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        saveEdit()
      } else if (e.key === 'Escape') {
        cancelEdit()
      }
    } else {
      // Mode single line : Enter pour sauvegarder
      if (e.key === 'Enter') {
        e.preventDefault()
        saveEdit()
      } else if (e.key === 'Escape') {
        cancelEdit()
      }
    }
  }
}

/**
 * Ferme le modal (utile pour appels externes)
 */
export function closeEditModal() {
  const modal = document.getElementById('editModal')
  if (modal) {
    modal.style.display = 'none'
  }
}
