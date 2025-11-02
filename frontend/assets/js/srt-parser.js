/**
 * SRT Parser & Export Module
 * Gestion du parsing et de l'export des fichiers SRT
 */

const SRTParser = {

  /**
   * Parse un contenu SRT en tableau de blocs
   * @param {string} content - Contenu brut du SRT
   * @returns {Array} Tableau de blocs SRT
   */
  parse(content) {
    const blocks = []
    const lines = content.split('\n')

    let currentBlock = { index: null, timecode: null, text: [] }
    let lineIndex = 0

    while (lineIndex < lines.length) {
      const line = lines[lineIndex].trim()

      // Ligne vide = fin de bloc
      if (line === '') {
        if (currentBlock.index !== null && currentBlock.text.length > 0) {
          blocks.push({
            index: currentBlock.index,
            timecode: currentBlock.timecode,
            text: currentBlock.text.join('\n').trim()
          })
          currentBlock = { index: null, timecode: null, text: [] }
        }
        lineIndex++
        continue
      }

      // Détection de l'index (nombre seul)
      if (/^\d+$/.test(line) && currentBlock.index === null) {
        currentBlock.index = parseInt(line)
        lineIndex++
        continue
      }

      // Détection du timecode (format SRT standard)
      if (/^\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}$/.test(line)) {
        currentBlock.timecode = line
        lineIndex++
        continue
      }

      // Texte du sous-titre
      if (currentBlock.index !== null && currentBlock.timecode !== null) {
        currentBlock.text.push(line)
      }

      lineIndex++
    }

    // Ajouter le dernier bloc si nécessaire
    if (currentBlock.index !== null && currentBlock.text.length > 0) {
      blocks.push({
        index: currentBlock.index,
        timecode: currentBlock.timecode,
        text: currentBlock.text.join('\n').trim()
      })
    }

    return blocks
  },

  /**
   * Génère un contenu SRT à partir de blocs corrigés
   * @param {Array} blocks - Tableau de blocs corrigés
   * @returns {string} Contenu SRT formaté
   */
  generate(blocks) {
    return blocks.map(block => {
      return `${block.index}\n${block.timecode}\n${block.corrected}\n`
    }).join('\n')
  },

  /**
   * Génère un fichier TXT (texte brut sans timecodes)
   * @param {Array} blocks - Tableau de blocs corrigés
   * @returns {string} Texte brut
   */
  generateTXT(blocks) {
    return blocks.map(block => block.corrected).join('\n\n')
  },

  /**
   * Applique les corrections à un texte avec surlignage HTML
   * @param {string} text - Texte original
   * @param {Array} corrections - Tableau de corrections
   * @returns {string} HTML avec corrections surlignées
   */
  applyCorrectionsWithHighlight(text, corrections) {
    if (!corrections || corrections.length === 0) {
      return this.escapeHtml(text)
    }

    // Trier les corrections par position (du plus petit au plus grand)
    const sortedCorrections = [...corrections].sort((a, b) => a.position - b.position)

    // Construire le résultat en une seule passe pour éviter le double échappement
    let result = ''
    let lastIndex = 0

    sortedCorrections.forEach(correction => {
      const { original, corrected, type, position } = correction
      const startPos = position
      const endPos = startPos + original.length

      if (startPos >= lastIndex && endPos <= text.length) {
        // Ajouter le texte avant la correction (échappé)
        result += this.escapeHtml(text.substring(lastIndex, startPos))

        // Ajouter la correction surlignée
        result += `<span class="correction correction-${type}" data-original="${this.escapeHtml(original)}" data-corrected="${this.escapeHtml(corrected)}">${this.escapeHtml(corrected)}</span>`

        // Mettre à jour la position
        lastIndex = endPos
      }
    })

    // Ajouter le reste du texte après la dernière correction (échappé)
    result += this.escapeHtml(text.substring(lastIndex))

    return result
  },

  /**
   * Surligne les erreurs dans le texte ORIGINAL sans les remplacer
   * @param {string} text - Texte original
   * @param {Array} corrections - Tableau de corrections
   * @returns {string} HTML avec erreurs surlignées (texte original intact)
   */
  highlightOriginalErrors(text, corrections) {
    if (!corrections || corrections.length === 0) {
      return this.escapeHtml(text)
    }

    // Trier les corrections par position (du plus petit au plus grand)
    const sortedCorrections = [...corrections].sort((a, b) => a.position - b.position)

    // Construire le résultat en une seule passe pour éviter le double échappement
    let result = ''
    let lastIndex = 0

    sortedCorrections.forEach(correction => {
      const { original, type, position } = correction
      const startPos = position
      const endPos = startPos + original.length

      if (startPos >= lastIndex && endPos <= text.length) {
        // Ajouter le texte avant l'erreur (échappé)
        result += this.escapeHtml(text.substring(lastIndex, startPos))

        // Ajouter l'erreur surlignée (texte échappé dans un span)
        const errorText = text.substring(startPos, endPos)
        result += `<span class="error-highlight error-highlight-${type}">${this.escapeHtml(errorText)}</span>`

        // Mettre à jour la position
        lastIndex = endPos
      }
    })

    // Ajouter le reste du texte après la dernière erreur (échappé)
    result += this.escapeHtml(text.substring(lastIndex))

    return result
  },

  /**
   * Échappe les caractères HTML
   * @param {string} text - Texte à échapper
   * @returns {string} Texte échappé
   */
  escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }
    return text.replace(/[&<>"']/g, m => map[m])
  },

  /**
   * Télécharge un fichier
   * @param {string} content - Contenu du fichier
   * @param {string} filename - Nom du fichier
   * @param {string} mimeType - Type MIME
   */
  downloadFile(content, filename, mimeType = 'text/plain') {
    // Ajouter UTF-8 BOM pour compatibilité TextEdit (Mac)
    const BOM = '\uFEFF'
    const contentWithBOM = BOM + content

    // Créer le Blob avec charset UTF-8 explicite
    const blob = new Blob([contentWithBOM], {
      type: `${mimeType};charset=utf-8`
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = filename
    link.style.display = 'none'

    document.body.appendChild(link)
    link.click()

    // Nettoyer
    setTimeout(() => {
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    }, 100)
  },

  /**
   * Génère un nom de fichier avec suffixe
   * @param {string} originalFilename - Nom original
   * @param {string} suffix - Suffixe à ajouter
   * @param {string} extension - Extension (optionnel, garde l'originale si non fourni)
   * @returns {string} Nouveau nom de fichier
   */
  generateFilename(originalFilename, suffix = '_SR', extension = null) {
    const parts = originalFilename.split('.')
    const ext = extension || parts.pop()
    const basename = parts.join('.')

    return `${basename}${suffix}.${ext}`
  },

  /**
   * Valide le format d'un fichier SRT
   * @param {string} content - Contenu à valider
   * @returns {Object} { valid: boolean, error: string|null }
   */
  validate(content) {
    if (!content || content.trim() === '') {
      return { valid: false, error: 'Le fichier est vide' }
    }

    const blocks = this.parse(content)

    if (blocks.length === 0) {
      return { valid: false, error: 'Aucun bloc de sous-titre détecté' }
    }

    // Vérifier que chaque bloc a un index, timecode et texte
    for (const block of blocks) {
      if (block.index === null || block.timecode === null || !block.text) {
        return { valid: false, error: `Bloc ${block.index || '?'} invalide` }
      }
    }

    return { valid: true, error: null }
  },

  /**
   * Calcule les statistiques des corrections
   * @param {Array} blocks - Tableau de blocs avec corrections
   * @returns {Object} Statistiques
   */
  calculateStats(blocks) {
    let total = 0
    let minor = 0
    let major = 0
    let doubt = 0

    blocks.forEach(block => {
      if (block.corrections && block.corrections.length > 0) {
        block.corrections.forEach(correction => {
          total++
          if (correction.type === 'minor') minor++
          else if (correction.type === 'major') major++
          else if (correction.type === 'doubt') doubt++
        })
      }
    })

    return { total, minor, major, doubt }
  },

  /**
   * Formate la taille d'un fichier en format lisible
   * @param {number} bytes - Taille en bytes
   * @returns {string} Taille formatée
   */
  formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' Ko'
    return (bytes / (1024 * 1024)).toFixed(1) + ' Mo'
  }
}

// Exporter pour utilisation dans d'autres modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SRTParser
}
