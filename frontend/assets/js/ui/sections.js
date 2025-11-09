/**
 * Sections - Gestion de l'affichage des sections de l'application
 *
 * Gère le basculement entre les sections : upload, loading, editor
 */

/**
 * Affiche une section spécifique et cache les autres
 * @param {string} section - 'upload', 'loading', ou 'editor'
 * @param {Object} DOM - Objet contenant les références DOM
 */
export function showSection(section, DOM) {
  if (!DOM) {
    console.error('[showSection] DOM object is required')
    return
  }

  if (DOM.uploadSection) {
    DOM.uploadSection.style.display = section === 'upload' ? 'block' : 'none'
  }
  if (DOM.loadingSection) {
    DOM.loadingSection.style.display = section === 'loading' ? 'block' : 'none'
  }
  if (DOM.editorSection) {
    DOM.editorSection.style.display = section === 'editor' ? 'block' : 'none'
  }
}

/**
 * Affiche la section d'upload
 * @param {Object} DOM - Objet contenant les références DOM
 */
export function showUploadSection(DOM) {
  showSection('upload', DOM)
}

/**
 * Affiche la section de chargement
 * @param {Object} DOM - Objet contenant les références DOM
 */
export function showLoadingSection(DOM) {
  showSection('loading', DOM)
}

/**
 * Affiche la section d'édition
 * @param {Object} DOM - Objet contenant les références DOM
 */
export function showEditorSection(DOM) {
  showSection('editor', DOM)
}
