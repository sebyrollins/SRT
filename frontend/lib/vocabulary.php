<?php
/**
 * Gestion des règles de vocabulaire pour la Pass 5
 * Fonctions pour charger, sauvegarder et appliquer les règles de correction
 */

// Configuration
define('VOCABULARY_CONFIG_DIR', __DIR__ . '/../config');
define('VOCABULARY_RULES_FILE', VOCABULARY_CONFIG_DIR . '/vocabulary-rules.json');

/**
 * Charge les règles de vocabulaire depuis le fichier JSON
 * @return array Règles de vocabulaire ou tableau vide si erreur
 */
function loadVocabularyRules() {
    if (!file_exists(VOCABULARY_RULES_FILE)) {
        error_log('[vocabulary] Rules file does not exist, returning empty rules');
        return [
            'version' => '1.0',
            'lastUpdate' => date('c'),
            'rules' => [],
            'categories' => getDefaultCategories()
        ];
    }

    $json = @file_get_contents(VOCABULARY_RULES_FILE);

    if ($json === false) {
        error_log('[vocabulary] Cannot read rules file: ' . VOCABULARY_RULES_FILE);
        return [
            'version' => '1.0',
            'lastUpdate' => date('c'),
            'rules' => [],
            'categories' => getDefaultCategories()
        ];
    }

    $rules = json_decode($json, true);

    if ($rules === null) {
        error_log('[vocabulary] Invalid JSON in rules file: ' . json_last_error_msg());
        return [
            'version' => '1.0',
            'lastUpdate' => date('c'),
            'rules' => [],
            'categories' => getDefaultCategories()
        ];
    }

    // Assurer la compatibilité avec l'ancien format
    if (!isset($rules['categories'])) {
        $rules['categories'] = getDefaultCategories();
    }

    return $rules;
}

/**
 * Sauvegarde les règles de vocabulaire dans le fichier JSON
 * @param array $rulesData Données des règles à sauvegarder
 * @return array Résultat de l'opération ['success' => bool, 'message' => string]
 */
function saveVocabularyRules($rulesData) {
    // Créer le répertoire config si nécessaire
    if (!file_exists(VOCABULARY_CONFIG_DIR)) {
        if (!@mkdir(VOCABULARY_CONFIG_DIR, 0755, true)) {
            return [
                'success' => false,
                'message' => 'Impossible de créer le répertoire de configuration'
            ];
        }
    }

    // Valider les données
    if (!is_array($rulesData)) {
        return [
            'success' => false,
            'message' => 'Format de données invalide'
        ];
    }

    // Assurer la structure minimale
    if (!isset($rulesData['rules']) || !is_array($rulesData['rules'])) {
        return [
            'success' => false,
            'message' => 'Le champ "rules" est requis et doit être un tableau'
        ];
    }

    // Mettre à jour la date de dernière modification
    $rulesData['lastUpdate'] = date('c');
    if (!isset($rulesData['version'])) {
        $rulesData['version'] = '1.0';
    }

    // Convertir en JSON avec un formatage lisible
    $json = json_encode($rulesData, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    if ($json === false) {
        return [
            'success' => false,
            'message' => 'Erreur d\'encodage JSON: ' . json_last_error_msg()
        ];
    }

    // Écrire le fichier
    if (@file_put_contents(VOCABULARY_RULES_FILE, $json) === false) {
        return [
            'success' => false,
            'message' => 'Impossible d\'écrire le fichier de configuration'
        ];
    }

    error_log('[vocabulary] Rules saved successfully (' . count($rulesData['rules']) . ' rules)');

    return [
        'success' => true,
        'message' => 'Règles sauvegardées avec succès',
        'rulesCount' => count($rulesData['rules'])
    ];
}

/**
 * Normalise un texte pour le matching souple
 * @param string $text Texte à normaliser
 * @param array $options Options de normalisation
 * @return string Texte normalisé
 */
function normalizeFuzzy($text, $options = []) {
    $normalized = $text;

    // Ignorer la casse
    if (isset($options['ignoreCase']) && $options['ignoreCase']) {
        $normalized = mb_strtolower($normalized, 'UTF-8');
    }

    // Ignorer les accents
    if (isset($options['ignoreAccents']) && $options['ignoreAccents']) {
        $normalized = remove_accents($normalized);
    }

    // Ignorer les tirets et espaces
    if (isset($options['ignoreHyphens']) && $options['ignoreHyphens']) {
        $normalized = preg_replace('/[-\s]+/', '', $normalized);
    }

    // Ignorer les "s" finaux
    if (isset($options['ignorePlural']) && $options['ignorePlural']) {
        $normalized = preg_replace('/s\b/ui', '', $normalized);
    }

    return $normalized;
}

/**
 * Retire les accents d'une chaîne
 * @param string $str Chaîne avec accents
 * @return string Chaîne sans accents
 */
function remove_accents($str) {
    $str = htmlentities($str, ENT_NOQUOTES, 'UTF-8');
    $str = preg_replace('/&([a-zA-Z])(uml|acute|grave|circ|tilde|cedil);/', '$1', $str);
    return html_entity_decode($str);
}

/**
 * Applique une règle de vocabulaire à un texte
 * @param string $text Texte à corriger
 * @param array $rule Règle à appliquer
 * @return array ['text' => string, 'matched' => bool, 'matches' => array, 'corrections' => array]
 */
function applyVocabularyRule($text, $rule) {
    // Règle désactivée
    if (!$rule['enabled']) {
        return [
            'text' => $text,
            'matched' => false,
            'matches' => [],
            'corrections' => []
        ];
    }

    $corrected = $text;
    $matches = [];
    $corrections = [];

    switch ($rule['type']) {
        case 'exact':
            // Recherche de variantes exactes
            if (isset($rule['variants']) && is_array($rule['variants'])) {
                foreach ($rule['variants'] as $variant) {
                    // Échapper les caractères spéciaux regex
                    $escapedVariant = preg_quote($variant, '/');
                    // Recherche avec limites de mots pour éviter les faux positifs
                    $pattern = '/\b' . $escapedVariant . '\b/u';

                    if (preg_match($pattern, $corrected)) {
                        $count = preg_match_all($pattern, $corrected, $matchesArray);

                        if ($count > 0) {
                            $matches[] = [
                                'variant' => $variant,
                                'count' => $count
                            ];

                            // Appliquer le remplacement
                            $corrected = preg_replace($pattern, $rule['replace'], $corrected);

                            // Enregistrer la correction
                            $corrections[] = [
                                'type' => 'exact',
                                'original' => $variant,
                                'corrected' => $rule['replace'],
                                'reason' => $rule['reason'] ?? 'Règle de vocabulaire',
                                'count' => $count
                            ];
                        }
                    }
                }
            }
            break;

        case 'souple':
            // Recherche souple avec normalisation
            $options = $rule['options'] ?? [];
            $search = $rule['search'] ?? '';

            if (!empty($search)) {
                $textNormalized = normalizeFuzzy($corrected, $options);
                $searchNormalized = normalizeFuzzy($search, $options);

                if (strpos($textNormalized, $searchNormalized) !== false) {
                    // Pour la recherche souple, on utilise une regex insensible à la casse
                    $pattern = '/\b' . preg_quote($search, '/') . '\b/ui';

                    if ($options['ignoreCase'] ?? false) {
                        $pattern = '/\b' . preg_quote($search, '/') . '\b/ui';
                    }

                    $count = preg_match_all($pattern, $corrected, $matchesArray);

                    if ($count > 0) {
                        $matches[] = [
                            'type' => 'souple',
                            'matched' => true,
                            'count' => $count
                        ];

                        $corrected = preg_replace($pattern, $rule['replace'], $corrected);

                        $corrections[] = [
                            'type' => 'souple',
                            'original' => $search,
                            'corrected' => $rule['replace'],
                            'reason' => $rule['reason'] ?? 'Règle de vocabulaire',
                            'count' => $count
                        ];
                    }
                }
            }
            break;

        case 'regex':
            // Recherche avec regex personnalisée
            $pattern = '/' . $rule['search'] . '/';
            if (isset($rule['options']['flags'])) {
                $pattern .= $rule['options']['flags'];
            }

            try {
                if (preg_match($pattern, $corrected)) {
                    $count = preg_match_all($pattern, $corrected, $matchesArray);

                    if ($count > 0) {
                        $matches[] = [
                            'type' => 'regex',
                            'count' => $count
                        ];

                        $corrected = preg_replace($pattern, $rule['replace'], $corrected);

                        $corrections[] = [
                            'type' => 'regex',
                            'original' => $rule['search'],
                            'corrected' => $rule['replace'],
                            'reason' => $rule['reason'] ?? 'Règle de vocabulaire',
                            'count' => $count
                        ];
                    }
                }
            } catch (Exception $e) {
                error_log('[vocabulary] Regex error in rule ' . ($rule['id'] ?? 'unknown') . ': ' . $e->getMessage());
            }
            break;
    }

    return [
        'text' => $corrected,
        'matched' => count($matches) > 0,
        'matches' => $matches,
        'corrections' => $corrections
    ];
}

/**
 * Applique toutes les règles de vocabulaire à un texte
 * @param string $text Texte à corriger
 * @param array $rulesData Données des règles (format complet avec 'rules' et 'categories')
 * @return array ['text' => string, 'corrections' => array, 'stats' => array]
 */
function applyAllVocabularyRules($text, $rulesData) {
    $corrected = $text;
    $allCorrections = [];
    $stats = [
        'rulesApplied' => 0,
        'totalReplacements' => 0
    ];

    $rules = $rulesData['rules'] ?? [];

    foreach ($rules as $rule) {
        $result = applyVocabularyRule($corrected, $rule);

        if ($result['matched']) {
            $corrected = $result['text'];
            $allCorrections = array_merge($allCorrections, $result['corrections']);
            $stats['rulesApplied']++;

            foreach ($result['corrections'] as $correction) {
                $stats['totalReplacements'] += $correction['count'] ?? 1;
            }
        }
    }

    return [
        'text' => $corrected,
        'corrections' => $allCorrections,
        'stats' => $stats
    ];
}

/**
 * Teste une règle sur un texte (pour le testeur de l'interface)
 * @param string $text Texte à tester
 * @param array $rule Règle à tester
 * @return array Résultat du test
 */
function testVocabularyRule($text, $rule) {
    return applyVocabularyRule($text, $rule);
}

/**
 * Retourne les catégories par défaut
 * @return array Catégories par défaut
 */
function getDefaultCategories() {
    return [
        [
            'id' => 'medical',
            'name' => 'Vocabulaire médical',
            'color' => '#10b981',
            'description' => 'Termes et expressions du domaine médical'
        ],
        [
            'id' => 'expressions',
            'name' => 'Expressions',
            'color' => '#3b82f6',
            'description' => 'Expressions courantes à corriger'
        ],
        [
            'id' => 'technique',
            'name' => 'Vocabulaire technique',
            'color' => '#f59e0b',
            'description' => 'Termes techniques spécifiques'
        ],
        [
            'id' => 'institutions',
            'name' => 'Institutions',
            'color' => '#8b5cf6',
            'description' => 'Noms d\'institutions et organisations'
        ],
        [
            'id' => 'acronymes',
            'name' => 'Acronymes',
            'color' => '#ec4899',
            'description' => 'Acronymes et sigles'
        ],
        [
            'id' => 'general',
            'name' => 'Général',
            'color' => '#6b7280',
            'description' => 'Corrections générales'
        ]
    ];
}

/**
 * Génère un nouvel ID unique pour une règle
 * @param array $existingRules Règles existantes
 * @return string Nouvel ID
 */
function generateRuleId($existingRules = []) {
    $maxId = 0;
    foreach ($existingRules as $rule) {
        if (isset($rule['id']) && preg_match('/^rule-(\d+)$/', $rule['id'], $matches)) {
            $maxId = max($maxId, (int)$matches[1]);
        }
    }
    return 'rule-' . str_pad($maxId + 1, 3, '0', STR_PAD_LEFT);
}

/**
 * Valide une règle avant sauvegarde
 * @param array $rule Règle à valider
 * @return array ['valid' => bool, 'errors' => array]
 */
function validateRule($rule) {
    $errors = [];

    // Vérifier les champs obligatoires
    if (empty($rule['type'])) {
        $errors[] = 'Le type de règle est obligatoire';
    }

    if (empty($rule['replace'])) {
        $errors[] = 'Le texte de remplacement est obligatoire';
    }

    // Validation spécifique par type
    switch ($rule['type']) {
        case 'exact':
            if (empty($rule['variants']) || !is_array($rule['variants']) || count($rule['variants']) === 0) {
                $errors[] = 'Au moins une variante est requise pour une règle exacte';
            }
            break;

        case 'souple':
            if (empty($rule['search'])) {
                $errors[] = 'Le texte de recherche est obligatoire pour une règle souple';
            }
            break;

        case 'regex':
            if (empty($rule['search'])) {
                $errors[] = 'Le pattern regex est obligatoire pour une règle regex';
            } else {
                // Tester la validité du regex
                $pattern = '/' . $rule['search'] . '/';
                if (isset($rule['options']['flags'])) {
                    $pattern .= $rule['options']['flags'];
                }

                set_error_handler(function() {});
                $validRegex = @preg_match($pattern, '') !== false;
                restore_error_handler();

                if (!$validRegex) {
                    $errors[] = 'Le pattern regex n\'est pas valide';
                }
            }
            break;

        default:
            $errors[] = 'Type de règle inconnu: ' . $rule['type'];
    }

    return [
        'valid' => count($errors) === 0,
        'errors' => $errors
    ];
}
