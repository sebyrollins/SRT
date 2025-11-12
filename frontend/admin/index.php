<?php
/**
 * Page d'administration principale
 * Point d'entrée avec authentification pour accéder aux outils d'administration
 */

// Démarrer la session
session_start();

// Configuration de l'authentification
$ADMIN_PASSWORD = getenv('ADMIN_PASSWORD') ?: 'admin123'; // Par défaut, à changer en production !

// Vérification de l'authentification
$isAuthenticated = false;

// Vérifier si l'utilisateur est déjà authentifié dans la session
if (isset($_SESSION['admin_authenticated']) && $_SESSION['admin_authenticated'] === true) {
    $isAuthenticated = true;
}
// Sinon, vérifier les credentials HTTP Basic Auth
elseif (isset($_SERVER['PHP_AUTH_PW']) && $_SERVER['PHP_AUTH_PW'] === $ADMIN_PASSWORD) {
    $_SESSION['admin_authenticated'] = true;
    $isAuthenticated = true;
}
// Sinon, vérifier un POST de formulaire
elseif ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['password'])) {
    if ($_POST['password'] === $ADMIN_PASSWORD) {
        $_SESSION['admin_authenticated'] = true;
        $isAuthenticated = true;
    } else {
        $loginError = 'Mot de passe incorrect';
    }
}

// Gérer la déconnexion
if (isset($_GET['logout'])) {
    session_destroy();
    header('Location: index.php');
    exit;
}

// Si non authentifié, afficher le formulaire de connexion
if (!$isAuthenticated) {
    ?>
    <!DOCTYPE html>
    <html lang="fr">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Administration - SRT Corrector Pro</title>
        <link rel="stylesheet" href="../assets/css/style.css">
        <style>
            .login-container {
                max-width: 400px;
                margin: 100px auto;
                padding: 2rem;
                background: var(--color-bg-secondary, #f9fafb);
                border-radius: 8px;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            .login-header {
                text-align: center;
                margin-bottom: 2rem;
            }
            .login-header h1 {
                color: var(--color-primary, #4f46e5);
                margin-bottom: 0.5rem;
            }
            .login-form {
                display: flex;
                flex-direction: column;
                gap: 1rem;
            }
            .form-group {
                display: flex;
                flex-direction: column;
                gap: 0.5rem;
            }
            .form-group label {
                font-weight: 600;
                color: var(--color-text-primary, #1f2937);
            }
            .form-group input {
                padding: 0.75rem;
                border: 1px solid var(--color-border, #d1d5db);
                border-radius: 4px;
                font-size: 1rem;
            }
            .btn-login {
                padding: 0.75rem;
                background: var(--color-primary, #4f46e5);
                color: white;
                border: none;
                border-radius: 4px;
                font-size: 1rem;
                font-weight: 600;
                cursor: pointer;
                transition: background 0.2s;
            }
            .btn-login:hover {
                background: var(--color-primary-dark, #4338ca);
            }
            .error-message {
                padding: 0.75rem;
                background: #fef2f2;
                color: #991b1b;
                border: 1px solid #fecaca;
                border-radius: 4px;
                font-size: 0.875rem;
            }
        </style>
    </head>
    <body>
        <div class="login-container">
            <div class="login-header">
                <h1>🔐 Administration</h1>
                <p>SRT Corrector Pro</p>
            </div>

            <?php if (isset($loginError)): ?>
                <div class="error-message">
                    <?php echo htmlspecialchars($loginError); ?>
                </div>
            <?php endif; ?>

            <form method="POST" class="login-form">
                <div class="form-group">
                    <label for="password">Mot de passe :</label>
                    <input
                        type="password"
                        id="password"
                        name="password"
                        required
                        autofocus
                        placeholder="Entrez le mot de passe admin"
                    >
                </div>
                <button type="submit" class="btn-login">Se connecter</button>
            </form>

            <div style="margin-top: 2rem; text-align: center; font-size: 0.875rem; color: #6b7280;">
                <p><strong>Configuration :</strong> Définir la variable d'environnement <code>ADMIN_PASSWORD</code></p>
            </div>
        </div>
    </body>
    </html>
    <?php
    exit;
}
?>
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Administration - SRT Corrector Pro</title>
    <link rel="stylesheet" href="../assets/css/style.css">
    <style>
        .admin-container {
            max-width: 1200px;
            margin: 2rem auto;
            padding: 2rem;
        }
        .admin-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 2rem;
            padding-bottom: 1rem;
            border-bottom: 2px solid var(--color-border, #e5e7eb);
        }
        .admin-header h1 {
            color: var(--color-primary, #4f46e5);
            margin: 0;
        }
        .btn-logout {
            padding: 0.5rem 1rem;
            background: #ef4444;
            color: white;
            text-decoration: none;
            border-radius: 4px;
            font-weight: 600;
            transition: background 0.2s;
        }
        .btn-logout:hover {
            background: #dc2626;
        }
        .admin-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 2rem;
            margin-top: 2rem;
        }
        .admin-card {
            padding: 2rem;
            background: var(--color-bg-secondary, #f9fafb);
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .admin-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 8px 16px rgba(0, 0, 0, 0.15);
        }
        .admin-card-icon {
            font-size: 3rem;
            margin-bottom: 1rem;
        }
        .admin-card h2 {
            color: var(--color-text-primary, #1f2937);
            margin-bottom: 1rem;
        }
        .admin-card p {
            color: var(--color-text-secondary, #6b7280);
            margin-bottom: 1.5rem;
            line-height: 1.6;
        }
        .admin-card-link {
            display: inline-block;
            padding: 0.75rem 1.5rem;
            background: var(--color-primary, #4f46e5);
            color: white;
            text-decoration: none;
            border-radius: 4px;
            font-weight: 600;
            transition: background 0.2s;
        }
        .admin-card-link:hover {
            background: var(--color-primary-dark, #4338ca);
        }
        .admin-info {
            margin-top: 2rem;
            padding: 1.5rem;
            background: #eff6ff;
            border-left: 4px solid var(--color-primary, #4f46e5);
            border-radius: 4px;
        }
        .admin-info h3 {
            color: var(--color-primary, #4f46e5);
            margin-top: 0;
            margin-bottom: 0.5rem;
        }
        .admin-info ul {
            margin: 0.5rem 0;
            padding-left: 1.5rem;
        }
        .admin-info li {
            margin: 0.25rem 0;
            color: var(--color-text-secondary, #4b5563);
        }
    </style>
</head>
<body>
    <div class="admin-container">
        <div class="admin-header">
            <h1>🛠️ Administration SRT Corrector Pro</h1>
            <a href="?logout=1" class="btn-logout">Déconnexion</a>
        </div>

        <div class="admin-grid">
            <div class="admin-card">
                <div class="admin-card-icon">📚</div>
                <h2>Gestion du vocabulaire</h2>
                <p>
                    Gérez les règles de correction de vocabulaire pour la Pass 5.
                    Ajoutez, modifiez ou supprimez des règles de correction automatique
                    basées sur des variantes, regex ou recherche souple.
                </p>
                <a href="vocabulary.php" class="admin-card-link">Ouvrir l'éditeur</a>
            </div>

            <div class="admin-card">
                <div class="admin-card-icon">📊</div>
                <h2>Statistiques</h2>
                <p>
                    Consultez les statistiques d'utilisation de l'application,
                    les règles les plus utilisées et les performances des différentes passes de correction.
                </p>
                <a href="#" class="admin-card-link" style="background: #9ca3af; cursor: not-allowed;">Bientôt disponible</a>
            </div>

            <div class="admin-card">
                <div class="admin-card-icon">⚙️</div>
                <h2>Configuration</h2>
                <p>
                    Paramétrez l'application : URL du worker, limites de fichiers,
                    options de correction et autres paramètres globaux.
                </p>
                <a href="#" class="admin-card-link" style="background: #9ca3af; cursor: not-allowed;">Bientôt disponible</a>
            </div>
        </div>

        <div class="admin-info">
            <h3>ℹ️ Informations</h3>
            <ul>
                <li><strong>Version :</strong> 1.0</li>
                <li><strong>Environnement :</strong> Production</li>
                <li><strong>Worker URL :</strong> <?php echo htmlspecialchars(defined('WORKER_URL') ? WORKER_URL : 'Non configuré'); ?></li>
                <li><strong>Fichier de règles :</strong> <code>/frontend/config/vocabulary-rules.json</code></li>
            </ul>
        </div>

        <div style="margin-top: 2rem; text-align: center;">
            <a href="../index.php" style="color: var(--color-primary, #4f46e5); text-decoration: none; font-weight: 600;">
                ← Retour à l'application principale
            </a>
        </div>
    </div>
</body>
</html>
