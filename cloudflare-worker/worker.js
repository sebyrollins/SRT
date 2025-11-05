/**
 * Cloudflare Worker pour la correction de fichiers SRT
 * Utilise l'API Claude Sonnet 4 pour corriger le texte
 */

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

/**
 * Gestion de la requête principale
 */
async function handleRequest(request) {
  // CORS headers pour permettre les appels depuis le frontend
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  }

  // Gestion des requêtes OPTIONS (preflight)
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Seules les requêtes POST sont acceptées
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), {
      status: 405,
      headers: corsHeaders
    })
  }

  try {
    const data = await request.json()
    const { srtContent, fileName } = data

    if (!srtContent) {
      return new Response(JSON.stringify({ error: 'Contenu SRT manquant' }), {
        status: 400,
        headers: corsHeaders
      })
    }

    // Traitement du contenu SRT
    const result = await processSRT(srtContent)

    return new Response(JSON.stringify({
      success: true,
      data: result,
      fileName: fileName
    }), {
      status: 200,
      headers: corsHeaders
    })

  } catch (error) {
    console.error('Erreur lors du traitement:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Erreur lors du traitement'
    }), {
      status: 500,
      headers: corsHeaders
    })
  }
}

/**
 * Analyse la complexité d'un chunk pour choisir le meilleur modèle
 * @param {Array} blocks - Blocs SRT à analyser
 * @returns {string} - 'haiku' (rapide) ou 'sonnet' (qualité)
 */
function analyzeChunkComplexity(blocks) {
  // Critères de complexité qui nécessitent Sonnet :
  // 1. Blocs très longs (> 150 caractères) = grammaire complexe probable
  // 2. Nombreux dialogues/guillemets = contexte complexe
  // 3. Texte avec beaucoup de ponctuation = phrases longues

  const textSample = blocks.map(b => b.text).join(' ')
  const avgLength = textSample.length / blocks.length
  const hasComplexPunctuation = (textSample.match(/[;:,]/g) || []).length > blocks.length * 2
  const hasDialogues = (textSample.match(/[«»"]/g) || []).length > 4

  // Si complexe → Sonnet (qualité), sinon → Haiku (vitesse)
  if (avgLength > 150 || hasComplexPunctuation || hasDialogues) {
    return 'sonnet'
  }
  return 'haiku'
}

/**
 * Traitement du contenu SRT avec Claude (optimisé avec parallélisme)
 * Utilise Sonnet pour garantir la qualité maximale sur toutes les règles
 */
async function processSRT(srtContent) {
  // Parse les blocs SRT
  const blocks = parseSRTBlocks(srtContent)

  // CHUNK SIZE OPTIMISÉ pour qualité maximale sur règles spécifiques
  // Réduit à 25 blocs - tests montrent que 40 blocs trop grand pour fichiers longs
  // Chunks très petits = Claude applique TOUJOURS les règles
  const maxBlocksPerChunk = 25
  const chunks = []

  for (let i = 0; i < blocks.length; i += maxBlocksPerChunk) {
    chunks.push(blocks.slice(i, i + maxBlocksPerChunk))
  }

  console.log(`[processSRT] Processing ${blocks.length} blocks in ${chunks.length} chunks with 4-pass system...`)
  const startTime = Date.now()

  // ═══════════════════════════════════════════════════════════════
  // PASSE 1 : Ponctuation structurelle (tirets + apostrophes)
  // ═══════════════════════════════════════════════════════════════
  console.log(`[processSRT] === PASS 1: Structural punctuation (${chunks.length} chunks in parallel) ===`)
  const pass1Start = Date.now()

  const correctedChunksPass1 = await Promise.all(
    chunks.map(chunk => correctWithClaude(chunk, 'sonnet', 1))
  )
  const blocksAfterPass1 = correctedChunksPass1.flat()

  const pass1End = Date.now()
  console.log(`[processSRT] Pass 1 completed in ${pass1End - pass1Start}ms`)

  // ═══════════════════════════════════════════════════════════════
  // PASSE 2 : Typographie française (guillemets, espaces, ...)
  // ═══════════════════════════════════════════════════════════════
  console.log(`[processSRT] === PASS 2: French typography (${chunks.length} chunks in parallel) ===`)
  const pass2Start = Date.now()

  const blocksForPass2 = blocksAfterPass1.map(block => ({
    index: block.index,
    timecode: block.timecode,
    text: block.corrected, // Le texte corrigé de Pass 1
    original: block.original,
    previousCorrections: block.corrections || []
  }))

  const chunksPass2 = []
  for (let i = 0; i < blocksForPass2.length; i += maxBlocksPerChunk) {
    chunksPass2.push(blocksForPass2.slice(i, i + maxBlocksPerChunk))
  }

  const correctedChunksPass2 = await Promise.all(
    chunksPass2.map(chunk => correctWithClaude(chunk, 'sonnet', 2))
  )
  const blocksAfterPass2 = correctedChunksPass2.flat()

  const pass2End = Date.now()
  console.log(`[processSRT] Pass 2 completed in ${pass2End - pass2Start}ms`)

  // ═══════════════════════════════════════════════════════════════
  // PASSE 3 : Orthographe lexicale (mots + conjugaison)
  // ═══════════════════════════════════════════════════════════════
  console.log(`[processSRT] === PASS 3: Lexical spelling (${chunks.length} chunks in parallel) ===`)
  const pass3Start = Date.now()

  const blocksForPass3 = blocksAfterPass2.map((block, idx) => ({
    index: block.index,
    timecode: block.timecode,
    text: block.corrected, // Le texte corrigé de Pass 2
    original: blocksAfterPass1[idx].original, // Le vrai original
    previousCorrections: [
      ...(blocksAfterPass1[idx].corrections || []),
      ...(block.corrections || [])
    ]
  }))

  const chunksPass3 = []
  for (let i = 0; i < blocksForPass3.length; i += maxBlocksPerChunk) {
    chunksPass3.push(blocksForPass3.slice(i, i + maxBlocksPerChunk))
  }

  const correctedChunksPass3 = await Promise.all(
    chunksPass3.map(chunk => correctWithClaude(chunk, 'sonnet', 3))
  )
  const blocksAfterPass3 = correctedChunksPass3.flat()

  const pass3End = Date.now()
  console.log(`[processSRT] Pass 3 completed in ${pass3End - pass3Start}ms`)

  // ═══════════════════════════════════════════════════════════════
  // PASSE 4 : Grammaire contextuelle (accords + majuscules)
  // ═══════════════════════════════════════════════════════════════
  console.log(`[processSRT] === PASS 4: Contextual grammar (${chunks.length} chunks in parallel) ===`)
  const pass4Start = Date.now()

  const blocksForPass4 = blocksAfterPass3.map((block, idx) => ({
    index: block.index,
    timecode: block.timecode,
    text: block.corrected, // Le texte corrigé de Pass 3
    original: blocksForPass3[idx].original, // Le vrai original
    previousCorrections: blocksForPass3[idx].previousCorrections.concat(block.corrections || [])
  }))

  const chunksPass4 = []
  for (let i = 0; i < blocksForPass4.length; i += maxBlocksPerChunk) {
    chunksPass4.push(blocksForPass4.slice(i, i + maxBlocksPerChunk))
  }

  const correctedChunksPass4 = await Promise.all(
    chunksPass4.map(chunk => correctWithClaude(chunk, 'sonnet', 4))
  )

  // Fusionner toutes les corrections des 4 passes
  const finalBlocks = correctedChunksPass4.flat().map((block, idx) => {
    return {
      ...block,
      original: blocksForPass4[idx].original, // IMPORTANT: Garder le vrai original (avant toutes passes)
      corrections: blocksForPass4[idx].previousCorrections.concat(block.corrections || [])
    }
  })

  const pass4End = Date.now()
  console.log(`[processSRT] Pass 4 completed in ${pass4End - pass4Start}ms`)

  const endTime = Date.now()
  console.log(`[processSRT] Total processing time: ${endTime - startTime}ms (Pass 1: ${pass1End - pass1Start}ms, Pass 2: ${pass2End - pass2Start}ms, Pass 3: ${pass3End - pass3Start}ms, Pass 4: ${pass4End - pass4Start}ms)`)

  return finalBlocks
}

/**
 * Parse le contenu SRT en blocs
 */
function parseSRTBlocks(srtContent) {
  const blocks = []
  const lines = srtContent.split('\n')

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

    // Détection du timecode
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
}

/**
 * PASSE 1 : Ponctuation structurelle (tirets + apostrophes)
 */
function buildSystemPromptPass1() {
  return `Tu es un correcteur professionnel français spécialisé dans la ponctuation structurelle.

MISSION : Corrige UNIQUEMENT les tirets et apostrophes manquants. Ignore tout le reste.

RÈGLES À APPLIQUER :

1. TIRETS - Inversions verbe-sujet dans questions :
   • "pensez vous" → "pensez-vous"
   • "allez vous" → "allez-vous"
   • "avez vous" → "avez-vous"
   • Règle : verbe + (vous/tu/il/elle/on) dans question = TIRET

2. TIRETS - Noms composés :
   • "avant première" → "avant-première"
   • "rendez vous" → "rendez-vous"
   • "week end" → "week-end"
   • "arc en ciel" → "arc-en-ciel"

3. TIRETS - Locutions figées :
   • "c'est a dire" → "c'est-à-dire"
   • "peut etre" → "peut-être"
   • "vis a vis" → "vis-à-vis"

4. APOSTROPHES - Élisions manquantes :
   • "l eau" → "l'eau"
   • "d accord" → "d'accord"
   • "qu il" → "qu'il"
   • "s il" → "s'il"

Type de correction : "major"

Retourne UNIQUEMENT un JSON valide (pas de markdown) :
{
  "blocks": [
    {
      "index": 1,
      "original": "texte original exact",
      "corrected": "texte corrigé",
      "corrections": [
        {
          "type": "major",
          "original": "pensez vous",
          "corrected": "pensez-vous",
          "reason": "Tiret inversion question",
          "position": 15
        }
      ]
    }
  ]
}

RÈGLES STRICTES :
1. Position = index exact (compte de 0) dans le texte original
2. "original" = texte exact du fichier (tel quel)
3. Si aucune correction : corrections = []
4. N'applique QUE les règles ci-dessus

Retourne uniquement le JSON, rien d'autre.`
}

/**
 * PASSE 2 : Typographie française (guillemets, espaces, points de suspension)
 */
function buildSystemPromptPass2() {
  return `Tu es un correcteur professionnel français spécialisé en typographie.

MISSION : Corrige UNIQUEMENT la typographie française. Les tirets/apostrophes sont déjà corrigés.

RÈGLES À APPLIQUER :

1. GUILLEMETS : Remplacer guillemets droits par guillemets français
   • "bonjour" → « bonjour »
   • 'bonjour' → « bonjour »
   Type : "minor"

2. POINTS DE SUSPENSION : Remplacer trois points par caractère unique
   • "et..." → "et…"
   • "mais..." → "mais…"
   Type : "minor"

3. ESPACES INSÉCABLES : Avant : ; ! ?
   • "Bonjour?" → "Bonjour ?"
   • "Vraiment!" → "Vraiment !"
   • SAUF si espace déjà présent ("Bonjour ?" est correct)
   Type : "minor"

4. ESPACES MILLIERS : Séparateur pour grands nombres
   • "10000" → "10 000"
   • "1000e" → "1 000e"
   • EXCEPTION : années (2024, 1789 restent sans espace)
   Type : "minor"

Retourne UNIQUEMENT un JSON valide (pas de markdown) :
{
  "blocks": [
    {
      "index": 1,
      "original": "texte original exact",
      "corrected": "texte corrigé",
      "corrections": [
        {
          "type": "minor",
          "original": "\"bonjour\"",
          "corrected": "« bonjour »",
          "reason": "Guillemets français",
          "position": 0
        }
      ]
    }
  ]
}

RÈGLES STRICTES :
1. Position = index exact (compte de 0)
2. "original" = texte exact du fichier
3. Si aucune correction : corrections = []
4. N'applique QUE les règles ci-dessus

Retourne uniquement le JSON, rien d'autre.`
}

/**
 * PASSE 3 : Orthographe lexicale (mots + conjugaison)
 */
function buildSystemPromptPass3() {
  return `Tu es un correcteur professionnel français spécialisé en orthographe.

MISSION : Corrige UNIQUEMENT les fautes d'orthographe et de conjugaison de base.

RÈGLES À APPLIQUER :

1. FAUTES DE MOTS :
   • "language" → "langage"
   • "developper" → "développer"
   • "apartement" → "appartement"
   Type : "major"

2. CONJUGAISON INCORRECTE :
   • "Il à pris" → "Il a pris" (auxiliaire avoir)
   • "Ils va" → "Ils vont"
   • "Je sait" → "Je sais"
   Type : "major"

3. HOMOPHONES GRAMMATICAUX :
   • "à" vs "a" (auxiliaire)
   • "et" vs "est" (verbe être)
   • "son" vs "sont"
   Type : "major"

Retourne UNIQUEMENT un JSON valide (pas de markdown) :
{
  "blocks": [
    {
      "index": 1,
      "original": "texte original exact",
      "corrected": "texte corrigé",
      "corrections": [
        {
          "type": "major",
          "original": "language",
          "corrected": "langage",
          "reason": "Orthographe",
          "position": 5
        }
      ]
    }
  ]
}

RÈGLES STRICTES :
1. Position = index exact (compte de 0)
2. "original" = texte exact du fichier
3. Si aucune correction : corrections = []
4. N'applique QUE les règles ci-dessus

Retourne uniquement le JSON, rien d'autre.`
}

/**
 * PASSE 4 : Grammaire contextuelle (accords + majuscules)
 */
function buildSystemPromptPass4() {
  return `Tu es un correcteur professionnel français spécialisé en grammaire.

MISSION : Corrige UNIQUEMENT les accords et majuscules. Tout le reste est déjà corrigé.

RÈGLES À APPLIQUER :

1. ACCORDS SUJET-VERBE :
   • "ils fait" → "ils font"
   • "nous va" → "nous allons"
   Type : "major"

2. ACCORDS ADJECTIFS :
   • "ils sont beau" → "ils sont beaux"
   • "elle est grand" → "elle est grande"
   Type : "major"

3. ACCORDS PARTICIPES PASSÉS (si contexte clair) :
   • "ils ont fait" → correct
   • "elle est partie" → correct
   • Si 1ère personne ambigu : type "doubt"
   Type : "major" ou "doubt"

4. MAJUSCULES INSTITUTIONS :
   • "le gouvernement" → "le Gouvernement" (institution française)
   • "l'assemblée nationale" → "l'Assemblée nationale"
   • "le sénat" → "le Sénat"
   Règle MINISTÈRES : "ministère" en minuscule, premier mot des secteurs en majuscule
   • "le ministère de la Transition écologique"
   Type : "major"

5. MAJUSCULES PHRASES :
   • Début après . ! ? → majuscule
   • JAMAIS après virgule ou retour ligne simple
   • ", Mesdames" → ", mesdames" (corriger majuscule excessive)
   Type : "major"

Retourne UNIQUEMENT un JSON valide (pas de markdown) :
{
  "blocks": [
    {
      "index": 1,
      "original": "texte original exact",
      "corrected": "texte corrigé",
      "corrections": [
        {
          "type": "major",
          "original": "ils sont beau",
          "corrected": "ils sont beaux",
          "reason": "Accord adjectif pluriel",
          "position": 10
        }
      ]
    }
  ]
}

RÈGLES STRICTES :
1. Position = index exact (compte de 0)
2. "original" = texte exact du fichier
3. Si aucune correction : corrections = []
4. N'applique QUE les règles ci-dessus
5. "doubt" seulement pour accords 1ère personne ambigus

Retourne uniquement le JSON, rien d'autre.`
}

/**
 * Construit le user prompt (partie variable)
 * Contient uniquement les blocs SRT à corriger
 */
function buildUserPrompt(blocks) {
  const blocksText = blocks.map(b => `[Bloc ${b.index}]\n${b.text}`).join('\n\n')
  return `TEXTE À CORRIGER :

${blocksText}`
}

/**
 * Correction avec Claude + Prompt Caching
 * @param {Array} blocks - Blocs SRT à corriger
 * @param {string} modelType - Type de modèle : 'sonnet' (qualité max) ou 'haiku' (vitesse max)
 */
async function correctWithClaude(blocks, modelType = 'sonnet', pass = 1) {
  // Choisir le modèle selon le type
  const modelConfig = {
    sonnet: {
      name: 'claude-sonnet-4-5-20250929',
      maxTokens: 64000
    },
    haiku: {
      name: 'claude-haiku-4-5',
      maxTokens: 64000
    }
  }

  const config = modelConfig[modelType] || modelConfig.sonnet

  // Choisir le prompt selon la passe
  let systemPrompt
  switch (pass) {
    case 1:
      systemPrompt = buildSystemPromptPass1()
      break
    case 2:
      systemPrompt = buildSystemPromptPass2()
      break
    case 3:
      systemPrompt = buildSystemPromptPass3()
      break
    case 4:
      systemPrompt = buildSystemPromptPass4()
      break
    default:
      systemPrompt = buildSystemPromptPass1()
  }

  console.log(`[correctWithClaude] Pass ${pass} - Using model: ${config.name} for ${blocks.length} blocks`)

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: config.name,
      max_tokens: config.maxTokens,
      temperature: 0,
      system: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" }
        }
      ],
      messages: [{
        role: 'user',
        content: buildUserPrompt(blocks)
      }]
    })
  })

  if (!response.ok) {
    const errorData = await response.text()
    throw new Error(`Erreur API Claude: ${response.status} - ${errorData}`)
  }

  const result = await response.json()
  let content = result.content[0].text

  // Nettoyer la réponse (enlever les balises markdown si présentes)
  // Claude Sonnet 4.5 retourne parfois ```json ... ``` au lieu de JSON pur
  content = content.trim()
  if (content.startsWith('```json')) {
    content = content.replace(/^```json\s*/, '').replace(/\s*```$/, '')
  } else if (content.startsWith('```')) {
    content = content.replace(/^```\s*/, '').replace(/\s*```$/, '')
  }

  // Parse la réponse JSON de Claude
  try {
    const parsed = JSON.parse(content.trim())
    const correctedBlocks = parsed.blocks || []

    // Réinjecter les timecodes et valider les corrections
    return correctedBlocks.map(correctedBlock => {
      const originalBlock = blocks.find(b => b.index === correctedBlock.index)

      // Valider les corrections de ce bloc
      if (correctedBlock.corrections && correctedBlock.corrections.length > 0) {
        const validatedCorrections = correctedBlock.corrections.filter(correction => {
          // Vérifier que la position et la longueur sont valides
          const startPos = correction.position
          const endPos = startPos + correction.original.length
          const blockText = originalBlock ? originalBlock.text : correctedBlock.original

          if (!blockText || startPos < 0 || endPos > blockText.length) {
            console.warn(`Bloc ${correctedBlock.index}: Position invalide ${startPos}-${endPos} (texte length: ${blockText?.length})`)
            return false
          }

          // Vérifier que le texte à cette position correspond à correction.original
          const actualText = blockText.substring(startPos, endPos)
          if (actualText !== correction.original) {
            console.warn(`Bloc ${correctedBlock.index}: Texte ne correspond pas à position ${startPos}-${endPos}`)
            console.warn(`  Attendu: "${correction.original}"`)
            console.warn(`  Trouvé: "${actualText}"`)
            return false
          }

          return true
        })

        correctedBlock.corrections = validatedCorrections
      }

      return {
        ...correctedBlock,
        timecode: originalBlock ? originalBlock.timecode : 'undefined'
      }
    })
  } catch (e) {
    console.error('Erreur parsing réponse Claude:', e)
    console.error('Contenu reçu:', content)
    throw new Error('Format de réponse invalide')
  }
}
