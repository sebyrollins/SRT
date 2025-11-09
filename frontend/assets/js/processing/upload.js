/**
 * Module de traitement des fichiers uploadés
 * Gère l'upload, le traitement et le nettoyage des corrections
 */

import { setOriginalFilename, setBlocks } from '../state/stateManager.js'
import { showSection as showSectionUI } from '../ui/sections.js'
import { updateProgress as updateProgressUI } from '../ui/progress.js'

/**
 * Convertit les apostrophes droites en apostrophes courbes dans tous les blocs
 * @param {Array} blocks - Liste des blocs
 */
function convertStraightApostrophesToCurly(blocks) {
  // Helper pour conversion d'apostrophes (déjà défini dans editing.js mais copié ici pour indépendance)
  const convertApostrophes = (text) => {
    if (!text) return text
    const placeholder = '\uFFFF'
    return text
      .replace(/''/g, placeholder)
      .replace(/'/g, '\u2019')
      .replace(new RegExp(placeholder, 'g'), "''")
  }

  blocks.forEach(block => {
    block.original = convertApostrophes(block.original)
    block.corrected = convertApostrophes(block.corrected)

    if (block.corrections && block.corrections.length > 0) {
      block.corrections.forEach(correction => {
        correction.original = convertApostrophes(correction.original)
        correction.corrected = convertApostrophes(correction.corrected)
      })
    }
  })
  console.log('[Typography] Apostrophes droites converties en apostrophes courbes')
}

/**
 * Nettoie les corrections "fantômes" où original === corrected
 * @param {Array} blocks - Liste des blocs
 */
function cleanPhantomCorrections(blocks) {
  blocks.forEach(block => {
    if (block.corrections && block.corrections.length > 0) {
      const removed = []

      block.corrections = block.corrections.filter(correction => {
        const normalizedOriginal = correction.original.normalize('NFC').trim()
        const normalizedCorrected = correction.corrected.normalize('NFC').trim()

        // Pour les corrections de type "doubt", garder si elles ont un champ "alternative"
        if (correction.type === 'doubt' && correction.alternative) {
          return true
        }

        const isPhantom = normalizedOriginal === normalizedCorrected

        if (isPhantom) {
          removed.push({
            original: correction.original,
            corrected: correction.corrected,
            type: correction.type,
            reason: correction.reason
          })
        }
        return !isPhantom
      })

      if (removed.length > 0) {
        console.log(`Bloc #${block.index}: ${removed.length} correction(s) fantôme(s) supprimée(s):`, removed)
      }
    }
  })
}

/**
 * Retire les corrections de genre (doubt) du texte corrigé
 * @param {Array} blocks - Liste des blocs
 */
function removeDoubtCorrectionsFromText(blocks) {
  blocks.forEach(block => {
    if (block.corrections && block.corrections.length > 0) {
      const doubtCorrections = block.corrections.filter(c => c.type === 'doubt')

      if (doubtCorrections.length > 0) {
        doubtCorrections.forEach(correction => {
          if (block.corrected.includes(correction.original)) {
            return
          }

          // Nouveau format : utiliser le champ alternative si disponible
          if (correction.alternative) {
            if (block.corrected.includes(correction.alternative)) {
              block.corrected = block.corrected.replace(correction.alternative, correction.original)
              return
            }
          }

          // Ancien format : chercher et remplacer les formes avec parenthèses
          const originalWords = correction.original.split(/\s+/)
          const lastWord = originalWords[originalWords.length - 1]

          const escapedPrefix = originalWords.slice(0, -1).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')
          const escapedLastWord = lastWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

          const pattern = new RegExp(
            `${escapedPrefix}${escapedPrefix ? '\\s+' : ''}${escapedLastWord}e*\\s*\\(ou\\s+[^)]+\\)`,
            'g'
          )

          const newText = block.corrected.replace(pattern, correction.original)
          if (newText !== block.corrected) {
            block.corrected = newText
            console.log(`[removeDoubtCorrections] Nettoyé ancien format dans bloc #${block.index}`)
          }
        })
      }
    }
  })
}

/**
 * Nettoie les objets correction.corrected pour les corrections de doute
 * @param {Array} blocks - Liste des blocs
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
          // Si ancien format avec parenthèses, enlever les parenthèses
          else if (correction.corrected.includes('(ou ')) {
            correction.corrected = correction.original
            console.log(`[cleanDoubtObjects] Nettoyé correction de doute dans bloc #${block.index}`)
          }
        }
      })
    }
  })
}

/**
 * Valide automatiquement toutes les corrections de doute (genre)
 * @param {Object} AppState - État de l'application
 */
function autoValidateDoubtCorrections(AppState) {
  AppState.blocks.forEach(block => {
    if (block.corrections && block.corrections.length > 0) {
      block.corrections.forEach((correction, corrIndex) => {
        if (correction.type === 'doubt') {
          const correctionId = `${block.index}-${corrIndex}`
          AppState.validatedCorrections.add(correctionId)
        }
      })
    }
  })
  console.log('[Doubt] Corrections de genre auto-validées:', AppState.validatedCorrections.size)
}

/**
 * Envoie le contenu au Cloudflare Worker
 * @param {string} content - Contenu du fichier SRT
 * @param {string} filename - Nom du fichier
 * @returns {Promise} - Promise résolvant avec les blocs corrigés
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
 * Gère la sélection de fichier
 * @param {Event} event - Événement de sélection de fichier
 * @param {Object} DOM - Références DOM
 * @param {Object} SRTParser - Parser SRT
 */
export function handleFileSelection(event, DOM, SRTParser, resetFileInput) {
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
 * @param {Event} event - Événement de soumission
 * @param {Object} DOM - Références DOM
 * @param {Function} processUploadedFile - Fonction de traitement
 */
export function handleFormSubmit(event, DOM, processUploadedFile) {
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
 * @param {string} content - Contenu du fichier
 * @param {string} filename - Nom du fichier
 * @param {Object} DOM - Références DOM
 * @param {Object} AppState - État de l'application
 * @param {Object} SRTParser - Parser SRT
 * @param {Function} showEditor - Fonction d'affichage de l'éditeur
 */
export async function processUploadedFile(content, filename, DOM, AppState, SRTParser, showEditor) {
  // Valider le contenu
  const validation = SRTParser.validate(content)

  if (!validation.valid) {
    alert(`Fichier invalide : ${validation.error}`)
    return
  }

  setOriginalFilename(filename)

  // Afficher la section de chargement
  showSectionUI('loading', DOM)

  // Estimer le temps de traitement
  const fileSizeKB = new Blob([content]).size / 1024
  const baseTimeMs = 30000
  const msPerKB = 280
  const maxTimeMs = 100000
  const estimatedTimeMs = Math.min(maxTimeMs, baseTimeMs + (fileSizeKB * msPerKB))

  // Progression fictive fluide jusqu'à 80%
  let currentProgress = 0
  const targetProgress = 80
  const updateInterval = 100
  const progressIncrement = (targetProgress / estimatedTimeMs) * updateInterval

  updateProgressUI(0, 'Veuillez patienter pendant l\'analyse...', DOM)

  const progressInterval = setInterval(() => {
    currentProgress += progressIncrement
    if (currentProgress >= targetProgress) {
      currentProgress = targetProgress
      clearInterval(progressInterval)
    }
    updateProgressUI(Math.round(currentProgress), 'Veuillez patienter pendant l\'analyse...', DOM)
  }, updateInterval)

  try {
    // Envoyer au Worker Cloudflare
    const correctedBlocks = await sendToWorker(content, filename)

    // Arrêter la progression fictive
    clearInterval(progressInterval)

    // Transformer les apostrophes
    convertStraightApostrophesToCurly(correctedBlocks)

    // Nettoyer les corrections fantômes
    cleanPhantomCorrections(correctedBlocks)

    // Retirer les corrections de genre du texte
    removeDoubtCorrectionsFromText(correctedBlocks)

    // Nettoyer les objets correction.corrected pour les corrections de doute
    cleanDoubtCorrectionsObjects(correctedBlocks)

    // Sauvegarder les blocs
    setBlocks(correctedBlocks)

    // Valider automatiquement toutes les corrections de genre (doute)
    autoValidateDoubtCorrections(AppState)

    // Sauvegarder la suggestion originale de Claude pour chaque bloc
    AppState.blocks.forEach(block => {
      if (!block.hasOwnProperty('originalCorrected')) {
        block.originalCorrected = block.corrected
      }
      if (!block.hasOwnProperty('hadOriginalCorrections')) {
        block.hadOriginalCorrections = block.corrections && block.corrections.length > 0
      }
    })

    // Progression finale de 80% à 100%
    const finalProgressDuration = 4000
    const finalProgressSteps = 20
    const finalProgressIncrement = 20 / finalProgressSteps
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

      let message = messages[0].text
      for (const msg of messages) {
        if (roundedProgress >= msg.threshold) {
          message = msg.text
        }
      }

      updateProgressUI(roundedProgress, message, DOM)
      await new Promise(resolve => setTimeout(resolve, finalProgressInterval))
    }

    updateProgressUI(100, 'Terminé !', DOM)

    setTimeout(() => {
      showEditor()
    }, 300)

  } catch (error) {
    console.error('Erreur lors du traitement:', error)
    clearInterval(progressInterval)
    alert(`Erreur : ${error.message}`)
    showSectionUI('upload', DOM)
  }
}

/**
 * Affiche l'éditeur avec les résultats
 * @param {Object} DOM - Références DOM
 * @param {Object} AppState - État de l'application
 * @param {Object} SRTParser - Parser SRT
 * @param {Function} updateStats - Fonction de mise à jour des stats
 * @param {Function} renderBlocksTable - Fonction de rendu du tableau
 * @param {Function} renderMinimap - Fonction de rendu de la minimap
 * @param {Function} updateMinimapCurrentPosition - Fonction de mise à jour de la position minimap
 * @param {Function} onScrollThrottled - Handler de scroll throttled
 * @param {Function} onResizeThrottled - Handler de resize throttled
 */
export function showEditor(DOM, AppState, SRTParser, updateStats, renderBlocksTable, renderMinimap, updateMinimapCurrentPosition, onScrollThrottled, onResizeThrottled) {
  showSectionUI('editor', DOM)

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
  window.removeEventListener('scroll', onScrollThrottled)
  window.addEventListener('scroll', onScrollThrottled)

  // Écouter le resize pour recalculer la minimap
  window.removeEventListener('resize', onResizeThrottled)
  window.addEventListener('resize', onResizeThrottled)
}

/**
 * Réinitialise l'input de fichier
 * @param {Object} DOM - Références DOM
 */
export function resetFileInput(DOM) {
  if (DOM.fileInput) {
    DOM.fileInput.value = ''
  }
  if (DOM.fileInfo) {
    DOM.fileInfo.style.display = 'none'
  }
}
