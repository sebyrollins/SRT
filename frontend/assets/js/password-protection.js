/**
 * Système de protection par mot de passe pour le mode Sonnet Pro
 * Gère l'affichage de la popup et la validation du mot de passe
 */

// État de la protection
let isPasswordValidated = false;
let selectedModel = 'sonnet'; // Par défaut

/**
 * Sauvegarde la validation du mot de passe avec timestamp
 */
function savePasswordValidation() {
    const timestamp = Date.now();
    sessionStorage.setItem('passwordValidatedAt', timestamp.toString());
}

/**
 * Vérifie si la validation du mot de passe est encore valide
 * @returns {boolean} true si la validation est encore valide
 */
function isPasswordValidationStillValid() {
    const validatedAt = sessionStorage.getItem('passwordValidatedAt');
    if (!validatedAt) {
        return false;
    }

    const timestamp = parseInt(validatedAt, 10);
    const now = Date.now();
    const durationMinutes = window.APP_CONFIG?.security?.passwordDuration || 30; // 30 minutes par défaut
    const durationMs = durationMinutes * 60 * 1000;

    // Vérifier si le temps écoulé est inférieur à la durée configurée
    const isValid = (now - timestamp) < durationMs;

    if (!isValid) {
        // Expiration : nettoyer le storage
        sessionStorage.removeItem('passwordValidatedAt');
    }

    return isValid;
}

/**
 * Réinitialise la validation du mot de passe
 */
function clearPasswordValidation() {
    sessionStorage.removeItem('passwordValidatedAt');
    isPasswordValidated = false;
}

/**
 * Vérifie si la protection par mot de passe doit être activée
 */
function shouldShowPasswordModal() {
    // Si mode privé désactivé, pas de protection
    if (!window.APP_CONFIG?.security?.privateMode) {
        return false;
    }

    // Si mode Cleaning sélectionné, pas de protection (pas d'appel API)
    if (selectedModel === 'cleaning') {
        return false;
    }

    // Vérifier si la validation est encore valide (avec durée)
    if (isPasswordValidationStillValid()) {
        isPasswordValidated = true;
        return false;
    }

    // Si déjà validé dans cette session (variable), ne pas redemander
    if (isPasswordValidated) {
        return false;
    }

    return true;
}

/**
 * Affiche la popup de mot de passe
 */
function showPasswordModal() {
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
    }
}

/**
 * Masque la popup de mot de passe
 */
function hidePasswordModal() {
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
    const input = document.getElementById('passwordInput');
    const error = document.getElementById('passwordError');

    if (!input) return;

    const enteredPassword = input.value;

    // Hash le mot de passe entré et comparer avec le hash stocké
    const enteredHash = await sha256(enteredPassword);
    const expectedHash = window.APP_CONFIG?.security?.passwordHash;

    if (enteredHash === expectedHash) {
        // Mot de passe correct
        isPasswordValidated = true;
        savePasswordValidation(); // Sauvegarder avec timestamp
        hidePasswordModal();

        // Message de succès avec durée
        const durationMinutes = window.APP_CONFIG?.security?.passwordDuration || 30;
        showToast(`✓ Accès autorisé au mode Sonnet Pro (${durationMinutes} min)`, 'success');

        // Forcer le modèle sur Sonnet
        const modelSelect = document.getElementById('modelSelect');
        if (modelSelect) {
            modelSelect.value = 'sonnet';
            selectedModel = 'sonnet';
        }
    } else {
        // Mot de passe incorrect - Basculer en mode Cleaning
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
    hidePasswordModal();
    switchToCleaningMode();
}

/**
 * Bascule automatiquement en mode Cleaning (sans coût API)
 */
function switchToCleaningMode() {
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

    // Si on passe de Cleaning à Sonnet et que le mode privé est activé
    if (previousModel === 'cleaning' && newModel === 'sonnet') {
        if (shouldShowPasswordModal()) {
            showPasswordModal();
        }
    }

    // Si on passe à Cleaning, réinitialiser la validation
    if (newModel === 'cleaning') {
        clearPasswordValidation();
    }
}

/**
 * Intercepte la soumission du formulaire pour vérifier l'accès
 */
function handleFormSubmit(event) {
    // Si mode Sonnet sélectionné et mode privé activé
    if (selectedModel === 'sonnet' && window.APP_CONFIG?.security?.privateMode) {
        if (!isPasswordValidated) {
            event.preventDefault();
            showPasswordModal();
            return false;
        }
    }

    return true;
}

// Initialisation au chargement de la page
document.addEventListener('DOMContentLoaded', () => {
    // Récupérer le modèle sélectionné
    const modelSelect = document.getElementById('modelSelect');
    if (modelSelect) {
        selectedModel = modelSelect.value;

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
