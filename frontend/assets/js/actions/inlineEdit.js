/**
 * Gestion de l'édition inline du texte corrigé
 */

/**
 * Active l'édition inline sur un élément de texte corrigé
 * @param {HTMLElement} contentElement - L'élément div.block-content à éditer
 * @param {number} blockIndex - Index du bloc
 * @param {Function} onSave - Callback appelé lors de la sauvegarde (blockIndex, newText)
 */
export function enableInlineEdit(contentElement, blockIndex, onSave) {
  // Vérifier si déjà en mode édition
  if (contentElement.contentEditable === 'true') {
    return
  }

  // Sauvegarder le texte original pour pouvoir annuler
  const originalText = contentElement.textContent

  // Activer l'édition
  contentElement.contentEditable = 'true'
  contentElement.classList.add('editing-inline')

  // Focus et sélectionner tout le texte
  contentElement.focus()

  // Sélectionner tout le contenu
  const range = document.createRange()
  range.selectNodeContents(contentElement)
  const selection = window.getSelection()
  selection.removeAllRanges()
  selection.addRange(range)

  // Fonction pour sauvegarder
  const save = () => {
    const newText = contentElement.textContent.trim()

    // Désactiver l'édition
    contentElement.contentEditable = 'false'
    contentElement.classList.remove('editing-inline')

    // Si le texte a changé, sauvegarder
    if (newText !== originalText && newText.length > 0) {
      onSave(blockIndex, newText)
      showToast('✓ Texte modifié', 'success')
    }

    // Retirer les listeners
    cleanup()
  }

  // Fonction pour annuler
  const cancel = () => {
    // Restaurer le texte original
    contentElement.textContent = originalText

    // Désactiver l'édition
    contentElement.contentEditable = 'false'
    contentElement.classList.remove('editing-inline')

    showToast('✕ Modification annulée', 'info')

    // Retirer les listeners
    cleanup()
  }

  // Gestionnaire de touche
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      save()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
    }
  }

  // Gestionnaire de blur (clic ailleurs)
  const handleBlur = (e) => {
    // Petit délai pour permettre au clic d'être traité
    setTimeout(() => {
      if (contentElement.contentEditable === 'true') {
        save()
      }
    }, 100)
  }

  // Ajouter les listeners
  contentElement.addEventListener('keydown', handleKeyDown)
  contentElement.addEventListener('blur', handleBlur)

  // Fonction de nettoyage
  const cleanup = () => {
    contentElement.removeEventListener('keydown', handleKeyDown)
    contentElement.removeEventListener('blur', handleBlur)
  }

  console.log(`[InlineEdit] Editing mode activated for block #${blockIndex}`)
}

/**
 * Affiche un toast de notification
 * @param {string} message - Message à afficher
 * @param {string} type - Type : 'success', 'error', 'info'
 */
function showToast(message, type = 'info') {
  // Vérifier si un toast existe déjà
  const existingToast = document.querySelector('.inline-edit-toast')
  if (existingToast) {
    existingToast.remove()
  }

  const toast = document.createElement('div')
  toast.className = `inline-edit-toast inline-edit-toast-${type}`
  toast.textContent = message

  document.body.appendChild(toast)

  // Animer l'apparition
  setTimeout(() => {
    toast.classList.add('show')
  }, 10)

  // Retirer après 2 secondes
  setTimeout(() => {
    toast.classList.remove('show')
    setTimeout(() => {
      toast.remove()
    }, 300)
  }, 2000)
}
