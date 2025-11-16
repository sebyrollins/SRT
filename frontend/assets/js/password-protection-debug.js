/**
 * DEBUG : Système de protection par mot de passe pour le mode Sonnet Pro
 * Version avec logs de débogage
 */

// État de la protection
let isPasswordValidated = false;
let selectedModel = 'sonnet'; // Par défaut

// Log au chargement
console.log('[PASSWORD-PROTECTION] Script chargé');
console.log('[PASSWORD-PROTECTION] Config:', window.APP_CONFIG);

/**
 * Vérifie si la protection par mot de passe doit être activée
 */
function shouldShowPasswordModal() {
    const privateMode = window.APP_CONFIG?.security?.privateMode;
    console.log('[PASSWORD-PROTECTION] shouldShowPasswordModal() - privateMode:', privateMode);
    console.log('[PASSWORD-PROTECTION] shouldShowPasswordModal() - selectedModel:', selectedModel);
    console.log('[PASSWORD-PROTECTION] shouldShowPasswordModal() - isPasswordValidated:', isPasswordValidated);

    // Si mode privé désactivé, pas de protection
    if (!privateMode) {
        console.log('[PASSWORD-PROTECTION] Mode privé désactivé, pas de popup');
        return false;
    }

    // Si mode Cleaning sélectionné, pas de protection (pas d'appel API)
    if (selectedModel === 'cleaning') {
        console.log('[PASSWORD-PROTECTION] Mode Cleaning, pas de popup');
        return false;
    }

    // Si déjà validé, ne pas redemander
    if (isPasswordValidated) {
        console.log('[PASSWORD-PROTECTION] Déjà validé, pas de popup');
        return false;
    }

    console.log('[PASSWORD-PROTECTION] Afficher la popup !');
    return true;
}

/**
 * Affiche la popup de mot de passe
 */
function showPasswordModal() {
    console.log('[PASSWORD-PROTECTION] showPasswordModal()');
    const modal = document.getElementById('passwordModal');
    if (modal) {
        modal.style.display = 'flex';

        // Focus sur l'input
        setTimeout(() => {
            const input = document.getElementById('passwordInput');
            if (input) {
                input.focus();
            }
        }, 100);

        // Écouter la touche Entrée
        const input = document.getElementById('passwordInput');
        if (input) {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    validatePassword();
                }
            });
        }
    } else {
        console.error('[PASSWORD-PROTECTION] passwordModal introuvable !');
    }
}

/**
 * Masque la popup de mot de passe
 */
function hidePasswordModal() {
    console.log('[PASSWORD-PROTECTION] hidePasswordModal()');
    const modal = document.getElementById('passwordModal');
    if (modal) {
        modal.style.display = 'none';
    }

    // Réinitialiser l'input et l'erreur
    const input = document.getElementById('passwordInput');
    const error = document.getElementById('passwordError');
    if (input) input.value = '';
    if (error) error.style.display = 'none';
}

/**
 * Toggle la visibilité du mot de passe
 */
function togglePasswordVisibility() {
    const input = document.getElementById('passwordInput');
    if (input) {
        input.type = input.type === 'password' ? 'text' : 'password';
    }
}

/**
 * Valide le mot de passe
 */
async function validatePassword() {
    console.log('[PASSWORD-PROTECTION] validatePassword()');
    const input = document.getElementById('passwordInput');
    const error = document.getElementById('passwordError');

    if (!input) {
        console.error('[PASSWORD-PROTECTION] Input introuvable !');
        return;
    }

    const enteredPassword = input.value;
    console.log('[PASSWORD-PROTECTION] Mot de passe entré:', enteredPassword);

    // Hash le mot de passe entré et comparer avec le hash stocké
    const enteredHash = await sha256(enteredPassword);
    const expectedHash = window.APP_CONFIG?.security?.passwordHash;

    console.log('[PASSWORD-PROTECTION] Hash entré:', enteredHash);
    console.log('[PASSWORD-PROTECTION] Hash attendu:', expectedHash);
    console.log('[PASSWORD-PROTECTION] Match:', enteredHash === expectedHash);

    if (enteredHash === expectedHash) {
        // Mot de passe correct
        console.log('[PASSWORD-PROTECTION] ✓ Mot de passe correct !');
        isPasswordValidated = true;
        hidePasswordModal();

        // Message de succès
        showToast('✓ Accès autorisé au mode Sonnet Pro', 'success');

        // Forcer le modèle sur Sonnet
        const modelSelect = document.getElementById('modelSelect');
        if (modelSelect) {
            modelSelect.value = 'sonnet';
            selectedModel = 'sonnet';
        }
    } else {
        // Mot de passe incorrect - Basculer en mode Cleaning
        console.log('[PASSWORD-PROTECTION] ✗ Mot de passe incorrect');
        error.style.display = 'block';

        setTimeout(() => {
            hidePasswordModal();
            switchToCleaningMode();
        }, 2000);
    }
}

/**
 * Annule la demande de mot de passe et bascule en mode Cleaning
 */
function cancelPassword() {
    console.log('[PASSWORD-PROTECTION] cancelPassword()');
    hidePasswordModal();
    switchToCleaningMode();
}

/**
 * Bascule automatiquement en mode Cleaning (sans coût API)
 */
function switchToCleaningMode() {
    console.log('[PASSWORD-PROTECTION] switchToCleaningMode()');
    const modelSelect = document.getElementById('modelSelect');
    if (modelSelect) {
        modelSelect.value = 'cleaning';
        selectedModel = 'cleaning';

        // Trigger change event pour mettre à jour l'UI
        const event = new Event('change');
        modelSelect.dispatchEvent(event);
    }

    showToast('Mode Cleaning activé (sans coût API)', 'info');
}

/**
 * Fonction simple de hash SHA-256 (pour vérification côté client)
 */
async function sha256(str) {
    const buffer = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

/**
 * Affiche une notification toast
 */
function showToast(message, type = 'info') {
    console.log('[PASSWORD-PROTECTION] Toast:', message, type);
    // Créer l'élément toast
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        top: 2rem;
        right: 2rem;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 10001;
        animation: slideInRight 0.3s ease-out;
        max-width: 400px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    `;

    // Couleur selon le type
    if (type === 'success') {
        toast.style.background = '#10b981';
    } else if (type === 'error') {
        toast.style.background = '#ef4444';
    } else {
        toast.style.background = '#3b82f6';
    }

    document.body.appendChild(toast);

    // Supprimer après 3 secondes
    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease-out';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * Gère le changement de modèle
 */
function handleModelChange(event) {
    const newModel = event.target.value;
    const previousModel = selectedModel;
    selectedModel = newModel;

    console.log('[PASSWORD-PROTECTION] handleModelChange() - Previous:', previousModel, 'New:', newModel);

    // Si on passe de Cleaning à Sonnet et que le mode privé est activé
    if (previousModel === 'cleaning' && newModel === 'sonnet') {
        if (shouldShowPasswordModal()) {
            showPasswordModal();
        }
    }

    // Si on passe à Cleaning, réinitialiser la validation
    if (newModel === 'cleaning') {
        isPasswordValidated = false;
    }
}

/**
 * Intercepte la soumission du formulaire pour vérifier l'accès
 */
function handleFormSubmit(event) {
    console.log('[PASSWORD-PROTECTION] handleFormSubmit()');
    // Si mode Sonnet sélectionné et mode privé activé
    if (selectedModel === 'sonnet' && window.APP_CONFIG?.security?.privateMode) {
        if (!isPasswordValidated) {
            console.log('[PASSWORD-PROTECTION] Blocage soumission - demande mot de passe');
            event.preventDefault();
            showPasswordModal();
            return false;
        }
    }

    return true;
}

// Initialisation au chargement de la page
document.addEventListener('DOMContentLoaded', () => {
    console.log('[PASSWORD-PROTECTION] DOMContentLoaded');

    // Récupérer le modèle sélectionné
    const modelSelect = document.getElementById('modelSelect');
    if (modelSelect) {
        selectedModel = modelSelect.value;
        console.log('[PASSWORD-PROTECTION] Modèle initial:', selectedModel);

        // Écouter les changements de modèle
        modelSelect.addEventListener('change', handleModelChange);
    }

    // Intercepter la soumission du formulaire
    const uploadForm = document.getElementById('uploadForm');
    if (uploadForm) {
        uploadForm.addEventListener('submit', handleFormSubmit);
    }

    // Si mode privé activé et Sonnet sélectionné, afficher la popup au chargement
    if (shouldShowPasswordModal()) {
        // Petit délai pour laisser la page se charger
        setTimeout(() => {
            showPasswordModal();
        }, 500);
    }
});

// Exposer les fonctions globalement pour les onclick
window.togglePasswordVisibility = togglePasswordVisibility;
window.validatePassword = validatePassword;
window.cancelPassword = cancelPassword;

console.log('[PASSWORD-PROTECTION] Script initialisé');
