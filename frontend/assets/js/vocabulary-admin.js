/**
 * Interface d'administration des règles de vocabulaire
 * Gestion des règles, variantes, testeur et sauvegarde
 */

// État global de l'application
const AppState = {
    rules: [],
    categories: [],
    currentVariants: [],
    editingRuleId: null,
    unsavedChanges: false
};

// Initialisation au chargement de la page
document.addEventListener('DOMContentLoaded', () => {
    // Charger les données initiales
    if (window.INITIAL_RULES) {
        AppState.rules = window.INITIAL_RULES.rules || [];
        AppState.categories = window.CATEGORIES || [];
    }

    // Initialiser l'interface
    initializeEventListeners();
    renderRulesList();
    updateRulesCount();

    // Avertir avant de quitter si des changements non sauvegardés
    window.addEventListener('beforeunload', (e) => {
        if (AppState.unsavedChanges) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
});

/**
 * Initialise tous les event listeners
 */
function initializeEventListeners() {
    // Toggle section d'ajout/modification (collapsible)
    document.getElementById('addRuleToggle').addEventListener('click', toggleAddRuleSection);

    // Ouvrir/fermer le modal de test
    document.getElementById('btnTestRules').addEventListener('click', openTestModal);
    document.getElementById('testModal').addEventListener('click', (e) => {
        if (e.target.id === 'testModal') {
            closeTestModal();
        }
    });

    // Changement de type de règle
    document.querySelectorAll('input[name="ruleType"]').forEach(radio => {
        radio.addEventListener('change', handleRuleTypeChange);
    });

    // Ajouter une variante
    document.getElementById('btnAddVariant').addEventListener('click', addVariant);
    document.getElementById('newVariantInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addVariant();
        }
    });

    // Ajouter une règle
    document.getElementById('btnAddRule').addEventListener('click', addOrUpdateRule);

    // Sauvegarder
    document.getElementById('btnSave').addEventListener('click', saveRules);

    // Filtrer par catégorie
    document.getElementById('filterCategory').addEventListener('change', renderRulesList);

    // Tester les règles
    document.getElementById('btnTest').addEventListener('click', testAllRules);
}

/**
 * Toggle la section d'ajout/modification de règle
 */
function toggleAddRuleSection() {
    const content = document.getElementById('addRuleContent');
    const icon = document.querySelector('.collapse-icon');

    content.classList.toggle('expanded');
    icon.classList.toggle('collapsed');
}

/**
 * Ouvre le modal de test
 */
function openTestModal() {
    document.getElementById('testModal').classList.add('show');
}

/**
 * Ferme le modal de test
 */
function closeTestModal() {
    document.getElementById('testModal').classList.remove('show');
}

// Rendre les fonctions accessibles globalement pour les attributs onclick
window.openTestModal = openTestModal;
window.closeTestModal = closeTestModal;

/**
 * Gestion du changement de type de règle
 */
function handleRuleTypeChange(e) {
    const type = e.target.value;

    // Cacher tous les formulaires
    document.getElementById('formExact').classList.add('hidden');
    document.getElementById('formSouple').classList.add('hidden');
    document.getElementById('formRegex').classList.add('hidden');

    // Afficher le formulaire correspondant
    if (type === 'exact') {
        document.getElementById('formExact').classList.remove('hidden');
    } else if (type === 'souple') {
        document.getElementById('formSouple').classList.remove('hidden');
    } else if (type === 'regex') {
        document.getElementById('formRegex').classList.remove('hidden');
    }
}

/**
 * Ajoute une variante à la liste
 */
function addVariant() {
    const input = document.getElementById('newVariantInput');
    const variant = input.value.trim();

    if (!variant) {
        showToast('Veuillez entrer une variante', 'error');
        return;
    }

    if (AppState.currentVariants.includes(variant)) {
        showToast('Cette variante existe déjà', 'error');
        return;
    }

    AppState.currentVariants.push(variant);
    input.value = '';
    renderVariantsList();
}

/**
 * Supprime une variante de la liste
 */
function removeVariant(index) {
    AppState.currentVariants.splice(index, 1);
    renderVariantsList();
}

/**
 * Affiche la liste des variantes
 */
function renderVariantsList() {
    const container = document.getElementById('variantsList');

    if (AppState.currentVariants.length === 0) {
        container.innerHTML = '<p style="color: #6b7280; font-size: 0.875rem; margin: 0;">Aucune variante ajoutée</p>';
        return;
    }

    container.innerHTML = AppState.currentVariants.map((variant, index) => `
        <div class="variant-item">
            <span>${escapeHtml(variant)}</span>
            <button onclick="removeVariant(${index})">❌</button>
        </div>
    `).join('');
}

/**
 * Ajoute ou met à jour une règle
 */
function addOrUpdateRule() {
    const type = document.querySelector('input[name="ruleType"]:checked').value;
    const replacement = document.getElementById('replacement').value.trim();
    const category = document.getElementById('category').value;
    const reason = document.getElementById('reason').value.trim();

    // Validation de base
    if (!replacement) {
        showToast('Le remplacement est obligatoire', 'error');
        return;
    }

    // Construction de la règle
    const rule = {
        id: AppState.editingRuleId || generateRuleId(),
        enabled: true,
        type,
        replace: replacement,
        category,
        reason: reason || 'Règle de vocabulaire',
        stats: {
            usageCount: 0,
            lastUsed: null
        }
    };

    // Validation et données spécifiques au type
    if (type === 'exact') {
        if (AppState.currentVariants.length === 0) {
            showToast('Ajoutez au moins une variante', 'error');
            return;
        }
        rule.variants = [...AppState.currentVariants];
    } else if (type === 'souple') {
        const search = document.getElementById('soupleSearch').value.trim();
        if (!search) {
            showToast('Le texte de recherche est obligatoire', 'error');
            return;
        }
        rule.search = search;
        rule.options = {
            ignoreCase: document.getElementById('optIgnoreCase').checked,
            ignoreAccents: document.getElementById('optIgnoreAccents').checked,
            ignorePlural: document.getElementById('optIgnorePlural').checked,
            ignoreHyphens: document.getElementById('optIgnoreHyphens').checked,
            ignoreApostrophes: document.getElementById('optIgnoreApostrophes').checked
        };
    } else if (type === 'regex') {
        const pattern = document.getElementById('regexPattern').value.trim();
        if (!pattern) {
            showToast('Le pattern regex est obligatoire', 'error');
            return;
        }

        // Valider le regex
        try {
            new RegExp(pattern);
        } catch (e) {
            showToast('Pattern regex invalide : ' + e.message, 'error');
            return;
        }

        rule.search = pattern;
        rule.options = {
            flags: document.getElementById('regexFlags').value.trim()
        };
    }

    // Ajouter ou mettre à jour
    if (AppState.editingRuleId) {
        const index = AppState.rules.findIndex(r => r.id === AppState.editingRuleId);
        if (index !== -1) {
            AppState.rules[index] = rule;
            showToast('Règle mise à jour avec succès');
        }
    } else {
        AppState.rules.push(rule);
        showToast('Règle ajoutée avec succès');
    }

    // Réinitialiser le formulaire
    resetForm();
    AppState.unsavedChanges = true;
    renderRulesList();
    updateRulesCount();
}

/**
 * Réinitialise le formulaire
 */
function resetForm() {
    document.getElementById('replacement').value = '';
    document.getElementById('reason').value = '';
    document.getElementById('soupleSearch').value = '';
    document.getElementById('regexPattern').value = '';
    AppState.currentVariants = [];
    AppState.editingRuleId = null;
    renderVariantsList();
    document.getElementById('btnAddRule').textContent = '💾 Ajouter la règle';
}

/**
 * Affiche la liste des règles
 */
function renderRulesList() {
    const container = document.getElementById('rulesList');
    const filterCategory = document.getElementById('filterCategory').value;

    // Filtrer les règles
    let filteredRules = AppState.rules;
    if (filterCategory) {
        filteredRules = AppState.rules.filter(rule => rule.category === filterCategory);
    }

    if (filteredRules.length === 0) {
        container.innerHTML = '<p style="color: #6b7280; text-align: center; padding: 2rem;">Aucune règle trouvée</p>';
        return;
    }

    container.innerHTML = filteredRules.map(rule => renderRuleCard(rule)).join('');
}

/**
 * Affiche une carte de règle - Version compacte (1 ligne)
 */
function renderRuleCard(rule) {
    // Déterminer le texte pattern à afficher
    let patternText = '';
    if (rule.type === 'exact') {
        patternText = rule.variants && rule.variants.length > 0
            ? rule.variants.join(', ')
            : 'Variantes';
    } else {
        patternText = rule.search || '';
    }

    // Badges de type
    const typeLabels = {
        'exact': 'Exact',
        'souple': 'Souple',
        'regex': 'Regex'
    };

    return `
        <div class="rule-card ${rule.enabled ? '' : 'disabled'}" data-rule-id="${rule.id}" title="${escapeHtml(rule.reason || '')}">
            <!-- Partie gauche : statut + règle -->
            <div class="rule-info">
                <div class="rule-status ${rule.enabled ? 'active' : 'inactive'}"></div>
                <div class="rule-content">
                    <div class="rule-main">
                        <span class="rule-pattern">${escapeHtml(patternText)}</span>
                        <span class="rule-arrow">→</span>
                        <span class="rule-replace">${escapeHtml(rule.replace)}</span>
                    </div>
                </div>
            </div>

            <!-- Partie droite : type + boutons -->
            <div class="rule-meta">
                <span class="rule-type-badge ${rule.type}">${typeLabels[rule.type] || rule.type}</span>
                <div class="rule-actions">
                    <button class="btn-icon edit" onclick="editRule('${rule.id}')" title="Modifier">✏️</button>
                    <button class="btn-icon toggle ${rule.enabled ? '' : 'disabled-rule'}" onclick="toggleRule('${rule.id}')" title="${rule.enabled ? 'Désactiver' : 'Activer'}">
                        ${rule.enabled ? '👁️' : '👁️‍🗨️'}
                    </button>
                    <button class="btn-icon delete" onclick="deleteRule('${rule.id}')" title="Supprimer">🗑️</button>
                </div>
            </div>
        </div>
    `;
}

/**
 * Édite une règle
 */
function editRule(ruleId) {
    const rule = AppState.rules.find(r => r.id === ruleId);
    if (!rule) return;

    AppState.editingRuleId = ruleId;

    // Ouvrir la section d'ajout si elle est fermée
    const content = document.getElementById('addRuleContent');
    const icon = document.querySelector('.collapse-icon');
    if (!content.classList.contains('expanded')) {
        content.classList.add('expanded');
        icon.classList.remove('collapsed');
    }

    // Sélectionner le type
    document.querySelector(`input[name="ruleType"][value="${rule.type}"]`).checked = true;
    handleRuleTypeChange({ target: { value: rule.type } });

    // Remplir les champs communs
    document.getElementById('replacement').value = rule.replace;
    document.getElementById('category').value = rule.category;
    document.getElementById('reason').value = rule.reason || '';

    // Remplir les champs spécifiques
    if (rule.type === 'exact') {
        AppState.currentVariants = [...(rule.variants || [])];
        renderVariantsList();
    } else if (rule.type === 'souple') {
        document.getElementById('soupleSearch').value = rule.search || '';
        document.getElementById('optIgnoreCase').checked = rule.options?.ignoreCase ?? false;
        document.getElementById('optIgnoreAccents').checked = rule.options?.ignoreAccents ?? false;
        document.getElementById('optIgnorePlural').checked = rule.options?.ignorePlural ?? false;
        document.getElementById('optIgnoreHyphens').checked = rule.options?.ignoreHyphens ?? false;
        document.getElementById('optIgnoreApostrophes').checked = rule.options?.ignoreApostrophes ?? false;
    } else if (rule.type === 'regex') {
        document.getElementById('regexPattern').value = rule.search || '';
        document.getElementById('regexFlags').value = rule.options?.flags || 'gi';
    }

    // Changer le texte du bouton
    document.getElementById('btnAddRule').textContent = '💾 Mettre à jour la règle';

    // Scroller vers le formulaire
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Active/désactive une règle
 */
function toggleRule(ruleId) {
    const rule = AppState.rules.find(r => r.id === ruleId);
    if (!rule) return;

    rule.enabled = !rule.enabled;
    AppState.unsavedChanges = true;
    renderRulesList();
    showToast(`Règle ${rule.enabled ? 'activée' : 'désactivée'}`);
}

/**
 * Supprime une règle
 */
function deleteRule(ruleId) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette règle ?')) {
        return;
    }

    const index = AppState.rules.findIndex(r => r.id === ruleId);
    if (index !== -1) {
        AppState.rules.splice(index, 1);
        AppState.unsavedChanges = true;
        renderRulesList();
        updateRulesCount();
        showToast('Règle supprimée');
    }
}

/**
 * Teste une règle spécifique
 */
async function testRule(ruleId) {
    const rule = AppState.rules.find(r => r.id === ruleId);
    if (!rule) return;

    const text = document.getElementById('testText').value;
    if (!text) {
        showToast('Entrez un texte à tester', 'error');
        return;
    }

    try {
        const response = await fetch('vocabulary.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'test',
                text,
                rule
            })
        });

        const data = await response.json();

        if (data.success) {
            displayTestResult(data.result, [rule]);
        } else {
            showToast(data.message || 'Erreur lors du test', 'error');
        }
    } catch (error) {
        console.error('Test error:', error);
        showToast('Erreur lors du test', 'error');
    }
}

/**
 * Teste toutes les règles
 */
async function testAllRules() {
    const text = document.getElementById('testText').value;
    if (!text) {
        showToast('Entrez un texte à tester', 'error');
        return;
    }

    try {
        const response = await fetch('vocabulary.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'testAll',
                text,
                rulesData: {
                    rules: AppState.rules,
                    categories: AppState.categories
                }
            })
        });

        const data = await response.json();

        if (data.success) {
            displayTestResult(data.result);
        } else {
            showToast(data.message || 'Erreur lors du test', 'error');
        }
    } catch (error) {
        console.error('Test error:', error);
        showToast('Erreur lors du test', 'error');
    }
}

/**
 * Affiche le résultat du test
 */
function displayTestResult(result, specificRules = null) {
    const output = document.getElementById('testOutput');
    output.classList.remove('hidden');

    const stats = result.stats || { rulesApplied: 0, totalReplacements: 0 };
    const corrections = result.corrections || [];

    let html = `
        <h4>Résultat :</h4>
        <div style="padding: 1rem; background: #f3f4f6; border-radius: 4px; margin-bottom: 1rem; white-space: pre-wrap; font-family: monospace;">
${escapeHtml(result.text)}
        </div>
    `;

    if (corrections.length > 0) {
        html += `
            <h4>✓ ${stats.totalReplacements} correction(s) appliquée(s) :</h4>
            ${corrections.map(corr => `
                <div class="correction-item">
                    <strong>${escapeHtml(corr.original)}</strong> → <strong style="color: #10b981;">${escapeHtml(corr.corrected)}</strong>
                    <br>
                    <small style="color: #6b7280;">${escapeHtml(corr.reason)} (${corr.count} occurrence(s))</small>
                    ${corr.pattern ? `<br><small style="color: #9ca3af; font-family: monospace;">Pattern: ${escapeHtml(corr.pattern)}</small>` : ''}
                </div>
            `).join('')}
        `;
    } else {
        html += '<p style="color: #6b7280;">Aucune correction appliquée.</p>';
    }

    output.innerHTML = html;
}

/**
 * Sauvegarde les règles
 */
async function saveRules() {
    const btnSave = document.getElementById('btnSave');
    btnSave.disabled = true;
    btnSave.textContent = '⏳ Sauvegarde...';

    try {
        const formData = new FormData();
        formData.append('action', 'save');
        formData.append('rulesData', JSON.stringify({
            version: '1.0',
            lastUpdate: new Date().toISOString(),
            rules: AppState.rules,
            categories: AppState.categories
        }));

        const response = await fetch('vocabulary.php', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            AppState.unsavedChanges = false;
            showToast(`✓ ${data.rulesCount} règle(s) sauvegardée(s)`);
        } else {
            showToast(data.message || 'Erreur lors de la sauvegarde', 'error');
        }
    } catch (error) {
        console.error('Save error:', error);
        showToast('Erreur lors de la sauvegarde', 'error');
    } finally {
        btnSave.disabled = false;
        btnSave.textContent = '💾 Sauvegarder';
    }
}

/**
 * Met à jour le compteur de règles
 */
function updateRulesCount() {
    document.getElementById('rulesCount').textContent = AppState.rules.length;
}

/**
 * Génère un ID unique pour une règle
 */
function generateRuleId() {
    let maxId = 0;
    AppState.rules.forEach(rule => {
        const match = rule.id.match(/^rule-(\d+)$/);
        if (match) {
            maxId = Math.max(maxId, parseInt(match[1]));
        }
    });
    return `rule-${String(maxId + 1).padStart(3, '0')}`;
}

/**
 * Échappe le HTML
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Affiche une notification toast
 */
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Exposer les fonctions globalement pour les onclick
window.removeVariant = removeVariant;
window.editRule = editRule;
window.toggleRule = toggleRule;
window.deleteRule = deleteRule;
window.testRule = testRule;
