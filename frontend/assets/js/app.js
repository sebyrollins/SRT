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

// Imports des modules de traitement
import {
  handleFileSelection as handleFileSelectionModule,
  handleFormSubmit as handleFormSubmitModule,
  processUploadedFile as processUploadedFileModule,
  showEditor as showEditorModule,
  resetFileInput as resetFileInputModule
} from './processing/upload.js'
import {
  downloadSRT as downloadSRTModule,
  downloadTXT as downloadTXTModule
} from './export/download.js'
import {
  resetToInitialState as resetToInitialStateModule,
  resetApp as resetAppModule
} from './processing/stateReset.js'

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
  handleFileSelectionModule(event, DOM, SRTParser, resetFileInput)
}

/**
 * Gestion de la soumission du formulaire (wrapper pour le module processing)
 */
function handleFormSubmit(event) {
  handleFormSubmitModule(event, DOM, processUploadedFile)
}

/**
 * Traite un fichier uploadé (wrapper pour le module processing)
 */
async function processUploadedFile(content, filename) {
  await processUploadedFileModule(content, filename, AppState, SRTParser, showEditor)
}


/**
 * Affiche l'éditeur avec les résultats (wrapper pour le module processing)
 */
function showEditor() {
  showEditorModule(DOM, AppState, SRTParser, updateStats, renderBlocksTable, renderMinimap, updateMinimapCurrentPosition, onScrollThrottled, onResizeThrottled)
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
  resetToInitialStateModule(AppState, SRTParser, updateStats, renderBlocksTable, updateMinimap)
}

/**
 * Télécharge le fichier SRT (wrapper pour le module export)
 */
function downloadSRT() {
  downloadSRTModule(AppState, SRTParser)
}

/**
 * Télécharge le fichier TXT (wrapper pour le module export)
 */
function downloadTXT() {
  downloadTXTModule(AppState, SRTParser)
}

/**
 * Réinitialise l'application (wrapper pour le module processing)
 */
function resetApp() {
  resetAppModule(DOM, resetFileInput)
}

/**
 * Réinitialise l'input de fichier (wrapper pour le module processing)
 */
function resetFileInput() {
  resetFileInputModule(DOM)
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
