/**
 * Module d'export et de téléchargement
 * Gère le téléchargement des fichiers SRT et TXT
 */

/**
 * Vérifie si toutes les corrections ont été validées
 * @param {Object} AppState - État de l'application
 * @returns {boolean} True si toutes les corrections sont validées
 */
function areAllCorrectionsValidated(AppState) {
  for (const block of AppState.blocks) {
    if (block.corrections && block.corrections.length > 0) {
      for (let corrIndex = 0; corrIndex < block.corrections.length; corrIndex++) {
        const correctionId = `${block.index}-${corrIndex}`
        if (!AppState.validatedCorrections.has(correctionId)) {
          return false
        }
      }
    }
  }
  return true
}

/**
 * Affiche une alerte design centrée à l'écran
 * @param {string} message - Message à afficher
 */
function showAlert(message) {
  // Créer l'overlay
  const overlay = document.createElement('div')
  overlay.className = 'custom-alert-overlay'

  // Créer la boîte d'alerte
  const alertBox = document.createElement('div')
  alertBox.className = 'custom-alert-box'

  // Icône d'avertissement
  const icon = document.createElement('div')
  icon.className = 'custom-alert-icon'
  icon.textContent = '⚠️'

  // Message
  const messageEl = document.createElement('div')
  messageEl.className = 'custom-alert-message'
  messageEl.textContent = message

  // Bouton OK
  const button = document.createElement('button')
  button.className = 'custom-alert-button'
  button.textContent = 'OK'
  button.onclick = () => {
    document.body.removeChild(overlay)
  }

  // Assembler
  alertBox.appendChild(icon)
  alertBox.appendChild(messageEl)
  alertBox.appendChild(button)
  overlay.appendChild(alertBox)

  // Ajouter au body
  document.body.appendChild(overlay)

  // Focus sur le bouton
  button.focus()

  // Fermer avec Escape
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      document.body.removeChild(overlay)
      document.removeEventListener('keydown', handleEscape)
    }
  }
  document.addEventListener('keydown', handleEscape)
}

/**
 * Extrait la forme alternative du genre d'une correction de type "doubt"
 * @param {Object} correction - Objet correction complet
 * @returns {string} - Forme alternative
 */
function extractAlternativeGender(correction) {
  // Nouveau format : champ "alternative" fourni directement par le worker
  if (correction.alternative) {
    return correction.alternative
  }

  // Ancien format : extraire "(ou XXX)" des parenthèses
  const corrected = correction.corrected
  const match = corrected.match(/\(ou\s+([^)]+)\)/)
  if (!match) {
    return corrected
  }

  const alternative = match[1].trim()
  const withoutParens = corrected.substring(0, match.index).trim()

  // Compter les mots dans l'alternative
  const alternativeWords = alternative.split(/\s+/)
  const alternativeWordCount = alternativeWords.length

  // Extraire les mots du texte avant parenthèses
  const words = withoutParens.split(/\s+/)

  // Remplacer les N derniers mots par l'alternative
  const beforeWords = words.slice(0, -alternativeWordCount)

  return [...beforeWords, ...alternativeWords].join(' ')
}

/**
 * Construit le texte d'un bloc en n'appliquant que les corrections validées
 * @param {Object} block - Le bloc à traiter
 * @param {Object} AppState - État de l'application
 * @returns {string} Texte avec seulement les corrections validées
 */
function buildTextWithValidatedCorrections(block, AppState) {
  // Si pas de corrections, retourner le texte corrigé (qui contient déjà Pass 0)
  if (!block.corrections || block.corrections.length === 0) {
    return block.corrected
  }

  // IMPORTANT: Toujours utiliser block.corrected comme base car il contient Pass 0
  // Les corrections Pass 0 sont toujours appliquées (automatiques)
  let result = block.corrected

  // Créer une liste des corrections NON validées qu'il faut défaire
  const nonValidatedCorrections = []
  block.corrections.forEach((correction, corrIndex) => {
    const correctionId = `${block.index}-${corrIndex}`
    if (!AppState.validatedCorrections.has(correctionId)) {
      nonValidatedCorrections.push({ correction, corrIndex })
    }
  })

  // Si aucune correction à défaire, retourner le texte tel quel
  if (nonValidatedCorrections.length === 0) {
    return result
  }

  // Trier par position décroissante pour éviter les problèmes de décalage
  nonValidatedCorrections.sort((a, b) => b.correction.position - a.correction.position)

  // Défaire les corrections non validées
  nonValidatedCorrections.forEach(({ correction, corrIndex }) => {
    const correctionId = `${block.index}-${corrIndex}`

    // Pour les corrections "doubt" de GENRE (vrais doutes, pas rejetées)
    if (correction.type === 'doubt' && correction.alternative && !correction.isManuallyEdited && !correction.hasOwnProperty('originalType')) {
      // Le texte dans block.corrected contient déjà l'original
      // Si genre switché, on applique l'alternative
      if (AppState.genderSwitched.has(correctionId)) {
        const alternativeForm = extractAlternativeGender(correction)
        const pos = result.indexOf(correction.original)
        if (pos !== -1) {
          result = result.substring(0, pos) + alternativeForm + result.substring(pos + correction.original.length)
        }
      }
      return
    }

    // Pour les corrections rejetées/modifiées non validées, appliquer la suggestion originale de Claude
    if (correction.hasOwnProperty('originalSuggestion')) {
      const pos = result.indexOf(correction.corrected)
      if (pos !== -1) {
        result = result.substring(0, pos) + correction.originalSuggestion + result.substring(pos + correction.corrected.length)
      }
      return
    }

    // Pour les autres corrections non validées, revenir à l'original
    const pos = result.indexOf(correction.corrected)
    if (pos !== -1) {
      result = result.substring(0, pos) + correction.original + result.substring(pos + correction.corrected.length)
    }
  })

  return result
}

/**
 * Télécharge le fichier SRT avec uniquement les corrections validées
 * @param {Object} AppState - État de l'application
 * @param {Object} SRTParser - Parser SRT
 */
export function downloadSRT(AppState, SRTParser) {
  // Vérifier que toutes les corrections sont validées
  if (!areAllCorrectionsValidated(AppState)) {
    showAlert('⚠️ Veuillez d\'abord valider toutes les corrections avant de télécharger.')
    return
  }

  // Créer une copie des blocs avec seulement les corrections validées appliquées
  const blocksWithValidatedCorrections = AppState.blocks.map(block => {
    return {
      ...block,
      corrected: buildTextWithValidatedCorrections(block, AppState)
    }
  })

  const content = SRTParser.generate(blocksWithValidatedCorrections)
  const filename = SRTParser.generateFilename(AppState.originalFilename, '_SR')
  SRTParser.downloadFile(content, filename, 'text/plain')
}

/**
 * Télécharge le fichier TXT avec uniquement les corrections validées
 * @param {Object} AppState - État de l'application
 * @param {Object} SRTParser - Parser SRT
 */
export function downloadTXT(AppState, SRTParser) {
  // Vérifier que toutes les corrections sont validées
  if (!areAllCorrectionsValidated(AppState)) {
    showAlert('⚠️ Veuillez d\'abord valider toutes les corrections avant de télécharger.')
    return
  }

  // Créer une copie des blocs avec seulement les corrections validées appliquées
  const blocksWithValidatedCorrections = AppState.blocks.map(block => {
    return {
      ...block,
      corrected: buildTextWithValidatedCorrections(block, AppState)
    }
  })

  const content = SRTParser.generateTXT(blocksWithValidatedCorrections)
  const filename = SRTParser.generateFilename(AppState.originalFilename, '_SR', 'txt')
  SRTParser.downloadFile(content, filename, 'text/plain')
}
