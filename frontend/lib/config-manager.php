<?php
/**
 * Gestionnaire de configuration pour le mode privé et la sécurité
 */

declare(strict_types=1);

// Fichier de configuration
define('CONFIG_FILE', __DIR__ . '/../data/app-config.json');

/**
 * Charge la configuration de l'application
 */
function loadAppConfig(): array {
    // Configuration par défaut
    $defaultConfig = [
        'private_mode' => false,
        'password' => '1974',
        'last_updated' => null
    ];

    // Si le fichier n'existe pas, créer avec valeurs par défaut
    if (!file_exists(CONFIG_FILE)) {
        $dir = dirname(CONFIG_FILE);
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        saveAppConfig($defaultConfig);
        return $defaultConfig;
    }

    // Charger le fichier
    $content = file_get_contents(CONFIG_FILE);
    if ($content === false) {
        return $defaultConfig;
    }

    $config = json_decode($content, true);
    if (!is_array($config)) {
        return $defaultConfig;
    }

    // Merger avec les valeurs par défaut pour garantir toutes les clés
    return array_merge($defaultConfig, $config);
}

/**
 * Sauvegarde la configuration
 */
function saveAppConfig(array $config): bool {
    $dir = dirname(CONFIG_FILE);
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }

    $config['last_updated'] = date('Y-m-d H:i:s');

    $content = json_encode($config, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

    return file_put_contents(CONFIG_FILE, $content) !== false;
}

/**
 * Vérifie si le mode privé est activé
 */
function isPrivateModeEnabled(): bool {
    $config = loadAppConfig();
    return (bool)($config['private_mode'] ?? false);
}

/**
 * Vérifie le mot de passe
 */
function verifyPassword(string $password): bool {
    $config = loadAppConfig();
    return $password === ($config['password'] ?? '1974');
}

/**
 * Met à jour le mode privé
 */
function updatePrivateMode(bool $enabled): bool {
    $config = loadAppConfig();
    $config['private_mode'] = $enabled;
    return saveAppConfig($config);
}

/**
 * Met à jour le mot de passe
 */
function updatePassword(string $newPassword): bool {
    if (empty($newPassword)) {
        return false;
    }

    $config = loadAppConfig();
    $config['password'] = $newPassword;
    return saveAppConfig($config);
}
