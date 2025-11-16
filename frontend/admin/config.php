<?php
/**
 * Page d'administration - Configuration générale
 * Gestion du mode privé et du mot de passe
 */

// Démarrer la session
session_start();

// Vérifier l'authentification (simple pour l'instant)
// TODO: Implémenter un vrai système d'authentification admin si nécessaire
// Pour l'instant, on suppose que l'accès à /admin/ est protégé par .htaccess

// Charger le gestionnaire de configuration
require_once __DIR__ . '/../lib/config-manager.php';

// Gestion de la soumission du formulaire
$message = null;
$messageType = 'success';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';

    if ($action === 'update_config') {
        $privateMode = isset($_POST['private_mode']);
        $newPassword = $_POST['password'] ?? '';

        // Valider le mot de passe
        if (empty($newPassword)) {
            $message = 'Le mot de passe ne peut pas être vide';
            $messageType = 'error';
        } else {
            // Mettre à jour la configuration
            $config = loadAppConfig();
            $config['private_mode'] = $privateMode;
            $config['password'] = $newPassword;

            if (saveAppConfig($config)) {
                $message = 'Configuration sauvegardée avec succès !';
                $messageType = 'success';
            } else {
                $message = 'Erreur lors de la sauvegarde de la configuration';
                $messageType = 'error';
            }
        }
    }
}

// Charger la configuration actuelle
$config = loadAppConfig();
?>
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Configuration - Admin</title>
    <link rel="stylesheet" href="../assets/css/style.css">
    <style>
        .config-container {
            max-width: 800px;
            margin: 2rem auto;
            padding: 2rem;
        }

        .config-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 2rem;
            padding-bottom: 1rem;
            border-bottom: 2px solid var(--color-border, #e5e7eb);
        }

        .config-header h1 {
            color: var(--color-primary, #4f46e5);
            margin: 0;
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

        .config-card {
            background: white;
            border-radius: 8px;
            padding: 2rem;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            margin-bottom: 1.5rem;
        }

        .config-card h2 {
            margin-top: 0;
            color: var(--color-text-primary, #1f2937);
            font-size: 1.25rem;
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
        .form-group input[type="password"] {
            width: 100%;
            padding: 0.75rem;
            border: 1px solid var(--color-border, #d1d5db);
            border-radius: 4px;
            font-size: 1rem;
        }

        .checkbox-wrapper {
            display: flex;
            align-items: flex-start;
            gap: 0.75rem;
            padding: 1rem;
            background: #f9fafb;
            border-radius: 6px;
            border: 2px solid var(--color-border, #e5e7eb);
        }

        .checkbox-wrapper input[type="checkbox"] {
            width: 20px;
            height: 20px;
            margin-top: 2px;
            cursor: pointer;
        }

        .checkbox-content {
            flex: 1;
        }

        .checkbox-content strong {
            display: block;
            margin-bottom: 0.25rem;
            color: var(--color-text-primary, #1f2937);
        }

        .checkbox-content p {
            margin: 0;
            font-size: 0.875rem;
            color: var(--color-text-secondary, #6b7280);
            line-height: 1.5;
        }

        .help-text {
            font-size: 0.875rem;
            color: var(--color-text-secondary, #6b7280);
            margin-top: 0.25rem;
        }

        .alert {
            padding: 1rem 1.25rem;
            border-radius: 6px;
            margin-bottom: 1.5rem;
            display: flex;
            align-items: center;
            gap: 0.75rem;
        }

        .alert-success {
            background: #f0fdf4;
            border: 1px solid #10b981;
            color: #065f46;
        }

        .alert-error {
            background: #fef2f2;
            border: 1px solid #ef4444;
            color: #991b1b;
        }

        .info-box {
            background: #eff6ff;
            border: 1px solid #3b82f6;
            border-radius: 6px;
            padding: 1rem;
            margin-top: 1.5rem;
        }

        .info-box h3 {
            margin: 0 0 0.5rem 0;
            color: #1e40af;
            font-size: 1rem;
        }

        .info-box ul {
            margin: 0.5rem 0 0 1.25rem;
            color: #1e40af;
            font-size: 0.875rem;
        }

        .info-box li {
            margin-bottom: 0.25rem;
        }

        .password-toggle {
            position: relative;
        }

        .password-toggle button {
            position: absolute;
            right: 0.75rem;
            top: 50%;
            transform: translateY(-50%);
            background: none;
            border: none;
            cursor: pointer;
            font-size: 1.25rem;
            padding: 0.25rem;
        }
    </style>
</head>
<body>
    <div class="config-container">
        <div class="config-header">
            <h1>⚙️ Configuration générale</h1>
            <a href="../index.php" class="btn btn-secondary">← Retour à l'application</a>
        </div>

        <?php if ($message): ?>
            <div class="alert alert-<?php echo $messageType; ?>">
                <?php if ($messageType === 'success'): ?>
                    ✓
                <?php else: ?>
                    ⚠️
                <?php endif; ?>
                <?php echo htmlspecialchars($message); ?>
            </div>
        <?php endif; ?>

        <form method="POST">
            <input type="hidden" name="action" value="update_config">

            <div class="config-card">
                <h2>🔒 Sécurité et accès</h2>

                <div class="form-group">
                    <div class="checkbox-wrapper">
                        <input
                            type="checkbox"
                            id="private_mode"
                            name="private_mode"
                            <?php echo $config['private_mode'] ? 'checked' : ''; ?>
                        >
                        <div class="checkbox-content">
                            <strong>Mode privé</strong>
                            <p>
                                Activer la protection par mot de passe pour le mode "Sonnet Pro" afin de préserver les coûts d'API.
                                <br>
                                ℹ️ Le mode "Cleaning - Regex uniquement" reste accessible sans mot de passe (aucun appel API).
                            </p>
                        </div>
                    </div>
                </div>

                <div class="form-group">
                    <label for="password">Mot de passe d'accès :</label>
                    <div class="password-toggle">
                        <input
                            type="password"
                            id="password"
                            name="password"
                            value="<?php echo htmlspecialchars($config['password']); ?>"
                            required
                        >
                        <button type="button" onclick="togglePassword()" title="Afficher/Masquer">👁️</button>
                    </div>
                    <p class="help-text">
                        Ce mot de passe sera demandé à l'ouverture de l'application si le mode privé est activé.
                    </p>
                </div>

                <div class="info-box">
                    <h3>ℹ️ Comment ça fonctionne ?</h3>
                    <ul>
                        <li><strong>Mode privé activé + Modèle Sonnet sélectionné</strong> : Une popup demande le mot de passe</li>
                        <li><strong>Mot de passe correct</strong> : Accès au mode Sonnet (avec appels API)</li>
                        <li><strong>Mot de passe incorrect</strong> : Basculement automatique en mode "Cleaning" (pass 0 et 5, sans coût)</li>
                        <li><strong>Mode Cleaning sélectionné</strong> : Aucune demande de mot de passe (pas d'appel API)</li>
                    </ul>
                </div>

                <button type="submit" class="btn btn-primary">
                    💾 Sauvegarder la configuration
                </button>
            </div>
        </form>

        <div class="config-card">
            <h2>📊 État actuel</h2>
            <table style="width: 100%; border-collapse: collapse;">
                <tr style="border-bottom: 1px solid #e5e7eb;">
                    <td style="padding: 0.75rem 0; font-weight: 600;">Mode privé</td>
                    <td style="padding: 0.75rem 0;">
                        <?php if ($config['private_mode']): ?>
                            <span style="color: #10b981; font-weight: 600;">✓ Activé</span>
                        <?php else: ?>
                            <span style="color: #6b7280;">✗ Désactivé</span>
                        <?php endif; ?>
                    </td>
                </tr>
                <tr style="border-bottom: 1px solid #e5e7eb;">
                    <td style="padding: 0.75rem 0; font-weight: 600;">Mot de passe</td>
                    <td style="padding: 0.75rem 0;">
                        <code style="background: #f3f4f6; padding: 0.25rem 0.5rem; border-radius: 4px;">
                            <?php echo str_repeat('•', strlen($config['password'])); ?>
                        </code>
                    </td>
                </tr>
                <tr>
                    <td style="padding: 0.75rem 0; font-weight: 600;">Dernière mise à jour</td>
                    <td style="padding: 0.75rem 0;">
                        <?php echo $config['last_updated'] ?? 'Jamais'; ?>
                    </td>
                </tr>
            </table>
        </div>
    </div>

    <script>
        function togglePassword() {
            const input = document.getElementById('password');
            input.type = input.type === 'password' ? 'text' : 'password';
        }
    </script>
</body>
</html>
