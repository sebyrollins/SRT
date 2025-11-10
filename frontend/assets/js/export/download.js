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
 * Affiche une alerte design pour informer l'utilisateur
 * @param {string} message - Message à afficher
 */
function showAlert(message) {
  alert(message)
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
  // Si pas de corrections, retourner l'original
  if (!block.corrections || block.corrections.length === 0) {
    return block.original
  }

  // Filtrer pour ne garder que les corrections validées
  const validatedCorrections = block.corrections.filter((correction, corrIndex) => {
    const correctionId = `${block.index}-${corrIndex}`
    return AppState.validatedCorrections.has(correctionId)
  })

  // Si aucune correction validée, retourner l'original
  if (validatedCorrections.length === 0) {
    return block.original
  }

  // Trier les corrections par position
  const sortedCorrections = [...validatedCorrections].sort((a, b) => a.position - b.position)

  // Appliquer les corrections au texte original
  let result = block.original
  let offset = 0

  sortedCorrections.forEach((correction) => {
    // Trouver l'index original de cette correction dans block.corrections
    const originalCorrIndex = block.corrections.indexOf(correction)
    const correctionId = `${block.index}-${originalCorrIndex}`

    // Pour les corrections "doubt" de GENRE (avec alternative, pas modifiées manuellement)
    if (correction.type === 'doubt' && correction.alternative && !correction.isManuallyEdited) {
      // Si le genre a été changé, appliquer la forme alternative
      if (AppState.genderSwitched.has(correctionId)) {
        const alternativeForm = extractAlternativeGender(correction)
        const startPos = correction.position + offset
        const endPos = startPos + correction.original.length

        if (result.substring(startPos, endPos) === correction.original) {
          result = result.substring(0, startPos) + alternativeForm + result.substring(endPos)
          offset += alternativeForm.length - correction.original.length
        }
      }
      // Sinon, garder l'original (ne rien faire)
      return
    }

    // Pour les autres types de corrections (fault, et corrections modifiées manuellement)
    const startPos = correction.position + offset
    const endPos = startPos + correction.original.length

    // Vérifier que la correction est bien à la bonne position
    if (result.substring(startPos, endPos) === correction.original) {
      result = result.substring(0, startPos) + correction.corrected + result.substring(endPos)
      offset += correction.corrected.length - correction.original.length
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
