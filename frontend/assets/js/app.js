/**
 * SRT Corrector Pro - Main Application Logic
 */

// État global de l'application
const AppState = {
  originalFilename: null,
  blocks: [],
  validatedCorrections: new Set(),
  activeFilter: null // null = tous, 'minor', 'major', 'doubt', 'none' (sans correction)
}

// Éléments DOM
const DOM = {
  uploadSection: null,
  loadingSection: null,
  editorSection: null,
  uploadForm: null,
  fileInput: null,
  fileInfo: null,
  fileName: null,
  fileSize: null,
  progressFill: null,
  progressText: null,
  correctedTextPanel: null,
  validationsPanel: null,
  statsBar: null,
  statBlocks: null,
  statTotal: null,
  statMinor: null,
  statMajor: null,
  statDoubt: null,
  progressGaugeFill: null,
  progressGaugeValue: null,
  validateAllBtn: null,
  validateMinorBtn: null,
  validateMajorBtn: null,
  validateDoubtBtn: null,
  resetStateBtn: null,
  downloadSrtBtn: null,
  downloadTxtBtn: null,
  newFileBtn: null,
  blocksTableBody: null,
  navigationMinimap: null,
  minimapBlocks: null
}

/**
 * Initialisation de l'application
 */
document.addEventListener('DOMContentLoaded', () => {
  initDOM()
  initEventListeners()

  // Si un fichier a été uploadé via PHP, le traiter
  if (window.UPLOADED_FILE) {
    processUploadedFile(window.UPLOADED_FILE.content, window.UPLOADED_FILE.filename)
  }
})

/**
 * Initialise les références DOM
 */
function initDOM() {
  DOM.uploadSection = document.getElementById('uploadSection')
  DOM.loadingSection = document.getElementById('loadingSection')
  DOM.editorSection = document.getElementById('editorSection')
  DOM.uploadForm = document.getElementById('uploadForm')
  DOM.fileInput = document.getElementById('srtFile')
  DOM.fileInfo = document.getElementById('fileInfo')
  DOM.fileName = document.getElementById('fileName')
  DOM.fileSize = document.getElementById('fileSize')
  DOM.progressFill = document.getElementById('progressFill')
  DOM.progressText = document.getElementById('progressText')
  DOM.correctedTextPanel = document.getElementById('correctedTextPanel')
  DOM.validationsPanel = document.getElementById('validationsPanel')
  DOM.statsBar = document.getElementById('statsBar')
  DOM.statBlocks = document.getElementById('statBlocks')
  DOM.statTotal = document.getElementById('statTotal')
  DOM.statMinor = document.getElementById('statMinor')
  DOM.statMajor = document.getElementById('statMajor')
  DOM.statDoubt = document.getElementById('statDoubt')
  DOM.progressGaugeFill = document.getElementById('progressGaugeFill')
  DOM.progressGaugeValue = document.getElementById('progressGaugeValue')
  DOM.validateAllBtn = document.getElementById('validateAllBtn')
  DOM.validateMinorBtn = document.getElementById('validateMinorBtn')
  DOM.validateMajorBtn = document.getElementById('validateMajorBtn')
  DOM.validateDoubtBtn = document.getElementById('validateDoubtBtn')
  DOM.resetStateBtn = document.getElementById('resetStateBtn')
  DOM.downloadSrtBtn = document.getElementById('downloadSrtBtn')
  DOM.downloadTxtBtn = document.getElementById('downloadTxtBtn')
  DOM.newFileBtn = document.getElementById('newFileBtn')
  DOM.blocksTableBody = document.getElementById('blocksTableBody')
  DOM.navigationMinimap = document.getElementById('navigationMinimap')
  DOM.minimapBlocks = document.getElementById('minimapBlocks')
}

/**
 * Initialise les écouteurs d'événements
 */
function initEventListeners() {
  // Upload de fichier
  if (DOM.fileInput) {
    DOM.fileInput.addEventListener('change', handleFileSelection)
  }

  if (DOM.uploadForm) {
    DOM.uploadForm.addEventListener('submit', handleFormSubmit)
  }

  // Boutons d'action
  if (DOM.validateAllBtn) {
    DOM.validateAllBtn.addEventListener('click', () => validateCorrections('all'))
  }

  if (DOM.validateMinorBtn) {
    DOM.validateMinorBtn.addEventListener('click', () => validateCorrections('minor'))
  }

  if (DOM.validateMajorBtn) {
    DOM.validateMajorBtn.addEventListener('click', () => validateCorrections('major'))
  }

  if (DOM.validateDoubtBtn) {
    DOM.validateDoubtBtn.addEventListener('click', () => validateCorrections('doubt'))
  }

  if (DOM.resetStateBtn) {
    DOM.resetStateBtn.addEventListener('click', resetToInitialState)
  }

  if (DOM.downloadSrtBtn) {
    DOM.downloadSrtBtn.addEventListener('click', downloadSRT)
  }

  if (DOM.downloadTxtBtn) {
    DOM.downloadTxtBtn.addEventListener('click', downloadTXT)
  }

  if (DOM.newFileBtn) {
    DOM.newFileBtn.addEventListener('click', resetApp)
  }

  // Filtres de statistiques
  document.querySelectorAll('.stat-filter').forEach(filterBtn => {
    filterBtn.addEventListener('click', handleFilterClick)
  })
}

/**
 * Gestion de la sélection de fichier
 */
function handleFileSelection(event) {
  const file = event.target.files[0]

  if (file) {
    DOM.fileName.textContent = file.name
    DOM.fileSize.textContent = SRTParser.formatFileSize(file.size)
    DOM.fileInfo.style.display = 'flex'

    // Valider la taille
    if (file.size > window.APP_CONFIG.maxFileSize) {
      alert(`Le fichier est trop volumineux (max ${SRTParser.formatFileSize(window.APP_CONFIG.maxFileSize)})`)
      resetFileInput()
    }
  }
}

/**
 * Gestion de la soumission du formulaire
 */
function handleFormSubmit(event) {
  event.preventDefault()

  const file = DOM.fileInput.files[0]
  if (!file) {
    alert('Veuillez sélectionner un fichier')
    return
  }

  // Lire le fichier
  const reader = new FileReader()

  reader.onload = (e) => {
    const content = e.target.result
    processUploadedFile(content, file.name)
  }

  reader.onerror = () => {
    alert('Erreur lors de la lecture du fichier')
  }

  reader.readAsText(file)
}

/**
 * Traite un fichier uploadé
 */
async function processUploadedFile(content, filename) {
  // Valider le contenu
  const validation = SRTParser.validate(content)

  if (!validation.valid) {
    alert(`Fichier invalide : ${validation.error}`)
    return
  }

  AppState.originalFilename = filename

  // Afficher la section de chargement
  showSection('loading')

  // Estimer le temps de traitement en fonction de la taille du fichier (formule continue)
  const fileSizeKB = new Blob([content]).size / 1024

  // Formule linéaire: temps de base + (taille × coefficient)
  // Exemples: 0 Ko → 30s, 50 Ko → 44s, 200 Ko → 86s, 250 Ko → 100s (max)
  const baseTimeMs = 30000  // 30 secondes minimum
  const msPerKB = 280       // 280 ms par Ko
  const maxTimeMs = 100000  // 100 secondes maximum

  const estimatedTimeMs = Math.min(maxTimeMs, baseTimeMs + (fileSizeKB * msPerKB))

  // Progression fictive fluide jusqu'à 80%
  let currentProgress = 0
  const targetProgress = 80
  const updateInterval = 100  // Mise à jour toutes les 100ms
  const progressIncrement = (targetProgress / estimatedTimeMs) * updateInterval

  updateProgress(0, 'Veuillez patienter pendant l\'analyse...')

  const progressInterval = setInterval(() => {
    currentProgress += progressIncrement
    if (currentProgress >= targetProgress) {
      currentProgress = targetProgress
      clearInterval(progressInterval)
    }
    updateProgress(Math.round(currentProgress), 'Veuillez patienter pendant l\'analyse...')
  }, updateInterval)

  try {
    // Envoyer au Worker Cloudflare
    const correctedBlocks = await sendToWorker(content, filename)

    // Arrêter la progression fictive
    clearInterval(progressInterval)

    // Transformer les apostrophes droites en apostrophes typographiques courbées
    convertStraightApostrophesToCurly(correctedBlocks)

    // Nettoyer les corrections fantômes (où original === corrected)
    cleanPhantomCorrections(correctedBlocks)

    // Sauvegarder les blocs
    AppState.blocks = correctedBlocks

    // Sauvegarder la suggestion originale de Claude pour chaque bloc (avant toute modification)
    AppState.blocks.forEach(block => {
      if (!block.hasOwnProperty('originalCorrected')) {
        block.originalCorrected = block.corrected
      }
      // Sauvegarder si le bloc avait des corrections à l'origine (avant toute modification manuelle)
      if (!block.hasOwnProperty('hadOriginalCorrections')) {
        block.hadOriginalCorrections = block.corrections && block.corrections.length > 0
      }
    })

    // Progression ralentie et fluide de 80% à 100% (moitié de la vitesse)
    const finalProgressDuration = 4000  // 4 secondes pour 80-100% (2x plus lent que avant)
    const finalProgressSteps = 20  // 20 étapes pour une progression fluide
    const finalProgressIncrement = 20 / finalProgressSteps  // 20% divisé en petites étapes
    const finalProgressInterval = finalProgressDuration / finalProgressSteps

    let finalProgress = 80
    const messages = [
      { threshold: 80, text: 'Traitement des résultats...' },
      { threshold: 90, text: 'Finalisation...' },
      { threshold: 98, text: 'Terminé !' }
    ]

    for (let i = 0; i < finalProgressSteps; i++) {
      finalProgress += finalProgressIncrement
      const roundedProgress = Math.min(Math.round(finalProgress), 100)

      // Trouver le message approprié
      let message = messages[0].text
      for (const msg of messages) {
        if (roundedProgress >= msg.threshold) {
          message = msg.text
        }
      }

      updateProgress(roundedProgress, message)
      await new Promise(resolve => setTimeout(resolve, finalProgressInterval))
    }

    // S'assurer qu'on affiche bien 100%
    updateProgress(100, 'Terminé !')

    setTimeout(() => {
      showEditor()
    }, 300)

  } catch (error) {
    console.error('Erreur lors du traitement:', error)
    clearInterval(progressInterval)
    alert(`Erreur : ${error.message}`)
    showSection('upload')
  }
}

/**
 * Convertit les apostrophes droites (') en apostrophes typographiques courbées (')
 * dans block.corrected et correction.corrected
 */
/**
 * Convertit un texte en remplaçant apostrophes droites (') par courbes (')
 * SAUF les apostrophes doubles ('') qui sont préservées
 */
function convertApostrophes(text) {
  if (!text) return text
  // Protéger les doubles apostrophes avec un placeholder temporaire
  const placeholder = '\uFFFF' // Caractère Unicode privé jamais utilisé
  return text
    .replace(/''/g, placeholder)  // Protéger ''
    .replace(/'/g, '\u2019')      // Convertir ' simple
    .replace(new RegExp(placeholder, 'g'), "''") // Restaurer ''
}

/**
 * Convertit les apostrophes droites (') en apostrophes courbes (')
 * SAUF les apostrophes doubles ('') qui sont préservées
 */
function convertStraightApostrophesToCurly(blocks) {
  blocks.forEach(block => {
    // Transformer block.original et block.corrected
    block.original = convertApostrophes(block.original)
    block.corrected = convertApostrophes(block.corrected)

    // Transformer correction.original et correction.corrected pour toutes les corrections
    if (block.corrections && block.corrections.length > 0) {
      block.corrections.forEach(correction => {
        correction.original = convertApostrophes(correction.original)
        correction.corrected = convertApostrophes(correction.corrected)
      })
    }
  })
  console.log('[Typography] Apostrophes droites converties en apostrophes courbes (sauf apostrophes doubles)')
}

/**
 * Nettoie les corrections "fantômes" où original === corrected
 * ET force les corrections typographiques que l'IA n'a pas appliquées
 */
function cleanPhantomCorrections(blocks) {
  blocks.forEach(block => {
    if (block.corrections && block.corrections.length > 0) {
      const originalCount = block.corrections.length
      const removed = []

      block.corrections = block.corrections.filter(correction => {
        // Normaliser les chaînes pour comparer (NFC = composé)
        const normalizedOriginal = correction.original.normalize('NFC').trim()
        const normalizedCorrected = correction.corrected.normalize('NFC').trim()

        // Si c'est une correction typographique (minor) et que les textes sont identiques,
        // forcer la correction réelle
        if (correction.type === 'minor' && normalizedOriginal === normalizedCorrected) {
          // Appliquer les corrections typographiques que l'IA n'a pas faites
          let fixed = correction.corrected

          // Apostrophe droite → courbe (U+2019)
          fixed = fixed.replace(/'/g, '\u2019')

          // Guillemets droits → français
          fixed = fixed.replace(/"([^"]+)"/g, '\u00AB $1 \u00BB')

          // Trois points → ellipsis (U+2026)
          fixed = fixed.replace(/\.\.\./g, '\u2026')

          // Si après correction le texte est toujours identique, c'est un vrai fantôme
          if (fixed === normalizedOriginal) {
            removed.push({
              original: correction.original,
              corrected: correction.corrected,
              type: correction.type,
              reason: correction.reason + ' (phantom - vraiment identique)'
            })
            return false // Supprimer
          }

          // Sinon, appliquer la correction forcée
          correction.corrected = fixed
          console.log(`Bloc #${block.index}: Correction typographique forcée: "${correction.original}" → "${fixed}"`)
          return true // Garder
        }

        // Pour les autres types (major, doubt), vérifier si vraiment identiques
        const isPhantom = normalizedOriginal === normalizedCorrected

        if (isPhantom) {
          removed.push({
            original: correction.original,
            corrected: correction.corrected,
            type: correction.type,
            reason: correction.reason,
            originalLength: correction.original.length,
            correctedLength: correction.corrected.length,
            originalCodes: Array.from(correction.original).map(c => c.charCodeAt(0)),
            correctedCodes: Array.from(correction.corrected).map(c => c.charCodeAt(0))
          })
        }
        return !isPhantom
      })

      // Log si des corrections fantômes ont été supprimées
      if (removed.length > 0) {
        console.log(`Bloc #${block.index}: ${removed.length} correction(s) fantôme(s) supprimée(s):`, removed)
      }
    }
  })
}

/**
 * Envoie le contenu au Cloudflare Worker
 */
async function sendToWorker(content, filename) {
  // Vérifier que le Worker est configuré
  if (window.APP_CONFIG.workerUrl.includes('YOUR-SUBDOMAIN')) {
    throw new Error(`⚠️ Le Worker Cloudflare n'est pas encore configuré.\n\nÉtapes :\n1. Déployez le Worker sur Cloudflare\n2. Modifiez l'URL dans frontend/lib/config.php\n\nConsultez le README.md pour les instructions.`)
  }

  const response = await fetch(window.APP_CONFIG.workerUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      srtContent: content,
      fileName: filename
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Erreur serveur: ${response.status}\n\nDétails: ${errorText}\n\nVérifiez que :\n1. Le Worker Cloudflare est déployé\n2. La clé ANTHROPIC_API_KEY est configurée\n3. L'URL du Worker est correcte dans config.php`)
  }

  const result = await response.json()

  if (!result.success) {
    throw new Error(result.error || 'Erreur inconnue')
  }

  return result.data
}

/**
 * Affiche l'éditeur avec les résultats
 */
function showEditor() {
  showSection('editor')

  // Afficher la minimap
  if (DOM.navigationMinimap) {
    DOM.navigationMinimap.style.display = 'flex'
  }

  // Calculer les statistiques
  const stats = SRTParser.calculateStats(AppState.blocks)
  updateStats(stats)

  // Afficher le tableau des blocs
  renderBlocksTable()

  // Générer la minimap
  renderMinimap()

  // Mettre à jour la position actuelle dans la minimap
  updateMinimapCurrentPosition()

  // Écouter le scroll pour mettre à jour la position actuelle
  window.removeEventListener('scroll', onScrollThrottled) // Éviter les doublons
  window.addEventListener('scroll', onScrollThrottled)

  // Écouter le resize pour recalculer la minimap
  window.removeEventListener('resize', onResizeThrottled) // Éviter les doublons
  window.addEventListener('resize', onResizeThrottled)
}

/**
 * Affiche le tableau des blocs (texte + validations)
 */
function renderBlocksTable() {
  DOM.blocksTableBody.innerHTML = ''

  // Filtrer les blocs selon le filtre actif
  let blocksToDisplay = AppState.blocks

  if (AppState.activeFilter) {
    blocksToDisplay = AppState.blocks.filter(block => {
      if (!block.corrections || block.corrections.length === 0) {
        return false // Pas de corrections
      }

      // Vérifier si le bloc contient le type de correction recherché
      return block.corrections.some(c => c.type === AppState.activeFilter)
    })
  }

  blocksToDisplay.forEach(block => {
    // Vérifier si toutes les corrections sont validées
    const allValidated = block.corrections && block.corrections.length > 0 &&
      block.corrections.every((c, idx) => AppState.validatedCorrections.has(`${block.index}-${idx}`))

    // Déterminer le type de correction dominant pour la classe CSS
    // Les blocs où TOUTES les corrections sont validées n'ont PAS de fond coloré
    // Priorité basée sur les corrections NON validées : majeur > doute > mineur
    let rowClass = 'row-no-correction'
    if (block.corrections && block.corrections.length > 0 && !allValidated) {
      // Vérifier quelles corrections ne sont PAS validées
      const hasUnvalidatedMajor = block.corrections.some((c, idx) =>
        c.type === 'major' && !AppState.validatedCorrections.has(`${block.index}-${idx}`)
      )
      const hasUnvalidatedDoubt = block.corrections.some((c, idx) =>
        c.type === 'doubt' && !AppState.validatedCorrections.has(`${block.index}-${idx}`)
      )
      const hasUnvalidatedMinor = block.corrections.some((c, idx) =>
        c.type === 'minor' && !AppState.validatedCorrections.has(`${block.index}-${idx}`)
      )

      // Appliquer la couleur selon la priorité des corrections non validées
      if (hasUnvalidatedMajor) {
        rowClass = 'row-has-major'
      } else if (hasUnvalidatedDoubt) {
        rowClass = 'row-has-doubt'
      } else if (hasUnvalidatedMinor) {
        rowClass = 'row-has-minor'
      }
    }

    // === LIGNE DE HEADER (2 cellules pour les 2 colonnes) ===
    const headerRow = document.createElement('tr')
    headerRow.className = 'block-header-row'

    // Cellule gauche : numéro + timecode
    const headerCellLeft = document.createElement('td')
    headerCellLeft.className = 'block-header block-header-left'
    headerCellLeft.innerHTML = `
      <span class="block-index">Bloc #${block.index}</span>
      <span class="block-timecode">${block.timecode}</span>
    `

    // Cellule droite : boutons d'action
    const headerCellRight = document.createElement('td')
    headerCellRight.className = 'block-header block-header-right'

    const hasNoCorrections = !block.corrections || block.corrections.length === 0
    const shouldShowEditButton = (allValidated && block.corrections && block.corrections.length > 0) || hasNoCorrections
    const hasCorrections = block.corrections && block.corrections.length > 0

    // Vérifier si le bloc a au moins une correction validée
    const hasValidatedCorrections = hasCorrections && block.corrections.some((correction, idx) =>
      AppState.validatedCorrections.has(`${block.index}-${idx}`)
    )

    // Compter les corrections non validées
    const unvalidatedCorrectionsCount = hasCorrections
      ? block.corrections.filter((c, idx) => !AppState.validatedCorrections.has(`${block.index}-${idx}`)).length
      : 0

    // Container pour les boutons
    const buttonsHtml = []

    // Bouton "Valider tout" : afficher si 2+ corrections non validées
    if (unvalidatedCorrectionsCount >= 2) {
      buttonsHtml.push(`<button class="btn-header-validate-all" data-block-index="${block.index}" title="Valider toutes les corrections de ce bloc"><span>✓</span><span>tout</span></button>`)
    }

    if (shouldShowEditButton) {
      buttonsHtml.push(`<button class="btn-header-edit" data-block-index="${block.index}" title="Modifier le texte complet">✏️</button>`)
    }

    // Bouton réinitialiser : afficher dès qu'une correction a été validée
    if (hasValidatedCorrections) {
      buttonsHtml.push(`<button class="btn-header-reset" data-block-index="${block.index}" title="Réinitialiser ce bloc">⟲</button>`)
    }

    if (buttonsHtml.length > 0) {
      headerCellRight.innerHTML = `<div class="block-header-buttons">${buttonsHtml.join('')}</div>`

      // Ajouter les événements aux boutons après insertion dans le DOM
      setTimeout(() => {
        const validateAllBtn = headerCellRight.querySelector('.btn-header-validate-all')
        if (validateAllBtn) {
          validateAllBtn.onclick = () => validateAllBlockCorrections(block.index)
        }

        const editBtn = headerCellRight.querySelector('.btn-header-edit')
        if (editBtn) {
          editBtn.onclick = () => editBlockText(block.index)
        }

        const resetBtn = headerCellRight.querySelector('.btn-header-reset')
        if (resetBtn) {
          resetBtn.onclick = () => resetBlockToInitialState(block.index)
        }
      }, 0)
    }

    headerRow.appendChild(headerCellLeft)
    headerRow.appendChild(headerCellRight)

    // === LIGNE DE CONTENU ===
    const row = document.createElement('tr')
    row.className = `block-row ${rowClass}`
    row.id = `block-row-${block.index}`

    // === COLONNE GAUCHE : Texte ===
    const textCell = document.createElement('td')
    textCell.className = 'cell-text'

    // Original - Afficher le vrai texte original avec surlignage des erreurs
    const originalEl = document.createElement('div')
    originalEl.className = 'block-section block-original'
    originalEl.innerHTML = `
      <div class="block-label">ORIGINAL :</div>
      <div class="block-content">${
        block.corrections && block.corrections.length > 0
          ? SRTParser.highlightOriginalErrors(block.original, block.corrections)
          : SRTParser.escapeHtml(block.original)
      }</div>
    `

    // Corrigé (gras si validé ou pas de correction, fond vert si non validé avec corrections)
    // hasNoCorrections déjà déclaré ligne 549
    const shouldBeBold = hasNoCorrections || allValidated
    const correctedEl = document.createElement('div')
    correctedEl.className = `block-section block-corrected ${shouldBeBold ? 'block-validated' : 'block-unvalidated'}`

    // Utiliser block.corrected directement du worker (qui a déjà appliqué les corrections)
    // Plus besoin de réappliquer les corrections avec les positions ici
    const finalCorrectedText = block.corrected || block.original

    correctedEl.innerHTML = `
      <div class="block-label">CORRIGÉ :</div>
      <div class="block-content">${SRTParser.escapeHtml(finalCorrectedText)}</div>
    `

    textCell.appendChild(originalEl)
    textCell.appendChild(correctedEl)

    // === COLONNE DROITE : Validations ===
    const validationCell = document.createElement('td')
    validationCell.className = 'cell-validation'

    // Compter les corrections visibles (en tenant compte du filtre des mineures validées)
    let visibleCorrections = 0
    if (block.corrections && block.corrections.length > 0) {
      visibleCorrections = block.corrections.length
    }

    if (visibleCorrections === 0) {
      const emptyMessage = 'Aucune correction'

      const emptyDiv = document.createElement('div')
      emptyDiv.className = 'validation-empty'
      emptyDiv.innerHTML = `
        <span class="validation-empty-icon">✓</span>
        <span class="validation-empty-text">${emptyMessage}</span>
      `

      validationCell.appendChild(emptyDiv)
    } else {
      // Vérifier si toutes les corrections du bloc sont validées
      const allCorrectionsValidated = block.corrections.every((c, idx) =>
        AppState.validatedCorrections.has(`${block.index}-${idx}`)
      )

      // Afficher les corrections visibles
      block.corrections.forEach((correction, corrIndex) => {
          const correctionId = `${block.index}-${corrIndex}`
          const isValidated = AppState.validatedCorrections.has(correctionId)

          const cardEl = document.createElement('div')
          cardEl.className = `validation-card validation-${correction.type}`
          cardEl.id = `validation-${correctionId}`

          if (AppState.validatedCorrections.has(correctionId)) {
            cardEl.classList.add('validated')
          }

          cardEl.innerHTML = `
            <div class="validation-header">
              <span class="validation-type-badge badge-${correction.type}">
                ${correction.type === 'major' ? 'MAJEURE' : correction.type === 'doubt' ? 'DOUTE' : 'MINEURE'}
              </span>
            </div>
            <div class="validation-correction">
              <div class="validation-correction-text">
                <span class="original">${SRTParser.escapeHtml(correction.original)}</span>
                →
                <span class="corrected">${SRTParser.escapeHtml(correction.corrected)}</span>
              </div>
              <div class="validation-correction-reason">${SRTParser.escapeHtml(correction.reason)}</div>
            </div>
          `

          const actionsEl = document.createElement('div')
          actionsEl.className = 'validation-actions'

          if (!isValidated) {
            // Boutons Valider, Modifier et Rejeter : seulement si NON validé
            const validateBtn = document.createElement('button')
            validateBtn.className = 'btn-icon-only btn-icon-validate'
            validateBtn.innerHTML = '✓'
            validateBtn.title = 'Valider'
            validateBtn.onclick = () => validateSingleCorrection(block.index, corrIndex)

            const editBtn = document.createElement('button')
            editBtn.className = 'btn-icon-only btn-icon-edit'
            editBtn.innerHTML = '✏️'
            editBtn.title = 'Modifier'
            editBtn.onclick = () => editCorrection(block.index, corrIndex)

            const rejectBtn = document.createElement('button')
            rejectBtn.className = 'btn-icon-only btn-icon-reject'
            rejectBtn.innerHTML = '✕'
            rejectBtn.title = 'Rejeter'
            rejectBtn.onclick = () => rejectCorrection(block.index, corrIndex)

            actionsEl.appendChild(validateBtn)
            actionsEl.appendChild(editBtn)
            actionsEl.appendChild(rejectBtn)
          }
          // Si validé et toutes les corrections validées : pas de bouton ici (il est dans le header)
          // Si validé mais pas toutes validées : ajouter quand même le bouton Modifier
          else if (!allCorrectionsValidated) {
            const editBtn = document.createElement('button')
            editBtn.className = 'btn-icon-only btn-icon-edit'
            editBtn.innerHTML = '✏️'
            editBtn.title = 'Modifier'
            editBtn.onclick = () => editCorrection(block.index, corrIndex)
            actionsEl.appendChild(editBtn)
          }

          // Ajouter les actions dans le header (sous le badge) seulement si non vide
          if (actionsEl.children.length > 0) {
            const headerEl = cardEl.querySelector('.validation-header')
            headerEl.appendChild(actionsEl)
          }

          validationCell.appendChild(cardEl)
        })
    }

    row.appendChild(textCell)
    row.appendChild(validationCell)
    DOM.blocksTableBody.appendChild(headerRow)
    DOM.blocksTableBody.appendChild(row)
  })
}

/**
 * Valide toutes les corrections d'un bloc en une seule fois
 */
function validateAllBlockCorrections(blockIndex) {
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
    const nextBlockIndex = findNextUnvalidatedBlock(blockIndex)
    if (nextBlockIndex !== null) {
      scrollToBlock(nextBlockIndex)
    }
  }, 300)
}

/**
 * Valide une correction unique
 */
function validateSingleCorrection(blockIndex, corrIndex) {
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
    const nextBlockIndex = findNextUnvalidatedBlock(blockIndex)
    if (nextBlockIndex !== null) {
      scrollToBlock(nextBlockIndex)
    }
  }, 300)
}

/**
 * Trouve le prochain bloc avec des corrections non validées
 */
function findNextUnvalidatedBlock(currentBlockIndex) {
  // Commencer à partir du bloc suivant
  const currentIdx = AppState.blocks.findIndex(b => b.index === currentBlockIndex)

  // Chercher dans les blocs suivants
  for (let i = currentIdx + 1; i < AppState.blocks.length; i++) {
    const block = AppState.blocks[i]
    if (!block.corrections || block.corrections.length === 0) continue

    // Vérifier s'il y a au moins une correction non validée
    const hasUnvalidated = block.corrections.some((c, idx) => {
      const correctionId = `${block.index}-${idx}`
      return !AppState.validatedCorrections.has(correctionId)
    })

    if (hasUnvalidated) {
      return block.index
    }
  }

  return null // Aucun bloc non validé trouvé
}

/**
 * Édite le texte complet d'un bloc sans corrections
 */
function editBlockText(blockIndex) {
  const block = AppState.blocks.find(b => b.index === blockIndex)
  if (!block) return

  // Sauvegarder la suggestion originale de Claude si pas déjà fait
  if (!block.hasOwnProperty('originalCorrected')) {
    block.originalCorrected = block.corrected
  }

  // Afficher le modal
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

  // Cacher la section "Suggestion de correction" pour l'édition de bloc entier
  if (modalSuggestionField) {
    modalSuggestionField.style.display = 'none'
  }

  // Remplir le modal avec textContent pour préserver les apostrophes et caractères spéciaux
  // white-space: pre-wrap dans le CSS gère les sauts de ligne
  modalOriginal.textContent = block.original
  modalSuggestion.textContent = block.corrected
  modalInput.value = block.corrected

  // Debug : afficher les codes des caractères pour vérifier les apostrophes
  console.log('[editBlockText] Original:', block.original)
  console.log('[editBlockText] Original codes:', Array.from(block.original).map(c => `${c}=${c.charCodeAt(0)}`).join(' '))
  console.log('[editBlockText] Corrected:', block.corrected)
  console.log('[editBlockText] Corrected codes:', Array.from(block.corrected).map(c => `${c}=${c.charCodeAt(0)}`).join(' '))

  modal.style.display = 'flex'
  modalInput.focus()
  // Pour textarea, on sélectionne tout à la fin
  modalInput.setSelectionRange(modalInput.value.length, modalInput.value.length)

  // Fonction pour restaurer l'original
  const restoreOriginal = () => {
    modalInput.value = block.original
    modalInput.focus()
    modalInput.setSelectionRange(modalInput.value.length, modalInput.value.length)
  }

  // Fonction pour restaurer la suggestion originale de Claude
  const restoreCorrected = () => {
    // Utiliser originalCorrected si disponible (suggestion initiale de Claude), sinon corrected (valeur actuelle)
    const correctedToRestore = block.hasOwnProperty('originalCorrected') && block.originalCorrected !== undefined
      ? block.originalCorrected
      : block.corrected
    modalInput.value = correctedToRestore
    modalInput.focus()
    modalInput.setSelectionRange(modalInput.value.length, modalInput.value.length)
  }

  // Fonction pour fermer le modal
  const closeModal = () => {
    modal.style.display = 'none'
    // Réafficher le champ de suggestion pour les prochaines ouvertures (editCorrection)
    if (modalSuggestionField) {
      modalSuggestionField.style.display = 'block'
    }
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
    const newValue = convertApostrophes(modalInput.value.trim())
    const oldCorrected = block.corrected

    // Cas 1 : Aucun changement par rapport à la suggestion de Claude actuelle
    if (newValue === oldCorrected) {
      closeModal()
      return
    }

    // Cas 2 : Retour au texte original → Dévalider les corrections (ne pas les supprimer)
    if (newValue === block.original) {
      // Dévalider toutes les corrections de ce bloc (mais les garder)
      if (block.corrections && block.corrections.length > 0) {
        block.corrections.forEach((_, idx) => {
          const correctionId = `${block.index}-${idx}`
          AppState.validatedCorrections.delete(correctionId)
        })
      }

      // Restaurer le texte corrigé original de Claude (pas l'original avec fautes)
      // Cela remet le bloc dans l'état initial : corrections présentes mais non validées
      if (block.hasOwnProperty('originalCorrected') && block.originalCorrected !== undefined) {
        block.corrected = block.originalCorrected
      }

      // Mettre à jour les stats
      const stats = SRTParser.calculateStats(AppState.blocks)
      updateStats(stats)

      // Re-render
      renderBlocksTable()
      updateMinimap()
      closeModal()
      return
    }

    // Cas 2.5 : Retour à la suggestion originale de Claude → Restaurer et valider
    if (block.hasOwnProperty('originalCorrected') && newValue === block.originalCorrected) {
      // C'est la suggestion originale de Claude, restaurer les corrections originales
      // Valider toutes les corrections et restaurer leurs propriétés originales
      if (block.corrections && block.corrections.length > 0) {
        block.corrections.forEach((correction, idx) => {
          const correctionId = `${block.index}-${idx}`

          // Restaurer les types et raisons originaux si modifiés
          if (correction.hasOwnProperty('originalSuggestion')) {
            correction.corrected = correction.originalSuggestion
            delete correction.originalSuggestion
          }
          if (correction.hasOwnProperty('originalType')) {
            correction.type = correction.originalType
            delete correction.originalType
          }
          if (correction.hasOwnProperty('originalReason')) {
            correction.reason = correction.originalReason
            delete correction.originalReason
          }

          // VALIDER la correction
          AppState.validatedCorrections.add(correctionId)
        })
      }

      // Restaurer le texte corrigé de Claude
      block.corrected = block.originalCorrected

      // Mettre à jour les stats
      const stats = SRTParser.calculateStats(AppState.blocks)
      updateStats(stats)

      // Re-render
      renderBlocksTable()
      updateMinimap()
      closeModal()
      return
    }

    // Cas 3 : Modification du texte (différent de l'original et de la suggestion)
    if (newValue && newValue !== block.original && newValue !== oldCorrected) {
      // Supprimer toutes les anciennes corrections de ce bloc
      const oldCorrections = block.corrections ? [...block.corrections] : []
      oldCorrections.forEach((_, idx) => {
        const correctionId = `${block.index}-${idx}`
        AppState.validatedCorrections.delete(correctionId)
      })

      // Remplacer par UNE SEULE correction "doubt"
      block.corrections = [{
        type: 'doubt',
        original: block.original,
        corrected: newValue,
        reason: 'Modifié manuellement',
        position: 0,
        originalSuggestion: oldCorrected,
        originalType: 'doubt',
        originalReason: 'Modifié manuellement'
      }]

      block.corrected = newValue

      // Valider automatiquement cette correction
      AppState.validatedCorrections.add(`${block.index}-0`)

      // Mettre à jour les stats
      const stats = SRTParser.calculateStats(AppState.blocks)
      updateStats(stats)

      // Re-render
      renderBlocksTable()
      updateMinimap()
    }

    closeModal()
  }

  // Événements
  modalSaveBtn.onclick = saveEdit
  modalCancelBtn.onclick = closeModal
  modalCloseBtn.onclick = closeModal
  modalOverlay.onclick = closeModal
  modalRestoreOriginalBtn.onclick = restoreOriginal
  modalRestoreBtn.onclick = restoreCorrected

  // Pour textarea multiligne : Ctrl+Enter pour sauvegarder, Escape pour annuler
  modalInput.onkeydown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      saveEdit()
    } else if (e.key === 'Escape') {
      closeModal()
    }
  }
}

/**
 * Édite une correction avec modal moderne
 */
function editCorrection(blockIndex, corrIndex) {
  const block = AppState.blocks.find(b => b.index === blockIndex)
  if (!block) return

  const correction = block.corrections[corrIndex]
  if (!correction) return

  // ID de correction pour validation
  const correctionId = `${blockIndex}-${corrIndex}`

  // Sauvegarder la suggestion originale, le type original et la raison originale si pas déjà fait
  if (!correction.hasOwnProperty('originalSuggestion')) {
    correction.originalSuggestion = correction.corrected
    correction.originalType = correction.type
    correction.originalReason = correction.reason
  }

  // Afficher le modal
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

  // Afficher la section "Suggestion de correction" pour l'édition de correction individuelle
  if (modalSuggestionField) {
    modalSuggestionField.style.display = 'block'
  }

  // Remplir le modal avec textContent pour préserver les apostrophes et caractères spéciaux
  // white-space: pre-wrap dans le CSS gère les sauts de ligne
  modalOriginal.textContent = correction.original

  // Afficher la suggestion originale de Claude (sauvegardée avant toute modification)
  // Si originalSuggestion existe, l'utiliser, sinon utiliser corrected
  const suggestionToShow = correction.hasOwnProperty('originalSuggestion') && correction.originalSuggestion !== undefined
    ? correction.originalSuggestion
    : correction.corrected
  modalSuggestion.textContent = suggestionToShow

  modalInput.value = correction.corrected
  modal.style.display = 'flex'
  modalInput.focus()
  modalInput.setSelectionRange(0, modalInput.value.length)

  // Fonction pour restaurer l'original (avec la faute)
  const restoreOriginal = () => {
    modalInput.value = correction.original
    modalInput.focus()
    modalInput.setSelectionRange(0, modalInput.value.length)
  }

  // Fonction pour restaurer la suggestion originale de Claude
  const restoreSuggestion = () => {
    // Utiliser originalSuggestion si disponible, sinon corrected
    const suggestionToRestore = correction.hasOwnProperty('originalSuggestion') && correction.originalSuggestion !== undefined
      ? correction.originalSuggestion
      : correction.corrected
    modalInput.value = suggestionToRestore
    modalInput.focus()
    modalInput.setSelectionRange(0, modalInput.value.length)
  }

  // Fonction pour fermer le modal
  const closeModal = () => {
    modal.style.display = 'none'
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
    const newValue = convertApostrophes(modalInput.value.trim())

    // Permettre d'enregistrer même si égal à l'original (pour pouvoir restaurer l'original comme modification en doute)
    if (newValue) {
      const oldCorrected = correction.corrected

      // Mettre à jour la correction
      correction.corrected = newValue

      // Mettre à jour le texte du bloc
      block.corrected = block.corrected.replace(oldCorrected, newValue)

      // Vérifier si la modification est différente de la suggestion originale
      // Comparer aussi les codes Unicode pour détecter les différences d'apostrophes
      const isDifferentFromSuggestion = newValue !== correction.originalSuggestion

      if (isDifferentFromSuggestion) {
        // Modifié différemment → passer SEULEMENT CETTE CORRECTION en mode "doubt"
        console.log(`Bloc #${block.index}, correction #${corrIndex}: Modification manuelle détectée`)
        console.log(`  Nouveau: "${newValue}" (codes: ${Array.from(newValue).map(c => c.charCodeAt(0)).join(',')})`)
        console.log(`  Suggestion: "${correction.originalSuggestion}" (codes: ${Array.from(correction.originalSuggestion).map(c => c.charCodeAt(0)).join(',')})`)

        // Sauvegarder le type et la raison originale si pas déjà fait
        if (!correction.hasOwnProperty('originalType')) {
          correction.originalType = correction.type
        }
        if (!correction.hasOwnProperty('originalReason')) {
          correction.originalReason = correction.reason
        }
        // Passer SEULEMENT cette correction en doute
        correction.type = 'doubt'
        correction.reason = 'Modifié manuellement'
      } else {
        // Remis comme la suggestion → repasser au type original
        correction.type = correction.originalType || 'major'
        // Restaurer la raison originale
        correction.reason = correction.originalReason
      }

      // Marquer la correction comme validée
      AppState.validatedCorrections.add(correctionId)

      // Mettre à jour les stats et la jauge
      const stats = SRTParser.calculateStats(AppState.blocks)
      updateStats(stats)

      // Re-render
      renderBlocksTable()
      updateMinimap()
    }

    closeModal()
  }

  // Événements
  modalSaveBtn.onclick = saveEdit
  modalCancelBtn.onclick = closeModal
  modalCloseBtn.onclick = closeModal
  modalOverlay.onclick = closeModal
  modalRestoreOriginalBtn.onclick = restoreOriginal
  modalRestoreBtn.onclick = restoreSuggestion

  // Enter pour sauvegarder, Escape pour annuler
  modalInput.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      saveEdit()
    } else if (e.key === 'Escape') {
      closeModal()
    }
  }
}

/**
 * Rejette une correction et la convertit en doute validé
 * Garde le texte original (n'applique pas la correction)
 */
function rejectCorrection(blockIndex, corrIndex) {
  const block = AppState.blocks.find(b => b.index === blockIndex)
  if (!block) return

  const correction = block.corrections[corrIndex]
  if (!correction) return

  // Sauvegarder la suggestion originale, le type et la raison si pas déjà fait
  if (!correction.hasOwnProperty('originalSuggestion')) {
    correction.originalSuggestion = correction.corrected
    correction.originalType = correction.type
    correction.originalReason = correction.reason
  }

  // Mettre à jour le texte du bloc pour garder l'original (défaire la correction)
  // block.corrected contient déjà toutes les corrections appliquées par Claude
  // On veut remplacer la suggestion par l'original
  if (block.corrected.includes(correction.originalSuggestion)) {
    block.corrected = block.corrected.replace(correction.originalSuggestion, correction.original)
  }

  // Mettre à jour la correction pour indiquer qu'on garde l'original
  correction.corrected = correction.original
  correction.reason = 'Rejeté (texte original conservé)'

  // Convertir en doute
  correction.type = 'doubt'

  // Marquer la correction comme validée (en tant que doute)
  const correctionId = `${blockIndex}-${corrIndex}`
  AppState.validatedCorrections.add(correctionId)

  // Mettre à jour les stats et la jauge
  const stats = SRTParser.calculateStats(AppState.blocks)
  updateStats(stats)

  // Re-render pour mettre à jour l'affichage avec couleur orange
  renderBlocksTable()
  updateMinimap()
}

/**
 * Valide des corrections par type
 */
function validateCorrections(type) {
  AppState.blocks.forEach(block => {
    if (!block.corrections) return

    block.corrections.forEach((correction, corrIndex) => {
      if (type === 'all' ||
          (type === 'minor' && correction.type === 'minor') ||
          (type === 'major' && correction.type === 'major') ||
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

/**
 * Réinitialise un bloc spécifique à son état initial
 * Supprime toutes les validations et restaure les types originaux pour ce bloc
 */
function resetBlockToInitialState(blockIndex) {
  // Trouver le bloc
  const block = AppState.blocks.find(b => b.index === blockIndex)
  if (!block || !block.corrections || block.corrections.length === 0) {
    return
  }

  // CAS SPÉCIAL : Si le bloc n'avait pas de corrections à l'origine,
  // supprimer toutes les corrections créées manuellement
  if (block.hadOriginalCorrections === false) {
    // Supprimer toutes les validations
    block.corrections.forEach((_, corrIndex) => {
      const correctionId = `${blockIndex}-${corrIndex}`
      AppState.validatedCorrections.delete(correctionId)
    })

    // Supprimer toutes les corrections et restaurer le texte original
    block.corrections = []
    block.corrected = block.original

    // Mettre à jour les stats et la jauge
    const stats = SRTParser.calculateStats(AppState.blocks)
    updateStats(stats)

    // Re-render pour mettre à jour l'affichage
    renderBlocksTable()
    updateMinimap()
    return
  }

  // CAS NORMAL : Le bloc avait des corrections à l'origine, les restaurer
  // Supprimer toutes les validations pour ce bloc
  block.corrections.forEach((correction, corrIndex) => {
    const correctionId = `${blockIndex}-${corrIndex}`
    AppState.validatedCorrections.delete(correctionId)

    // Restaurer la suggestion originale si elle a été modifiée ou rejetée
    if (correction.hasOwnProperty('originalSuggestion')) {
      correction.corrected = correction.originalSuggestion
      delete correction.originalSuggestion
    }

    // Restaurer le type original si modifié
    if (correction.hasOwnProperty('originalType')) {
      correction.type = correction.originalType
      delete correction.originalType
    }
    // Restaurer la raison originale si elle existe
    if (correction.hasOwnProperty('originalReason')) {
      correction.reason = correction.originalReason
      delete correction.originalReason
    }
  })

  // Reconstruire block.corrected en appliquant toutes les corrections restaurées
  // On trie les corrections par position pour les appliquer dans l'ordre
  const sortedCorrections = [...block.corrections].sort((a, b) => a.position - b.position)
  let correctedText = block.original
  let offset = 0

  sortedCorrections.forEach(correction => {
    const startPos = correction.position + offset
    const endPos = startPos + correction.original.length

    // Vérifier que la position est valide
    if (correctedText.substring(startPos, endPos) === correction.original) {
      // Remplacer l'original par le corrigé
      correctedText = correctedText.substring(0, startPos) + correction.corrected + correctedText.substring(endPos)

      // Ajuster l'offset pour les prochaines corrections
      offset += correction.corrected.length - correction.original.length
    }
  })

  block.corrected = correctedText

  // Mettre à jour les stats et la jauge
  const stats = SRTParser.calculateStats(AppState.blocks)
  updateStats(stats)

  // Re-render pour mettre à jour l'affichage
  renderBlocksTable()
  updateMinimap()
}

/**
 * Réinitialise l'état initial (après upload)
 * Garde les corrections mineures pré-validées
 */
function resetToInitialState() {
  // Vider toutes les validations
  AppState.validatedCorrections.clear()

  // Restaurer les types originaux et supprimer les modifications
  AppState.blocks.forEach(block => {
    if (block.corrections && block.corrections.length > 0) {
      // CAS SPÉCIAL : Si le bloc n'avait pas de corrections à l'origine,
      // supprimer toutes les corrections créées manuellement
      if (block.hadOriginalCorrections === false) {
        block.corrections = []
        block.corrected = block.original
        return // Passer au bloc suivant
      }

      // CAS NORMAL : Le bloc avait des corrections à l'origine, les restaurer
      block.corrections.forEach((correction, corrIndex) => {
        // Restaurer la suggestion originale si elle a été modifiée ou rejetée
        if (correction.hasOwnProperty('originalSuggestion')) {
          correction.corrected = correction.originalSuggestion
          delete correction.originalSuggestion
        }

        // Si le type a été modifié, le restaurer
        if (correction.hasOwnProperty('originalType')) {
          correction.type = correction.originalType
          delete correction.originalType
        }
        // Restaurer la raison originale si elle existe
        if (correction.hasOwnProperty('originalReason')) {
          correction.reason = correction.originalReason
          delete correction.originalReason
        }
      })

      // Reconstruire block.corrected en appliquant toutes les corrections restaurées
      const sortedCorrections = [...block.corrections].sort((a, b) => a.position - b.position)
      let correctedText = block.original
      let offset = 0

      sortedCorrections.forEach(correction => {
        const startPos = correction.position + offset
        const endPos = startPos + correction.original.length

        // Vérifier que la position est valide
        if (correctedText.substring(startPos, endPos) === correction.original) {
          // Remplacer l'original par le corrigé
          correctedText = correctedText.substring(0, startPos) + correction.corrected + correctedText.substring(endPos)

          // Ajuster l'offset pour les prochaines corrections
          offset += correction.corrected.length - correction.original.length
        }
      })

      block.corrected = correctedText
    }
  })

  // Réinitialiser le filtre actif
  AppState.activeFilter = null
  document.querySelectorAll('.stat-filter').forEach(btn => {
    btn.classList.remove('active')
  })

  // Mettre à jour les stats et la jauge
  const stats = SRTParser.calculateStats(AppState.blocks)
  updateStats(stats)

  // Re-render pour mettre à jour l'affichage
  renderBlocksTable()
  updateMinimap()

  console.log('État réinitialisé à l\'état initial (après upload)')
}

/**
 * Télécharge le fichier SRT avec uniquement les corrections validées
 */
function downloadSRT() {
  // Créer une copie des blocs avec seulement les corrections validées appliquées
  const blocksWithValidatedCorrections = AppState.blocks.map(block => {
    return {
      ...block,
      corrected: buildTextWithValidatedCorrections(block)
    }
  })

  const content = SRTParser.generate(blocksWithValidatedCorrections)
  const filename = SRTParser.generateFilename(AppState.originalFilename, '_SR')
  SRTParser.downloadFile(content, filename, 'text/plain')
}

/**
 * Télécharge le fichier TXT avec uniquement les corrections validées
 */
function downloadTXT() {
  // Créer une copie des blocs avec seulement les corrections validées appliquées
  const blocksWithValidatedCorrections = AppState.blocks.map(block => {
    return {
      ...block,
      corrected: buildTextWithValidatedCorrections(block)
    }
  })

  const content = SRTParser.generateTXT(blocksWithValidatedCorrections)
  const filename = SRTParser.generateFilename(AppState.originalFilename, '_SR', 'txt')
  SRTParser.downloadFile(content, filename, 'text/plain')
}

/**
 * Construit le texte d'un bloc en n'appliquant que les corrections validées
 * @param {Object} block - Le bloc à traiter
 * @returns {string} Texte avec seulement les corrections validées
 */
function buildTextWithValidatedCorrections(block) {
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

  sortedCorrections.forEach(correction => {
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
 * Réinitialise l'application
 */
function resetApp() {
  AppState.originalFilename = null
  AppState.blocks = []
  AppState.validatedCorrections.clear()

  // Reset filter state
  AppState.activeFilter = null
  document.querySelectorAll('.stat-filter').forEach(btn => {
    btn.classList.remove('active')
  })

  resetFileInput()
  showSection('upload')
}

/**
 * Réinitialise l'input de fichier
 */
function resetFileInput() {
  if (DOM.fileInput) {
    DOM.fileInput.value = ''
  }
  if (DOM.fileInfo) {
    DOM.fileInfo.style.display = 'none'
  }
}

/**
 * Affiche une section spécifique
 */
function showSection(section) {
  DOM.uploadSection.style.display = section === 'upload' ? 'block' : 'none'
  DOM.loadingSection.style.display = section === 'loading' ? 'block' : 'none'
  DOM.editorSection.style.display = section === 'editor' ? 'block' : 'none'
}

/**
 * Met à jour la barre de progression
 */
function updateProgress(percent, text) {
  if (DOM.progressFill) {
    DOM.progressFill.style.width = `${percent}%`
  }
  if (DOM.progressText) {
    DOM.progressText.textContent = text
  }
}

/**
 * Met à jour les statistiques et la jauge de progression
 */
function updateStats(stats) {
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
  if (DOM.statMinor) DOM.statMinor.textContent = stats.minor
  if (DOM.statMajor) DOM.statMajor.textContent = stats.major
  if (DOM.statDoubt) DOM.statDoubt.textContent = stats.doubt

  // Activer/désactiver les boutons de filtre selon les compteurs
  document.querySelectorAll('.stat-filter').forEach(filterBtn => {
    const filterType = filterBtn.dataset.filter
    let count = 0

    switch(filterType) {
      case 'all':
        count = blocksWithCorrections  // Utiliser le nombre de blocs au lieu du total de fautes
        break
      case 'minor':
        count = stats.minor
        break
      case 'major':
        count = stats.major
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
  // Si 0 erreur, c'est 100% de corrections faites (rien à corriger)
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

  // Calculer les pourcentages pour chaque portion
  const nonDoubtPercent = totalCorrections > 0 ? (validatedNonDoubtCount / totalCorrections) * 100 : 0
  const doubtPercent = totalCorrections > 0 ? (validatedDoubtCount / totalCorrections) * 100 : 0

  // Mettre à jour la jauge avec gradient
  if (DOM.progressGaugeFill) {
    DOM.progressGaugeFill.style.width = `${progressPercent}%`

    // Appliquer le gradient uniquement si on a des corrections validées
    if (validatedCount > 0) {
      // Calculer la proportion de chaque couleur dans la barre
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
  updateValidationButtonsState(stats)
}

/**
 * Met à jour l'état des boutons de validation (désactive si toutes corrections validées)
 */
function updateValidationButtonsState(stats) {
  // Compter combien de corrections de chaque type sont validées
  let validatedMinorCount = 0
  let validatedMajorCount = 0
  let validatedDoubtCount = 0

  AppState.blocks.forEach(block => {
    if (!block.corrections) return
    block.corrections.forEach((correction, corrIndex) => {
      const correctionId = `${block.index}-${corrIndex}`
      if (AppState.validatedCorrections.has(correctionId)) {
        if (correction.type === 'minor') validatedMinorCount++
        else if (correction.type === 'major') validatedMajorCount++
        else if (correction.type === 'doubt') validatedDoubtCount++
      }
    })
  })

  // Désactiver/activer les boutons en fonction
  const allMinorValidated = stats.minor > 0 && validatedMinorCount === stats.minor
  const allMajorValidated = stats.major > 0 && validatedMajorCount === stats.major
  const allDoubtValidated = stats.doubt > 0 && validatedDoubtCount === stats.doubt
  const allValidated = stats.total > 0 && AppState.validatedCorrections.size === stats.total

  if (DOM.validateMinorBtn) {
    DOM.validateMinorBtn.disabled = allMinorValidated || stats.minor === 0
    DOM.validateMinorBtn.classList.toggle('btn-disabled', allMinorValidated || stats.minor === 0)
  }

  if (DOM.validateMajorBtn) {
    DOM.validateMajorBtn.disabled = allMajorValidated || stats.major === 0
    DOM.validateMajorBtn.classList.toggle('btn-disabled', allMajorValidated || stats.major === 0)
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

/**
 * Gère le clic sur les filtres de statistiques
 */
function handleFilterClick(event) {
  const filterBtn = event.currentTarget
  const filterType = filterBtn.dataset.filter

  // Si on clique sur le filtre actif, on le désactive
  if (AppState.activeFilter === filterType) {
    AppState.activeFilter = null
    filterBtn.classList.remove('active')
  } else {
    // Sinon, on active le nouveau filtre
    // Désactiver tous les filtres
    document.querySelectorAll('.stat-filter').forEach(btn => {
      btn.classList.remove('active')
    })

    // Activer le filtre cliqué
    AppState.activeFilter = filterType === 'all' ? null : filterType
    if (filterType !== 'all') {
      filterBtn.classList.add('active')
    }
  }

  // Re-render le tableau avec le filtre
  renderBlocksTable()
}

/**
 * Génère la minimap de navigation
 */
function renderMinimap() {
  if (!DOM.minimapBlocks) return

  // Attendre que le DOM soit prêt
  setTimeout(() => {
    rebuildMinimap()
  }, 100)
}

/**
 * Reconstruit complètement la minimap
 */
function rebuildMinimap() {
  if (!DOM.minimapBlocks) return

  // Vider la minimap
  DOM.minimapBlocks.innerHTML = ''

  // Récupérer les dimensions
  const minimapHeight = DOM.minimapBlocks.offsetHeight

  if (minimapHeight === 0) return

  console.log(`[Minimap] Container height: ${minimapHeight}px`)
  console.log(`[Minimap] Total blocks: ${AppState.blocks.length}`)

  // Première passe : collecter les données des blocs
  const blocksData = []

  AppState.blocks.forEach((block) => {
    const blockRow = document.getElementById(`block-row-${block.index}`)
    if (!blockRow) {
      console.warn(`[Minimap] Block row not found for block #${block.index}`)
      return
    }

    const blockClass = getBlockMinimapClass(block)
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

  // Déterminer le gap entre les blocs : plus il y a de blocs, plus le gap est réduit
  let gap = 3 // Gap par défaut : 3px
  if (visibleBlocksCount > 100) {
    gap = 1 // Beaucoup de blocs : gap de 1px
  } else if (visibleBlocksCount > 50) {
    gap = 2 // Pas mal de blocs : gap de 2px
  }

  // Calculer l'espace total pour les gaps
  const totalGapsHeight = Math.max(0, (visibleBlocksCount - 1) * gap)

  // Calculer la hauteur disponible pour les blocs
  const availableHeightForBlocks = minimapHeight - totalGapsHeight

  // Hauteur uniforme pour chaque bloc (minimum 3px)
  const uniformBlockHeight = Math.max(3, availableHeightForBlocks / visibleBlocksCount)

  console.log(`[Minimap] ${visibleBlocksCount} visible blocks, gap: ${gap}px, uniform height: ${uniformBlockHeight.toFixed(1)}px`)

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
 */
function getBlockMinimapClass(block) {
  // Vérifier si toutes les corrections sont validées
  const allValidated = block.corrections && block.corrections.length > 0 &&
    block.corrections.every((c, idx) => AppState.validatedCorrections.has(`${block.index}-${idx}`))

  // Pas de correction → afficher quand même dans la minimap
  if (!block.corrections || block.corrections.length === 0) {
    return 'minimap-no-correction'
  }

  // Si toutes validées, vérifier le type pour la couleur
  // Priorité : majeur > doute > mineur
  if (allValidated) {
    const hasMajor = block.corrections.some(c => c.type === 'major')
    const hasDoubt = block.corrections.some(c => c.type === 'doubt')
    const hasMinor = block.corrections.some(c => c.type === 'minor')

    if (hasMajor) {
      return 'minimap-validated'
    } else if (hasDoubt) {
      return 'minimap-validated-doubt'
    } else if (hasMinor) {
      return 'minimap-validated-minor'
    } else {
      return 'minimap-validated'
    }
  }

  // Non validées : déterminer le type dominant
  // Nouvelle priorité : majeure non validée > doute (validé ou non) > mineure
  const hasUnvalidatedMajor = block.corrections.some((c, idx) =>
    c.type === 'major' && !AppState.validatedCorrections.has(`${block.index}-${idx}`)
  )

  // Si une majeure non validée existe, priorité absolue
  if (hasUnvalidatedMajor) {
    return 'minimap-major'
  }

  // Sinon, vérifier si le bloc contient au moins un doute (validé ou non)
  const hasDoubt = block.corrections.some(c => c.type === 'doubt')
  if (hasDoubt) {
    return 'minimap-doubt'
  }

  // Sinon, vérifier s'il reste des mineures non validées
  const hasUnvalidatedMinor = block.corrections.some((c, idx) =>
    c.type === 'minor' && !AppState.validatedCorrections.has(`${block.index}-${idx}`)
  )
  if (hasUnvalidatedMinor) {
    return 'minimap-minor'
  }

  // Tout est validé (aucune majeure non validée, aucun doute, aucune mineure non validée)
  return 'minimap-validated'
}

/**
 * Met à jour la minimap (appelé après validation)
 */
function updateMinimap() {
  if (!DOM.minimapBlocks) return

  AppState.blocks.forEach(block => {
    const minimapBlock = DOM.minimapBlocks.querySelector(`[data-block-index="${block.index}"]`)
    if (!minimapBlock) return

    // Retirer toutes les classes d'état
    minimapBlock.classList.remove('minimap-validated', 'minimap-validated-doubt', 'minimap-validated-minor', 'minimap-no-correction', 'minimap-major', 'minimap-doubt', 'minimap-minor')

    // Ajouter la nouvelle classe
    const blockClass = getBlockMinimapClass(block)
    minimapBlock.classList.add(blockClass)
  })
}

/**
 * Scroll vers un bloc spécifique
 */
function scrollToBlock(blockIndex) {
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
 */
function updateMinimapCurrentPosition() {
  if (!DOM.minimapBlocks) return

  // Retirer l'ancienne classe current
  const oldCurrent = DOM.minimapBlocks.querySelector('.minimap-current')
  if (oldCurrent) {
    oldCurrent.classList.remove('minimap-current')
  }

  // Trouver le bloc visible au centre de l'écran
  const viewportCenter = window.scrollY + (window.innerHeight / 2)

  let closestBlock = null
  let closestDistance = Infinity

  AppState.blocks.forEach(block => {
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
    const minimapBlock = DOM.minimapBlocks.querySelector(`[data-block-index="${closestBlock.index}"]`)
    if (minimapBlock) {
      minimapBlock.classList.add('minimap-current')
    }
  }
}

// Throttle pour éviter trop d'appels lors du scroll
let scrollTimeout = null
function onScrollThrottled() {
  if (scrollTimeout) return

  scrollTimeout = setTimeout(() => {
    updateMinimapCurrentPosition()
    scrollTimeout = null
  }, 100)
}

// Throttle pour éviter trop d'appels lors du resize
let resizeTimeout = null
function onResizeThrottled() {
  if (resizeTimeout) return

  resizeTimeout = setTimeout(() => {
    console.log('[Minimap] Window resized, rebuilding minimap')
    // Reconstruire complètement la minimap avec les nouvelles dimensions
    rebuildMinimap()
    resizeTimeout = null
  }, 200)
}
