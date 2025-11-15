<?php
/**
 * Page de configuration de l'application
 * Gestion de l'URL du worker et des prompts de chaque passe
 */

// Démarrer la session
session_start();

// Vérifier l'authentification
if (!isset($_SESSION['admin_authenticated']) || $_SESSION['admin_authenticated'] !== true) {
    header('Location: index.php');
    exit;
}

$configFile = __DIR__ . '/../config/app-config.json';
$message = '';
$messageType = '';

// Récupérer les prompts par défaut du worker
function getDefaultPrompts() {
    return [
        'pass1' => 'Corrige les sous-titres comme un professionnel de l\'orthographe, conjugaison, grammaire et typographie, tout en respectant le parlé de la personne dans ce fichier SRT.

Format de réponse JSON :
{
  "blocks": [
    {
      "index": 1,
      "original": "texte EXACT du bloc (non modifié)",
      "corrected": "texte du bloc avec TOUTES les corrections APPLIQUÉES",
      "corrections": [
        {"type": "fault", "original": "rendez vous", "corrected": "rendez-vous", "reason": "Tiret manquant"}
      ]
    }
  ]
}

IMPORTANT:
- "original" = texte tel quel, sans rien changer
- "corrected" = texte avec TOUTES les fautes corrigées
- "corrections" = liste des corrections individuelles

Types : "fault" (faute à corriger), "doubt" (ambiguïté)
Si aucune correction dans un bloc, ne pas inclure le bloc dans la réponse.',

        'pass2' => 'Tu reçois un texte DÉJÀ CORRIGÉ.
Applique ces règles :

1. INSTITUTIONS :
   ✗ le gouvernement, l\'assemblée nationale, le sénat, le parlement
   ✓ le Gouvernement, l\'Assemblée nationale, le Sénat, le Parlement

2. ESPACES MILLIERS + ORDINAUX :
   ✗ 10000, 1000e
   ✓ 10 000, 1 000 e

3. TRAITS D\'UNION :
   ✗ au dela, par dessus, rendez vous, au dessus, en dessous
   ✓ au-delà, par-dessus, rendez-vous, au-dessus, en-dessous

4. MAJUSCULES ABUSIVES :
   ✗ la Plaque, le Bâtiment
   ✓ la plaque, le bâtiment

Format JSON :
{
  "blocks": [
    {
      "index": 1,
      "original": "texte reçu",
      "corrected": "texte corrigé",
      "corrections": [
        {"type": "fault", "original": "le gouvernement", "corrected": "le Gouvernement", "reason": "Institution"},
        {"type": "fault", "original": "au dela", "corrected": "au-delà", "reason": "Trait d\'union manquant"},
        {"type": "fault", "original": "10000", "corrected": "10 000", "reason": "Espace milliers"}
      ]
    }
  ]
}

IMPORTANT : Toutes les corrections sont de type "fault"',

        'pass3' => 'Tu reçois un texte DÉJÀ CORRIGÉ.
Applique CES DEUX règles :

1. MINISTÈRES :
   Quand tu vois "ministère de/du..." :
   - "ministère" en minuscule
   - "de", "du", "des", "de la", "de l\'" en minuscule
   - MAJUSCULE première lettre de tous les autres mots

   ✗ ministère de l\'écologie et des territoires
   ✓ ministère de l\'Écologie et des Territoires

2. MONSIEUR / MADAME / MADEMOISELLE :
   Dans un discours oral (SRT), minuscule sauf début de phrase

   ✗ Bonjour Monsieur, Merci Madame, Mesdames et Messieurs
   ✓ Bonjour monsieur, Merci madame, Mesdames et messieurs

   ✗ Monsieur le président, Monsieur le Président
   ✓ Monsieur le président, monsieur le Président

Format JSON :
{
  "blocks": [
    {
      "index": 1,
      "original": "texte reçu",
      "corrected": "texte corrigé",
      "corrections": [
        {"type": "fault", "original": "...", "corrected": "...", "reason": "..."}
      ]
    }
  ]
}

IMPORTANT : Toutes les corrections sont de type "fault"',

        'pass4' => 'Tu corriges des sous-titres français.

RÈGLE UNIQUE À APPLIQUER :
Quand tu vois "je" + verbe d\'état (être, devenir, rester, paraître, sembler, etc.) + adjectif/participe passé accordable,
tu DOIS créer UNE SEULE correction de type "doubt" qui englobe TOUTE l\'expression "je + verbe + adjectif".

IMPORTANT : Ne crée qu\'UNE SEULE correction par ambiguïté détectée, pas plusieurs variations du même cas.

POURQUOI ? Dans un sous-titre, on ne sait pas si "je" est un homme ou une femme.

EXEMPLES :
- "je suis venu" → corrected: "je suis venu", alternative: "je suis venue"
- "je suis engagée" → corrected: "je suis engagée", alternative: "je suis engagé"
- "je reste très attachée" → corrected: "je reste très attachée", alternative: "je reste très attaché"
- "je ne suis plus compétitrice" → corrected: "je ne suis plus compétitrice", alternative: "je ne suis plus compétiteur"
- "Je semble perdue" → corrected: "Je semble perdue", alternative: "Je semble perdu"

FORMAT DE RÉPONSE :
{
  "blocks": [
    {
      "index": 1,
      "original": "texte exact reçu",
      "corrected": "texte exact reçu",
      "corrections": [
        {
          "type": "doubt",
          "original": "je suis venu",
          "corrected": "je suis venu",
          "alternative": "je suis venue",
          "reason": "Genre du locuteur inconnu"
        }
      ]
    }
  ]
}

NOTES :
- "corrected" doit être identique à "original" (forme du texte)
- "alternative" doit contenir l\'autre forme de genre
- Si aucune ambiguïté trouvée : {"blocks": []}'
    ];
}

// Charger la configuration actuelle
function loadConfig() {
    global $configFile;
    if (file_exists($configFile)) {
        $content = file_get_contents($configFile);
        $config = json_decode($content, true);

        // Si les prompts sont vides, initialiser avec les valeurs par défaut
        $defaultPrompts = getDefaultPrompts();
        if (!isset($config['prompts']) || empty($config['prompts'])) {
            $config['prompts'] = $defaultPrompts;
        } else {
            // Vérifier chaque prompt individuellement
            foreach (['pass1', 'pass2', 'pass3', 'pass4'] as $pass) {
                if (!isset($config['prompts'][$pass]) || empty($config['prompts'][$pass])) {
                    $config['prompts'][$pass] = $defaultPrompts[$pass];
                }
            }
        }

        return $config;
    }
    return null;
}

// Sauvegarder la configuration
function saveConfig($config) {
    global $configFile;
    $config['lastUpdate'] = date('c');
    $json = json_encode($config, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    return file_put_contents($configFile, $json) !== false;
}

$config = loadConfig();

// Traiter la sauvegarde
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['save_config'])) {
    // Paramètres généraux
    if (!isset($config['general'])) {
        $config['general'] = [];
    }
    $config['general']['maxFileSize'] = intval($_POST['max_file_size'] ?? 200);
    $config['general']['maintenanceMode'] = isset($_POST['maintenance_mode']) && $_POST['maintenance_mode'] === '1';

    // Worker
    $config['worker']['url'] = $_POST['worker_url'] ?? '';

    // Prompts
    $config['prompts']['pass1'] = $_POST['prompt_pass1'] ?? '';
    $config['prompts']['pass2'] = $_POST['prompt_pass2'] ?? '';
    $config['prompts']['pass3'] = $_POST['prompt_pass3'] ?? '';
    $config['prompts']['pass4'] = $_POST['prompt_pass4'] ?? '';

    if (saveConfig($config)) {
        $message = 'Configuration sauvegardée avec succès !';
        $messageType = 'success';
    } else {
        $message = 'Erreur lors de la sauvegarde de la configuration.';
        $messageType = 'error';
    }
}

// Valeurs par défaut si pas de config
if (!$config) {
    $defaultPrompts = getDefaultPrompts();
    $config = [
        'version' => '1.0',
        'general' => [
            'maxFileSize' => 200,
            'maintenanceMode' => false
        ],
        'worker' => [
            'url' => 'https://srt-corrector-worker.sraynal.workers.dev'
        ],
        'prompts' => $defaultPrompts
    ];
}

// S'assurer que les paramètres généraux existent
if (!isset($config['general'])) {
    $config['general'] = [
        'maxFileSize' => 200,
        'maintenanceMode' => false
    ];
}
?>
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Configuration - Admin</title>
    <link rel="stylesheet" href="../assets/css/style.css">
    <link rel="stylesheet" href="../assets/css/admin.css">
    <style>
        .config-container {
            max-width: 1200px;
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

        .btn-success {
            background: #10b981;
            color: white;
        }

        .btn-success:hover {
            background: #059669;
        }

        .config-section {
            background: white;
            border-radius: 8px;
            padding: 2rem;
            margin-bottom: 2rem;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .config-section h2 {
            margin-top: 0;
            margin-bottom: 1.5rem;
            color: var(--color-text-primary, #1f2937);
            font-size: 1.25rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
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
        .form-group textarea {
            width: 100%;
            padding: 0.75rem;
            border: 1px solid var(--color-border, #d1d5db);
            border-radius: 4px;
            font-size: 1rem;
            font-family: inherit;
        }

        .form-group textarea {
            min-height: 250px;
            resize: vertical;
            font-family: 'Courier New', monospace;
            font-size: 0.875rem;
            line-height: 1.6;
        }

        .form-group small {
            display: block;
            margin-top: 0.25rem;
            color: var(--color-text-secondary, #6b7280);
            font-size: 0.875rem;
        }

        .message {
            padding: 1rem 1.5rem;
            border-radius: 6px;
            margin-bottom: 1.5rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .message.success {
            background: #f0fdf4;
            color: #166534;
            border: 1px solid #bbf7d0;
        }

        .message.error {
            background: #fef2f2;
            color: #991b1b;
            border: 1px solid #fecaca;
        }

        .info-box {
            background: #eff6ff;
            border-left: 4px solid var(--color-primary, #4f46e5);
            padding: 1rem;
            border-radius: 4px;
            margin-top: 1rem;
        }

        .info-box p {
            margin: 0.5rem 0;
            color: #1e40af;
            font-size: 0.875rem;
        }

        .save-section {
            position: sticky;
            bottom: 2rem;
            background: white;
            padding: 1.5rem;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
    </style>
</head>
<body>
    <div class="config-container">
        <div class="config-header">
            <h1>⚙️ Configuration de l'application</h1>
            <div style="display: flex; gap: 1rem;">
                <a href="index.php" class="btn btn-secondary">← Retour</a>
            </div>
        </div>

        <?php if ($message): ?>
            <div class="message <?php echo $messageType; ?>">
                <?php if ($messageType === 'success'): ?>
                    ✅ <?php echo htmlspecialchars($message); ?>
                <?php else: ?>
                    ❌ <?php echo htmlspecialchars($message); ?>
                <?php endif; ?>
            </div>
        <?php endif; ?>

        <form method="POST">
            <!-- Section Paramètres généraux -->
            <div class="config-section">
                <h2>⚙️ Paramètres généraux</h2>

                <div class="form-group">
                    <label for="max_file_size">Taille maximale des fichiers SRT (en Ko)</label>
                    <input
                        type="number"
                        id="max_file_size"
                        name="max_file_size"
                        min="1"
                        max="200"
                        value="<?php echo htmlspecialchars($config['general']['maxFileSize'] ?? 200); ?>"
                        required
                    >
                    <small>La taille maximale autorisée pour les fichiers SRT uploadés (entre 1 et 200 Ko)</small>
                </div>

                <div class="form-group">
                    <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                        <input
                            type="checkbox"
                            id="maintenance_mode"
                            name="maintenance_mode"
                            value="1"
                            <?php echo ($config['general']['maintenanceMode'] ?? false) ? 'checked' : ''; ?>
                            style="width: auto; cursor: pointer;"
                        >
                        <span>Activer le mode maintenance</span>
                    </label>
                    <small style="margin-left: 1.75rem;">
                        Lorsque activé, affiche un message de maintenance aux utilisateurs et désactive le traitement des fichiers
                    </small>
                </div>

                <div class="info-box">
                    <p><strong>ℹ️ Mode maintenance :</strong> Utilisez cette option pour effectuer des mises à jour sans perturber les utilisateurs.</p>
                    <p>Un message clair sera affiché sur la page d'accueil indiquant que le site est temporairement indisponible.</p>
                </div>
            </div>

            <!-- Section Worker -->
            <div class="config-section">
                <h2>🔗 Configuration du Worker Cloudflare</h2>
                <div class="form-group">
                    <label for="worker_url">URL du Worker</label>
                    <input
                        type="text"
                        id="worker_url"
                        name="worker_url"
                        value="<?php echo htmlspecialchars($config['worker']['url'] ?? ''); ?>"
                        placeholder="https://srt-corrector-worker.sraynal.workers.dev"
                        required
                    >
                    <small>L'URL complète de votre Worker Cloudflare qui traite les corrections</small>
                </div>
                <div class="info-box">
                    <p><strong>ℹ️ Note :</strong> Cette URL doit pointer vers votre Worker Cloudflare déployé.</p>
                    <p>Pour déployer : <code>cd cloudflare-worker && wrangler deploy</code></p>
                </div>
            </div>

            <!-- Section Prompts -->
            <div class="config-section">
                <h2>💬 Prompts des passes de correction</h2>
                <p style="color: var(--color-text-secondary, #6b7280); margin-bottom: 1.5rem;">
                    Configurez les instructions système (prompts) envoyées à Claude pour chaque passe de correction.
                </p>

                <div class="form-group">
                    <label for="prompt_pass1">Pass 1 : Corrections naturelles (orthographe, grammaire, typographie)</label>
                    <textarea
                        id="prompt_pass1"
                        name="prompt_pass1"
                        required
                    ><?php echo htmlspecialchars($config['prompts']['pass1'] ?? ''); ?></textarea>
                    <small>Correction générale du français : orthographe, conjugaison, grammaire</small>
                </div>

                <div class="form-group">
                    <label for="prompt_pass2">Pass 2 : Institutions + Formatage</label>
                    <textarea
                        id="prompt_pass2"
                        name="prompt_pass2"
                        required
                    ><?php echo htmlspecialchars($config['prompts']['pass2'] ?? ''); ?></textarea>
                    <small>Majuscules des institutions, espaces milliers, traits d'union</small>
                </div>

                <div class="form-group">
                    <label for="prompt_pass3">Pass 3 : Ministères + Formules de politesse</label>
                    <textarea
                        id="prompt_pass3"
                        name="prompt_pass3"
                        required
                    ><?php echo htmlspecialchars($config['prompts']['pass3'] ?? ''); ?></textarea>
                    <small>Capitalisation des ministères et usage de monsieur/madame</small>
                </div>

                <div class="form-group">
                    <label for="prompt_pass4">Pass 4 : Ambiguïté de genre</label>
                    <textarea
                        id="prompt_pass4"
                        name="prompt_pass4"
                        required
                    ><?php echo htmlspecialchars($config['prompts']['pass4'] ?? ''); ?></textarea>
                    <small>Détection des accords ambigus (je suis venu/venue)</small>
                </div>

                <div class="info-box">
                    <p><strong>⚠️ Important :</strong> Les prompts doivent respecter le format JSON attendu par le Worker.</p>
                    <p>Testez vos modifications sur un fichier de test avant de les déployer en production.</p>
                </div>
            </div>

            <!-- Bouton de sauvegarde fixe -->
            <div class="save-section">
                <span style="color: var(--color-text-secondary, #6b7280);">
                    Dernière modification : <?php echo isset($config['lastUpdate']) ? date('d/m/Y H:i', strtotime($config['lastUpdate'])) : 'Jamais'; ?>
                </span>
                <button type="submit" name="save_config" class="btn btn-success">
                    💾 Enregistrer la configuration
                </button>
            </div>
        </form>
    </div>
</body>
</html>
