/**
 * BlocksTable - Rendu du tableau principal des blocs
 */

import { enableInlineEdit } from '../actions/inlineEdit.js'

/**
 * Affiche le tableau des blocs (texte + validations)
 * @param {Object} DOM - Références DOM
 * @param {Object} AppState - État de l'application
 * @param {Object} SRTParser - Parser SRT (global)
 * @param {Object} actions - Fonctions callback pour les actions utilisateur
 */
export function renderBlocksTable(DOM, AppState, SRTParser, actions) {
  DOM.blocksTableBody.innerHTML = ''

  // Filtrer les blocs selon le filtre actif
  let blocksToDisplay = AppState.blocks

  if (AppState.activeFilter) {
    blocksToDisplay = AppState.blocks.filter(block => {
      if (!block.corrections || block.corrections.length === 0) {
        return false
      }
      return block.corrections.some(c => c.type === AppState.activeFilter)
    })
  }

  blocksToDisplay.forEach(block => {
    // Protection : S'assurer que les propriétés essentielles existent
    // Vérifier block.original
    if (!block.original) {
      if (block.text) {
        console.warn(`[renderBlocksTable] Block #${block.index} has no 'original', using 'text'`)
        block.original = block.text
      } else if (block.corrected) {
        console.warn(`[renderBlocksTable] Block #${block.index} has no 'original', using 'corrected'`)
        block.original = block.corrected
      } else {
        console.error(`[renderBlocksTable] Block #${block.index} has no text property at all`, block)
        block.original = ''
      }
    }

    // Vérifier block.corrected
    if (!block.corrected) {
      console.warn(`[renderBlocksTable] Block #${block.index} has no 'corrected', using 'original'`)
      block.corrected = block.original || block.text || ''
    }

    // Vérifier si toutes les corrections sont validées
    const allValidated = block.corrections && block.corrections.length > 0 &&
      block.corrections.every((c, idx) => AppState.validatedCorrections.has(`${block.index}-${idx}`))

    // Déterminer le type de correction dominant pour la classe CSS
    let rowClass = 'row-no-correction'
    if (block.corrections && block.corrections.length > 0 && !allValidated) {
      const hasUnvalidatedFault = block.corrections.some((c, idx) =>
        c.type === 'fault' && !AppState.validatedCorrections.has(`${block.index}-${idx}`)
      )
      const hasUnvalidatedDoubt = block.corrections.some((c, idx) =>
        c.type === 'doubt' && !AppState.validatedCorrections.has(`${block.index}-${idx}`)
      )

      if (hasUnvalidatedFault) {
        rowClass = 'row-has-fault'
      } else if (hasUnvalidatedDoubt) {
        rowClass = 'row-has-doubt'
      }
    }

    // === LIGNE DE HEADER ===
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
    const hasCorrections = block.corrections && block.corrections.length > 0

    const hasValidatedCorrections = hasCorrections && block.corrections.some((correction, idx) =>
      AppState.validatedCorrections.has(`${block.index}-${idx}`)
    )

    const unvalidatedCorrectionsCount = hasCorrections
      ? block.corrections.filter((c, idx) => !AppState.validatedCorrections.has(`${block.index}-${idx}`)).length
      : 0

    // Container pour les boutons
    const buttonsHtml = []

    if (unvalidatedCorrectionsCount >= 2) {
      buttonsHtml.push(`<button class="btn-header-validate-all" data-block-index="${block.index}" title="Valider toutes les corrections de ce bloc"><span>✓</span><span>tout</span></button>`)
    }

    if (hasValidatedCorrections) {
      buttonsHtml.push(`<button class="btn-header-reset" data-block-index="${block.index}" title="Réinitialiser ce bloc">⟲</button>`)
    }

    if (buttonsHtml.length > 0) {
      headerCellRight.innerHTML = `<div class="block-header-buttons">${buttonsHtml.join('')}</div>`

      setTimeout(() => {
        const validateAllBtn = headerCellRight.querySelector('.btn-header-validate-all')
        if (validateAllBtn && actions.validateAllBlockCorrections) {
          validateAllBtn.onclick = () => actions.validateAllBlockCorrections(block.index)
        }

        const resetBtn = headerCellRight.querySelector('.btn-header-reset')
        if (resetBtn && actions.resetBlockToInitialState) {
          resetBtn.onclick = () => actions.resetBlockToInitialState(block.index)
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

    const shouldBeBold = hasNoCorrections || allValidated
    const correctedEl = document.createElement('div')
    correctedEl.className = `block-section block-corrected ${shouldBeBold ? 'block-validated' : 'block-unvalidated'}`

    const finalCorrectedText = block.corrected || block.original

    correctedEl.innerHTML = `
      <div class="block-label">CORRIGÉ :</div>
      <div class="block-content" data-editable="true">${SRTParser.escapeHtml(finalCorrectedText)}</div>
    `

    // Ajouter l'édition inline au clic sur le texte corrigé
    setTimeout(() => {
      const contentEl = correctedEl.querySelector('.block-content')
      if (contentEl) {
        contentEl.addEventListener('click', () => {
          // Vérifier si toutes les corrections sont validées avant d'autoriser l'édition
          if (block.corrections && block.corrections.length > 0) {
            const allValidated = block.corrections.every((_, idx) => {
              const correctionId = `${block.index}-${idx}`
              return AppState.validatedCorrections.has(correctionId)
            })

            if (!allValidated) {
              // Afficher une alerte si des corrections ne sont pas validées
              window.customAlert('Validez d\'abord toutes les corrections de ce bloc avant de l\'éditer.')
              return
            }
          }

          // Autoriser l'édition si toutes les corrections sont validées (ou aucune correction)
          enableInlineEdit(contentEl, block.index, (blockIndex, newText) => {
            // Callback de sauvegarde - utiliser l'action editBlockText
            if (actions.editBlockText) {
              actions.editBlockText(blockIndex, newText)
            }
          })
        })

        // Ajouter une indication visuelle au survol
        contentEl.style.cursor = 'text'
        contentEl.title = 'Cliquer pour éditer'
      }
    }, 0)

    textCell.appendChild(originalEl)
    textCell.appendChild(correctedEl)

    // === COLONNE DROITE : Validations ===
    const validationCell = document.createElement('td')
    validationCell.className = 'cell-validation'

    let visibleCorrections = 0
    if (block.corrections && block.corrections.length > 0) {
      visibleCorrections = block.corrections.length
    }

    if (visibleCorrections === 0) {
      const emptyDiv = document.createElement('div')
      emptyDiv.className = 'validation-empty'
      emptyDiv.innerHTML = `
        <span class="validation-empty-icon">✓</span>
        <span class="validation-empty-text">Aucune correction</span>
      `
      validationCell.appendChild(emptyDiv)
    } else {
      const allCorrectionsValidated = block.corrections.every((c, idx) =>
        AppState.validatedCorrections.has(`${block.index}-${idx}`)
      )

      block.corrections.forEach((correction, corrIndex) => {
        const correctionId = `${block.index}-${corrIndex}`
        const isValidated = AppState.validatedCorrections.has(correctionId)

        const cardEl = document.createElement('div')
        cardEl.className = `validation-card validation-${correction.type}`
        cardEl.id = `validation-${correctionId}`

        if (isValidated) {
          cardEl.classList.add('validated')
        }

        const displayText = correction.type === 'doubt' && correction.alternative && !correction.isManuallyEdited
          ? correction.alternative
          : correction.corrected

        // Déterminer le badge à afficher
        // Si c'est un doute (rejeté ou genre), toujours afficher "DOUTE"
        const badgeText = correction.type === 'doubt'
          ? 'DOUTE'
          : (correction.isManuallyEdited ? 'MODIFIÉ' : 'FAUTE')

        // Cas spécial : bloc sans correction initiale modifié
        if (correction.wasNoCorrection) {
          cardEl.innerHTML = `
            <div class="validation-header">
              <span class="validation-type-badge badge-${correction.type}">
                ${badgeText}
              </span>
            </div>
            <div class="validation-correction">
              <div class="validation-correction-reason">${SRTParser.escapeHtml(correction.reason)}</div>
            </div>
          `
        } else {
          // Affichage normal avec texte original → corrigé
          cardEl.innerHTML = `
            <div class="validation-header">
              <span class="validation-type-badge badge-${correction.type}">
                ${badgeText}
              </span>
            </div>
            <div class="validation-correction">
              <div class="validation-correction-text">
                <span class="original">${SRTParser.escapeHtml(correction.original)}</span>
                →
                <span class="corrected">${SRTParser.escapeHtml(displayText)}</span>
              </div>
              <div class="validation-correction-reason">${SRTParser.escapeHtml(correction.reason)}</div>
            </div>
          `
        }

        const actionsEl = document.createElement('div')
        actionsEl.className = 'validation-actions'

        // PRIORITÉ 1 : Corrections modifiées manuellement
        if (correction.isManuallyEdited) {
          const resetBtn = document.createElement('button')
          resetBtn.className = 'btn-icon-only'
          resetBtn.innerHTML = '↺'
          resetBtn.title = 'Réinitialiser (revenir à la suggestion de Claude)'
          if (actions.resetToOriginalSuggestion) {
            resetBtn.onclick = () => actions.resetToOriginalSuggestion(block.index, corrIndex)
          }
          actionsEl.appendChild(resetBtn)
        }
        // PRIORITÉ 2 : Doutes de GENRE
        else if (correction.type === 'doubt' && correction.alternative) {
          const isGenderSwitched = AppState.genderSwitched.has(correctionId)

          const toggleBtn = document.createElement('button')
          toggleBtn.className = isGenderSwitched ? 'btn-toggle-gender btn-gender-changed' : 'btn-toggle-gender'
          toggleBtn.innerHTML = isGenderSwitched ? '⟲ Revenir' : '⇄ Genre'
          toggleBtn.title = isGenderSwitched ? 'Revenir au genre d\'origine' : 'Changer le genre'
          if (actions.toggleGender) {
            toggleBtn.onclick = () => actions.toggleGender(block.index, corrIndex)
          }
          actionsEl.appendChild(toggleBtn)
        }
        // PRIORITÉ 3 : Corrections normales non validées
        else if (!isValidated) {
          const validateBtn = document.createElement('button')
          validateBtn.className = 'btn-icon-only btn-icon-validate'
          validateBtn.innerHTML = '✓'
          validateBtn.title = 'Valider'
          if (actions.validateSingleCorrection) {
            validateBtn.onclick = () => actions.validateSingleCorrection(block.index, corrIndex)
          }

          const rejectBtn = document.createElement('button')
          rejectBtn.className = 'btn-icon-only btn-icon-reject'
          rejectBtn.innerHTML = '✕'
          rejectBtn.title = 'Rejeter'
          if (actions.rejectCorrection) {
            rejectBtn.onclick = () => actions.rejectCorrection(block.index, corrIndex)
          }

          actionsEl.appendChild(validateBtn)
          actionsEl.appendChild(rejectBtn)
        }

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
