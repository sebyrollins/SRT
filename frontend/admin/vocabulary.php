<?php
/**
 * Interface de gestion des règles de vocabulaire - Pass 5
 * Permet d'ajouter, modifier, supprimer et tester les règles de correction
 */

// Démarrer la session
session_start();

// Vérifier l'authentification
if (!isset($_SESSION['admin_authenticated']) || $_SESSION['admin_authenticated'] !== true) {
    header('Location: index.php');
    exit;
}

// Charger les fonctions de vocabulaire
require_once __DIR__ . '/../lib/vocabulary.php';

// Gestion des requêtes API
if ($_SERVER['REQUEST_METHOD'] === 'POST' || $_SERVER['REQUEST_METHOD'] === 'DELETE') {
    header('Content-Type: application/json');

    $input = file_get_contents('php://input');
    $data = json_decode($input, true);

    // Action : Sauvegarder toutes les règles
    if (isset($_POST['action']) && $_POST['action'] === 'save') {
        $rulesData = $_POST['rulesData'] ?? null;

        if ($rulesData) {
            // Décoder si c'est une string JSON
            if (is_string($rulesData)) {
                $rulesData = json_decode($rulesData, true);
            }

            $result = saveVocabularyRules($rulesData);
            echo json_encode($result);
            exit;
        } else {
            echo json_encode(['success' => false, 'message' => 'Données manquantes']);
            exit;
        }
    }

    // Action : Tester une règle
    if (isset($data['action']) && $data['action'] === 'test') {
        $text = $data['text'] ?? '';
        $rule = $data['rule'] ?? null;

        if ($rule) {
            $result = testVocabularyRule($text, $rule);
            echo json_encode(['success' => true, 'result' => $result]);
            exit;
        } else {
            echo json_encode(['success' => false, 'message' => 'Règle manquante']);
            exit;
        }
    }

    // Action : Tester toutes les règles
    if (isset($data['action']) && $data['action'] === 'testAll') {
        $text = $data['text'] ?? '';
        $rulesData = $data['rulesData'] ?? null;

        if ($rulesData) {
            $result = applyAllVocabularyRules($text, $rulesData);
            echo json_encode(['success' => true, 'result' => $result]);
            exit;
        } else {
            echo json_encode(['success' => false, 'message' => 'Données manquantes']);
            exit;
        }
    }

    echo json_encode(['success' => false, 'message' => 'Action inconnue']);
    exit;
}

// Charger les règles existantes
$rulesData = loadVocabularyRules();
$rules = $rulesData['rules'] ?? [];
$categories = $rulesData['categories'] ?? getDefaultCategories();

?>
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Gestion du vocabulaire - Admin</title>
    <link rel="stylesheet" href="../assets/css/style.css">
    <link rel="stylesheet" href="../assets/css/admin.css">
    <style>
        .vocab-container {
            max-width: 1400px;
            margin: 2rem auto;
            padding: 2rem;
        }

        .vocab-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 2rem;
            padding-bottom: 1rem;
            border-bottom: 2px solid var(--color-border, #e5e7eb);
        }

        .vocab-header h1 {
            color: var(--color-primary, #4f46e5);
            margin: 0;
        }

        .header-actions {
            display: flex;
            gap: 1rem;
        }

        .btn {
            padding: 0.75rem 1.5rem;
            border: none;
            border-radius: 6px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
        }

        .btn-primary {
            background: var(--color-primary, #4f46e5);
            color: white;
        }

        .btn-primary:hover {
            background: var(--color-primary-dark, #4338ca);
        }

        .btn-secondary {
            background: var(--color-bg-secondary, #f3f4f6);
            color: var(--color-text-primary, #1f2937);
            border: 1px solid var(--color-border, #d1d5db);
        }

        .btn-secondary:hover {
            background: #e5e7eb;
        }

        .btn-success {
            background: #10b981;
            color: white;
        }

        .btn-success:hover {
            background: #059669;
        }

        .btn-danger {
            background: #ef4444;
            color: white;
        }

        .btn-danger:hover {
            background: #dc2626;
        }

        /* Section d'ajout/modification - Collapsible */
        .add-rule-section {
            background: var(--color-bg-secondary, #f9fafb);
            border-radius: 8px;
            margin-bottom: 2rem;
            border: 2px solid var(--color-border, #d1d5db);
            overflow: hidden;
        }

        .add-rule-header {
            padding: 1rem 1.5rem;
            background: var(--color-primary, #4f46e5);
            color: white;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
            user-select: none;
        }

        .add-rule-header:hover {
            background: var(--color-primary-dark, #4338ca);
        }

        .add-rule-header h2 {
            margin: 0;
            font-size: 1.125rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .collapse-icon {
            transition: transform 0.3s;
            font-size: 1.5rem;
        }

        .collapse-icon.collapsed {
            transform: rotate(-90deg);
        }

        .add-rule-content {
            padding: 2rem;
            display: none;
        }

        .add-rule-content.expanded {
            display: block;
        }

        .form-group {
            margin-bottom: 1.5rem;
        }

        .form-group label {
            display: block;
            font-weight: 600;
            margin-bottom: 0.5rem;
            color: var(--color-text-primary, #1f2937);
        }

        .form-group input[type="text"],
        .form-group textarea,
        .form-group select {
            width: 100%;
            padding: 0.75rem;
            border: 1px solid var(--color-border, #d1d5db);
            border-radius: 4px;
            font-size: 1rem;
        }

        .form-group textarea {
            min-height: 100px;
            resize: vertical;
        }

        .radio-group {
            display: flex;
            gap: 2rem;
            margin-top: 0.5rem;
        }

        .radio-option {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .variants-container {
            border: 1px solid var(--color-border, #d1d5db);
            border-radius: 4px;
            padding: 1rem;
            background: white;
        }

        .variant-item {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.5rem;
            background: #f3f4f6;
            border-radius: 4px;
            margin-bottom: 0.5rem;
        }

        .variant-item span {
            flex: 1;
        }

        .variant-item button {
            background: #ef4444;
            color: white;
            border: none;
            padding: 0.25rem 0.5rem;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.875rem;
        }

        .add-variant-input {
            display: flex;
            gap: 0.5rem;
            margin-top: 0.5rem;
        }

        .add-variant-input input {
            flex: 1;
        }

        .options-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 1rem;
            margin-top: 0.5rem;
        }

        .checkbox-option {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .rules-list {
            margin-top: 2rem;
        }

        .rules-list-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1rem;
        }

        .rules-list-header h2 {
            color: var(--color-text-primary, #1f2937);
            margin: 0;
        }

        .filter-group {
            display: flex;
            gap: 1rem;
            align-items: center;
        }

        /* Règles en mode compact - 1 ligne */
        .rule-card {
            background: white;
            border: 1px solid var(--color-border, #e5e7eb);
            border-radius: 6px;
            padding: 0.75rem 1rem;
            margin-bottom: 0.5rem;
            transition: all 0.2s;
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 1rem;
        }

        .rule-card:hover {
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            background: #fafbfc;
        }

        .rule-card.disabled {
            opacity: 0.5;
            background: #f9fafb;
        }

        .rule-info {
            flex: 1;
            display: flex;
            align-items: center;
            gap: 1rem;
            min-width: 0;
        }

        .rule-status {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            flex-shrink: 0;
        }

        .rule-status.active {
            background: #10b981;
        }

        .rule-status.inactive {
            background: #9ca3af;
        }

        .rule-content {
            flex: 1;
            min-width: 0;
        }

        .rule-main {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            font-size: 0.95rem;
        }

        .rule-pattern {
            font-family: monospace;
            color: var(--color-text-primary, #1f2937);
            font-weight: 500;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .rule-arrow {
            color: var(--color-text-secondary, #6b7280);
            flex-shrink: 0;
        }

        .rule-replace {
            font-family: monospace;
            color: #10b981;
            font-weight: 600;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .rule-meta {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            flex-shrink: 0;
        }

        .rule-type-badge {
            padding: 0.25rem 0.5rem;
            border-radius: 4px;
            font-size: 0.75rem;
            font-weight: 600;
            white-space: nowrap;
        }

        .rule-type-badge.exact {
            background: #dbeafe;
            color: #1e40af;
        }

        .rule-type-badge.souple {
            background: #fef3c7;
            color: #92400e;
        }

        .rule-type-badge.regex {
            background: #fce7f3;
            color: #9f1239;
        }

        /* Boutons d'action avec icônes uniquement */
        .rule-actions {
            display: flex;
            gap: 0.25rem;
            flex-shrink: 0;
        }

        .btn-icon {
            padding: 0.5rem;
            border: 1px solid var(--color-border, #d1d5db);
            background: white;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s;
            font-size: 1rem;
            line-height: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
        }

        .btn-icon:hover {
            background: var(--color-bg-secondary, #f3f4f6);
            transform: translateY(-1px);
        }

        .btn-icon.edit {
            color: #3b82f6;
            border-color: #3b82f6;
        }

        .btn-icon.edit:hover {
            background: #eff6ff;
        }

        .btn-icon.toggle {
            color: #10b981;
            border-color: #10b981;
        }

        .btn-icon.toggle:hover {
            background: #f0fdf4;
        }

        .btn-icon.toggle.disabled-rule {
            color: #9ca3af;
            border-color: #9ca3af;
        }

        .btn-icon.toggle.disabled-rule:hover {
            background: #f9fafb;
        }

        .btn-icon.delete {
            color: #ef4444;
            border-color: #ef4444;
        }

        .btn-icon.delete:hover {
            background: #fef2f2;
        }

        /* Modal pour le testeur */
        .modal {
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            animation: fadeIn 0.2s;
        }

        .modal.show {
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .modal-content {
            background-color: white;
            border-radius: 8px;
            width: 90%;
            max-width: 700px;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
            animation: slideUp 0.3s;
        }

        .modal-header {
            padding: 1.5rem;
            border-bottom: 1px solid var(--color-border, #e5e7eb);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .modal-header h3 {
            margin: 0;
            color: #1e40af;
        }

        .modal-close {
            background: none;
            border: none;
            font-size: 1.5rem;
            cursor: pointer;
            color: var(--color-text-secondary, #6b7280);
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
        }

        .modal-close:hover {
            background: var(--color-bg-secondary, #f3f4f6);
        }

        .modal-body {
            padding: 1.5rem;
        }

        .tester-input {
            margin-bottom: 1rem;
        }

        .tester-output {
            background: #f9fafb;
            padding: 1.5rem;
            border-radius: 4px;
            border: 1px solid var(--color-border, #d1d5db);
            margin-top: 1rem;
        }

        .tester-output h4 {
            margin-top: 0;
            color: #1e40af;
        }

        .correction-item {
            padding: 0.75rem;
            background: #f0fdf4;
            border-left: 3px solid #10b981;
            margin-bottom: 0.5rem;
            border-radius: 4px;
        }

        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        @keyframes slideUp {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .hidden {
            display: none;
        }

        .toast {
            position: fixed;
            top: 2rem;
            right: 2rem;
            padding: 1rem 1.5rem;
            background: #10b981;
            color: white;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            z-index: 1000;
            animation: slideIn 0.3s ease-out;
        }

        .toast.error {
            background: #ef4444;
        }

        @keyframes slideIn {
            from {
                transform: translateX(400px);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
    </style>
</head>
<body>
    <div class="vocab-container">
        <div class="vocab-header">
            <h1>📚 Gestion du vocabulaire - Pass 5</h1>
            <div class="header-actions">
                <button id="btnNewRule" class="btn btn-primary">➕ Nouvelle règle</button>
                <button id="btnTestRules" class="btn btn-primary">🧪 Tester</button>
                <button id="btnSave" class="btn btn-success">💾 Sauvegarder</button>
                <a href="index.php" class="btn btn-secondary">← Retour</a>
            </div>
        </div>

        <!-- Section d'ajout de règle - Collapsible -->
        <div class="add-rule-section">
            <div class="add-rule-header" id="addRuleToggle">
                <h2><span style="color: white;">➕</span> Formulaire de règle</h2>
                <span class="collapse-icon collapsed">▼</span>
            </div>
            <div class="add-rule-content" id="addRuleContent">

            <div class="form-group">
                <label>Type de recherche :</label>
                <div class="radio-group">
                    <div class="radio-option">
                        <input type="radio" id="typeExact" name="ruleType" value="exact" checked>
                        <label for="typeExact">Variantes exactes (plusieurs orthographes)</label>
                    </div>
                    <div class="radio-option">
                        <input type="radio" id="typeSouple" name="ruleType" value="souple">
                        <label for="typeSouple">Recherche souple (ignore casse, accents...)</label>
                    </div>
                    <div class="radio-option">
                        <input type="radio" id="typeRegex" name="ruleType" value="regex">
                        <label for="typeRegex">Regex avancée (pour experts)</label>
                    </div>
                </div>
            </div>

            <!-- Formulaire pour type "exact" -->
            <div id="formExact">
                <div class="form-group">
                    <label>Variantes à chercher :</label>
                    <div class="variants-container">
                        <div id="variantsList"></div>
                        <div class="add-variant-input">
                            <input
                                type="text"
                                id="newVariantInput"
                                placeholder="Tapez une variante et appuyez sur Entrée..."
                            >
                            <button type="button" class="btn btn-primary" id="btnAddVariant">➕ Ajouter</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Formulaire pour type "souple" -->
            <div id="formSouple" class="hidden">
                <div class="form-group">
                    <label for="souplesearch">Texte à rechercher :</label>
                    <input type="text" id="soupleSearch" placeholder="développement durable">
                </div>
                <div class="form-group">
                    <label>Options de recherche souple :</label>
                    <div class="options-grid">
                        <div class="checkbox-option">
                            <input type="checkbox" id="optIgnoreCase" checked>
                            <label for="optIgnoreCase">Ignorer majuscules/minuscules</label>
                        </div>
                        <div class="checkbox-option">
                            <input type="checkbox" id="optIgnoreAccents" checked>
                            <label for="optIgnoreAccents">Ignorer les accents (é→e)</label>
                        </div>
                        <div class="checkbox-option">
                            <input type="checkbox" id="optIgnorePlural">
                            <label for="optIgnorePlural">Ignorer les "s" finaux</label>
                        </div>
                        <div class="checkbox-option">
                            <input type="checkbox" id="optIgnoreHyphens">
                            <label for="optIgnoreHyphens">Ignorer tirets et espaces</label>
                        </div>
                        <div class="checkbox-option">
                            <input type="checkbox" id="optIgnoreApostrophes">
                            <label for="optIgnoreApostrophes">Ignorer apostrophes (' ' espace)</label>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Formulaire pour type "regex" -->
            <div id="formRegex" class="hidden">
                <div class="form-group">
                    <label for="regexPattern">Pattern regex :</label>
                    <input type="text" id="regexPattern" placeholder="\bau\s*niveau\s*de\b">
                </div>
                <div class="form-group">
                    <label for="regexFlags">Flags (optionnel) :</label>
                    <input type="text" id="regexFlags" placeholder="gi" value="gi">
                </div>
            </div>

            <!-- Champs communs -->
            <div class="form-group">
                <label for="replacement">Remplacement unique :</label>
                <input type="text" id="replacement" placeholder="scanner" required>
            </div>

            <div class="form-group">
                <label for="category">Catégorie :</label>
                <select id="category">
                    <?php foreach ($categories as $cat): ?>
                        <option value="<?php echo htmlspecialchars($cat['id']); ?>">
                            <?php echo htmlspecialchars($cat['name']); ?>
                        </option>
                    <?php endforeach; ?>
                </select>
            </div>

            <div class="form-group">
                <label for="reason">Raison de la correction :</label>
                <input type="text" id="reason" placeholder="Uniformisation terminologie">
            </div>

            <button type="button" class="btn btn-primary" id="btnAddRule">💾 Ajouter la règle</button>
            </div>
        </div>

        <!-- Liste des règles -->
        <div class="rules-list">
            <div class="rules-list-header">
                <h2>📋 Règles actives (<span id="rulesCount">0</span>)</h2>
                <div class="filter-group">
                    <label for="filterCategory">Filtrer :</label>
                    <select id="filterCategory">
                        <option value="">Toutes les catégories</option>
                        <?php foreach ($categories as $cat): ?>
                            <option value="<?php echo htmlspecialchars($cat['id']); ?>">
                                <?php echo htmlspecialchars($cat['name']); ?>
                            </option>
                        <?php endforeach; ?>
                    </select>
                </div>
            </div>

            <div id="rulesList"></div>
        </div>

    </div>

    <!-- Modal Testeur de règles -->
    <div id="testModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h3>🧪 Testeur de règles</h3>
                <button class="modal-close" onclick="closeTestModal()">✕</button>
            </div>
            <div class="modal-body">
                <div class="tester-input">
                    <label for="testText">Texte de test :</label>
                    <textarea id="testText" placeholder="Le scanneur montre une anomalie au niveau de la thyroïde..." style="width: 100%; min-height: 100px; padding: 0.75rem; border: 1px solid var(--color-border, #d1d5db); border-radius: 4px; font-family: inherit; font-size: 1rem; resize: vertical;"></textarea>
                </div>
                <button type="button" class="btn btn-primary" id="btnTest">🧪 Tester toutes les règles</button>
                <div id="testOutput" class="tester-output hidden"></div>
            </div>
        </div>
    </div>

    <!-- Données initiales -->
    <script>
        window.INITIAL_RULES = <?php echo json_encode($rulesData, JSON_UNESCAPED_UNICODE); ?>;
        window.CATEGORIES = <?php echo json_encode($categories, JSON_UNESCAPED_UNICODE); ?>;
    </script>

    <script src="../assets/js/vocabulary-admin.js"></script>
</body>
</html>
