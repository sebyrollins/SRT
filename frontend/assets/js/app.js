/**
 * SRT Corrector Pro - Main Application Logic
 */

// Imports des modules de gestion d'état
import AppState, {
  getState,
  getBlocks,
  getBlock,
  getCorrection,
  getOriginalFilename,
  getActiveFilter,
  isValidated,
  isGenderSwitched,
  isBlockFullyValidated
} from './state/AppState.js'

import {
  setOriginalFilename,
  setBlocks,
  setActiveFilter,
  toggleFilter,
  validateCorrection,
  unvalidateCorrection,
  validateAllBlockCorrections as validateAllBlockCorrectionsState,
  validateAllCorrections,
  validateCorrectionsByType,
  switchGender,
  unswitchGender,
  toggleGenderSwitch,
  resetBlock,
  resetAllValidations,
  resetApp as resetAppState,
  updateBlockCorrectedText,
  updateCorrection,
  removeCorrection,
  addCorrection,
  clearBlockCorrections
} from './state/stateManager.js'

// Imports des modules UI
import { openEditModal } from './ui/modal.js'
import { showSection as showSectionUI } from './ui/sections.js'
import { updateProgress as updateProgressUI } from './ui/progress.js'

// Imports des modules de rendu
import { updateStats as updateStatsModule } from './rendering/stats.js'
import {
  renderMinimap as renderMinimapModule,
  updateMinimap as updateMinimapModule,
  scrollToBlock,
  updateMinimapCurrentPosition,
  onScrollThrottled,
  onResizeThrottled
} from './rendering/minimap.js'
import { renderBlocksTable as renderBlocksTableModule } from './rendering/blocksTable.js'

// Imports des modules d'actions
import {
  validateAllBlockCorrections as validateAllBlockCorrectionsModule,
  validateSingleCorrection as validateSingleCorrectionModule,
  validateCorrections as validateCorrectionsModule
} from './actions/validation.js'
import {
  editBlockText as editBlockTextModule,
  editCorrection as editCorrectionModule
} from './actions/editing.js'
import {
  resetToOriginalSuggestion as resetToOriginalSuggestionModule,
  resetBlockToInitialState as resetBlockToInitialStateModule,
  rejectCorrection as rejectCorrectionModule,
  toggleGender as toggleGenderModule
} from './actions/reset.js'

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
  statFault: null,
  statDoubt: null,
  progressGaugeFill: null,
  progressGaugeValue: null,
  validateAllBtn: null,
  validateFaultBtn: null,
  validateDoubtBtn: null,
  resetStateBtn: null,
  downloadSrtBtn: null,
  downloadTxtBtn: null,
  newFileBtn: null,
  blocksTableBody: null,
  navigationMinimap: null,
  minimapBlocks: null
}

// Exposer globalement pour les modules (fallback)
window.AppState = AppState
window.DOM = DOM

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
  DOM.statFault = document.getElementById('statFault')
  DOM.statDoubt = document.getElementById('statDoubt')
  DOM.progressGaugeFill = document.getElementById('progressGaugeFill')
  DOM.progressGaugeValue = document.getElementById('progressGaugeValue')
  DOM.validateAllBtn = document.getElementById('validateAllBtn')
  DOM.validateFaultBtn = document.getElementById('validateFaultBtn')
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

  if (DOM.validateFaultBtn) {
    DOM.validateFaultBtn.addEventListener('click', () => validateCorrections('fault'))
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

  setOriginalFilename(filename)

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

    // Retirer les corrections de genre du texte (par défaut = original)
    removeDoubtCorrectionsFromText(correctedBlocks)

    // Nettoyer les objets correction.corrected pour les corrections de doute
    // (enlever les parenthèses et les bugs de l'ancien format)
    cleanDoubtCorrectionsObjects(correctedBlocks)

    // Sauvegarder les blocs
    setBlocks(correctedBlocks)

    // Valider automatiquement toutes les corrections de genre (doute)
    // Par défaut, elles sont validées avec l'orthographe originale
    autoValidateDoubtCorrections()

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
 * Extrait la forme alternative du genre d'une correction de type "doubt"
 * Utilise le champ "alternative" si disponible (nouveau format), sinon parse les parenthèses (ancien format)
 * @param {Object} correction - Objet correction complet
 * @returns {string} - Forme alternative
 */
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

        // Pour les corrections de type "doubt", c'est NORMAL que original === corrected
        // (corrected = forme dans l'original, alternative = autre forme)
        // Ne PAS les supprimer si elles ont un champ "alternative"
        if (correction.type === 'doubt' && correction.alternative) {
          return true // Garder les corrections de doute avec alternative
        }

        // Pour les autres types (fault), vérifier si vraiment identiques
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
 * Retire les corrections de genre (doubt) du texte corrigé
 * Par défaut, les corrections de genre ne sont PAS appliquées (on garde l'original)
 * Elles ne sont appliquées que si l'utilisateur clique "Changer le genre"
 */
function removeDoubtCorrectionsFromText(blocks) {
  blocks.forEach(block => {
    if (block.corrections && block.corrections.length > 0) {
      // Chercher les corrections de type "doubt"
      const doubtCorrections = block.corrections.filter(c => c.type === 'doubt')

      if (doubtCorrections.length > 0) {
        // Pour chaque correction de genre, s'assurer que le texte contient l'original
        doubtCorrections.forEach(correction => {
          // Si le texte contient déjà l'original, rien à faire
          if (block.corrected.includes(correction.original)) {
            return
          }

          // Nouveau format : utiliser le champ alternative si disponible
          if (correction.alternative) {
            // Remplacer la forme alternative par l'original
            if (block.corrected.includes(correction.alternative)) {
              block.corrected = block.corrected.replace(correction.alternative, correction.original)
              return
            }
          }

          // Ancien format : chercher et remplacer les formes avec parenthèses
          // Pattern : trouve le texte avec "(ou XXX)" ou variations bugées comme "attachéee (ou attaché)"
          // On va chercher n'importe quel texte qui ressemble à correction.original avec des variations

          // Extraire les mots de correction.original pour construire un pattern flexible
          const originalWords = correction.original.split(/\s+/)
          const lastWord = originalWords[originalWords.length - 1]

          // Construire un pattern qui trouve le dernier mot avec potentiellement des lettres en trop
          // puis suivi de "(ou ...)"
          const escapedPrefix = originalWords.slice(0, -1).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')
          const escapedLastWord = lastWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

          // Pattern flexible qui permet des variations du dernier mot (pour gérer les bugs comme "attachéee")
          const pattern = new RegExp(
            `${escapedPrefix}${escapedPrefix ? '\\s+' : ''}${escapedLastWord}e*\\s*\\(ou\\s+[^)]+\\)`,
            'g'
          )

          const newText = block.corrected.replace(pattern, correction.original)
          if (newText !== block.corrected) {
            block.corrected = newText
            console.log(`[removeDoubtCorrections] Nettoyé ancien format dans bloc #${block.index}: "${correction.original}"`)
          }
        })
      }
    }
  })
}

/**
 * Nettoie les objets correction.corrected pour les corrections de doute
 * Pour l'ancien format avec parenthèses ou bugs, remplace par correction.original
 */
function cleanDoubtCorrectionsObjects(blocks) {
  blocks.forEach(block => {
    if (block.corrections && block.corrections.length > 0) {
      block.corrections.forEach(correction => {
        if (correction.type === 'doubt') {
          // Si nouveau format avec alternative, s'assurer que corrected = original
          if (correction.alternative) {
            correction.corrected = correction.original
          }
          // Si ancien format avec parenthèses, enlever les parenthèses et bugs
          else if (correction.corrected.includes('(ou ')) {
            // Enlever tout ce qui est après et incluant "(ou"
            const withoutParentheses = correction.corrected.replace(/\s*\(ou\s+[^)]+\)/g, '').trim()

            // S'assurer que ça correspond à l'original (gérer les bugs de lettres en trop)
            // Si withoutParentheses est proche de original, utiliser original
            correction.corrected = correction.original
            console.log(`[cleanDoubtObjects] Nettoyé correction de doute dans bloc #${block.index}: "${correction.original}"`)
          }
        }
      })
    }
  })
}

/**
 * Valide automatiquement toutes les corrections de doute (genre)
 * Par défaut, les corrections de genre sont validées avec l'orthographe originale
 */
function autoValidateDoubtCorrections() {
  AppState.blocks.forEach(block => {
    if (block.corrections && block.corrections.length > 0) {
      block.corrections.forEach((correction, corrIndex) => {
        if (correction.type === 'doubt') {
          const correctionId = `${block.index}-${corrIndex}`
          // Ajouter à validatedCorrections (validé avec forme originale par défaut)
          AppState.validatedCorrections.add(correctionId)
        }
      })
    }
  })
  console.log('[Doubt] Corrections de genre auto-validées:', AppState.validatedCorrections.size)
}

/**
 * Envoie le contenu au Cloudflare Worker
 */
async function sendToWorker(content, filename) {
  // Vérifier que le Worker est configuré
  if (window.APP_CONFIG.workerUrl.includes('YOUR-SUBDOMAIN')) {
    throw new Error(`⚠️ Le Worker Cloudflare n'est pas encore configuré.\n\nÉtapes :\n1. Déployez le Worker sur Cloudflare\n2. Modifiez l'URL dans frontend/lib/config.php\n\nConsultez le README.md pour les instructions.`)
  }

  // Récupérer le modèle sélectionné
  const modelSelect = document.getElementById('modelSelect')
  const selectedModel = modelSelect ? modelSelect.value : 'haiku'

  const response = await fetch(window.APP_CONFIG.workerUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      srtContent: content,
      fileName: filename,
      model: selectedModel
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

  // Afficher les logs de debug si présents
  if (result.debugLogs && result.debugLogs.length > 0) {
    console.log('=== DEBUG LOGS FROM WORKER ===')
    result.debugLogs.forEach((log, index) => {
      console.log(`\n[${index + 1}] ${log.type} (${log.timestamp}):`)
      if (log.type === 'pass4_user_prompt') {
        console.log('User Prompt:', log.content)
      } else if (log.type === 'pass4_claude_response') {
        console.log('Claude Response:', log.content)
        console.log('Blocks Count:', log.blocksCount)
      } else if (log.type === 'pass4_validation') {
        console.log(`Block #${log.blockIndex}:`)
        console.log(`  Correction: "${log.correctionOriginal}"`)
        console.log(`  Block text: "${log.blockText}"`)
        console.log(`  Contains: ${log.contains}`)
      } else if (log.type === 'pass4_rejection') {
        console.log(`❌ REJECTED - Block #${log.blockIndex}:`)
        console.log(`  Correction: "${log.correctionOriginal}" → "${log.correctionCorrected}"`)
        console.log(`  Block text: "${log.blockText}"`)
      }
    })
    console.log('=== END DEBUG LOGS ===\n')
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
/**
 * Affiche le tableau des blocs (wrapper pour le module rendering)
 */
function renderBlocksTable() {
  renderBlocksTableModule(DOM, AppState, SRTParser, {
    validateAllBlockCorrections,
    editBlockText,
    resetBlockToInitialState,
    validateSingleCorrection,
    editCorrection,
    rejectCorrection,
    resetToOriginalSuggestion,
    toggleGender
  })
}

/**
 * Valide toutes les corrections d'un bloc (wrapper pour le module actions)
 */
function validateAllBlockCorrections(blockIndex) {
  validateAllBlockCorrectionsModule(blockIndex, AppState, SRTParser, updateStats, renderBlocksTable, updateMinimap, scrollToBlock)
}

/**
 * Valide une correction unique (wrapper pour le module actions)
 */
function validateSingleCorrection(blockIndex, corrIndex) {
  validateSingleCorrectionModule(blockIndex, corrIndex, AppState, SRTParser, updateStats, renderBlocksTable, updateMinimap, scrollToBlock)
}

/**
 * Réinitialise une correction à la suggestion originale (wrapper pour le module actions)
 */
function resetToOriginalSuggestion(blockIndex, corrIndex) {
  resetToOriginalSuggestionModule(blockIndex, corrIndex, AppState, SRTParser, updateStats, renderBlocksTable, updateMinimap)
}

/**
 * Bascule entre les formes de genre (wrapper pour le module actions)
 */
function toggleGender(blockIndex, corrIndex) {
  toggleGenderModule(blockIndex, corrIndex, AppState, SRTParser, updateStats, renderBlocksTable, updateMinimap)
}

/**
 * Édite le texte complet d'un bloc (wrapper pour le module actions)
 */
function editBlockText(blockIndex) {
  editBlockTextModule(blockIndex, AppState, SRTParser, updateStats, renderBlocksTable, updateMinimap)
}

/**
 * Édite une correction (wrapper pour le module actions)
 */
function editCorrection(blockIndex, corrIndex) {
  editCorrectionModule(blockIndex, corrIndex, AppState, SRTParser, updateStats, renderBlocksTable, updateMinimap)
}

/**
 * Rejette une correction (wrapper pour le module actions)
 */
function rejectCorrection(blockIndex, corrIndex) {
  rejectCorrectionModule(blockIndex, corrIndex, AppState, SRTParser, updateStats, renderBlocksTable, updateMinimap)
}

/**
 * Valide des corrections par type (wrapper pour le module actions)
 */
function validateCorrections(type) {
  validateCorrectionsModule(type, AppState, SRTParser, updateStats, renderBlocksTable, updateMinimap)
}

/**
 * Réinitialise un bloc à son état initial (wrapper pour le module actions)
 */
function resetBlockToInitialState(blockIndex) {
  resetBlockToInitialStateModule(blockIndex, AppState, SRTParser, updateStats, renderBlocksTable, updateMinimap)
}

/**
 * Réinitialise l'état initial (après upload)
 * Garde les corrections mineures pré-validées
 */
function resetToInitialState() {
  // Vider toutes les validations et remettre les genres à l'original
  AppState.validatedCorrections.clear()
  AppState.genderSwitched.clear()

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
        // Pour les corrections "doubt" de GENRE, ne jamais les appliquer dans le rebuild
        // Elles seront re-validées après mais montrent l'original par défaut
        // MAIS pour les corrections modifiées manuellement, on DOIT les appliquer
        if (correction.type === 'doubt' && correction.alternative && !correction.isManuallyEdited) {
          return
        }

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

  // Re-valider automatiquement toutes les corrections de doute (genre)
  autoValidateDoubtCorrections()

  // Réinitialiser le filtre actif
  setActiveFilter(null)
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
 * Réinitialise l'application
 */
function resetApp() {
  // Utiliser resetAppState du stateManager
  resetAppState()

  // Reset filter UI
  document.querySelectorAll('.stat-filter').forEach(btn => {
    btn.classList.remove('active')
  })

  // Reset minimap
  if (DOM.minimapBlocks) {
    DOM.minimapBlocks.innerHTML = ''
  }

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
 * Affiche une section spécifique (wrapper pour le module UI)
 */
function showSection(section) {
  showSectionUI(section, DOM)
}

/**
 * Met à jour la barre de progression (wrapper pour le module UI)
 */
function updateProgress(percent, text) {
  updateProgressUI(percent, text, DOM)
}

/**
 * Met à jour les statistiques et la jauge de progression (wrapper pour le module rendering)
 */
function updateStats(stats) {
  updateStatsModule(stats, AppState, DOM)
}

/**
 * Gère le clic sur les filtres de statistiques
 */
function handleFilterClick(event) {
  const filterBtn = event.currentTarget
  const filterType = filterBtn.dataset.filter

  // Utiliser toggleFilter du stateManager
  toggleFilter(filterType)

  // Mettre à jour l'UI
  document.querySelectorAll('.stat-filter').forEach(btn => {
    btn.classList.remove('active')
  })

  if (getActiveFilter() && filterType !== 'all') {
    filterBtn.classList.add('active')
  }

  // Re-render le tableau avec le filtre
  renderBlocksTable()
}

/**
 * Génère la minimap de navigation
 */
/**
 * Génère la minimap de navigation (wrapper pour le module rendering)
 */
function renderMinimap() {
  renderMinimapModule(DOM)
}

/**
 * Met à jour la minimap (wrapper pour le module rendering)
 */
function updateMinimap() {
  updateMinimapModule(DOM, AppState)
}

// scrollToBlock, updateMinimapCurrentPosition, onScrollThrottled, et onResizeThrottled
// sont désormais importés du module rendering/minimap.js
