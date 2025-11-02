<?php
/**
 * Fonctions utilitaires pour l'application SRT Corrector
 * Compatible PHP 8.4
 */

declare(strict_types=1);

require_once __DIR__ . '/config.php';

/**
 * Valide et nettoie un fichier SRT uploadé
 *
 * @param array $file Le fichier depuis $_FILES
 * @return array ['success' => bool, 'message' => string, 'content' => string|null, 'filename' => string|null]
 */
function validateAndCleanSRT($file) {
    // Vérifier qu'un fichier a été uploadé
    if (!isset($file) || $file['error'] !== UPLOAD_ERR_OK) {
        return [
            'success' => false,
            'message' => 'Erreur lors de l\'upload du fichier.',
            'content' => null,
            'filename' => null
        ];
    }

    // Vérifier la taille
    if ($file['size'] > MAX_FILE_SIZE) {
        return [
            'success' => false,
            'message' => 'Le fichier est trop volumineux (max 50 Ko).',
            'content' => null,
            'filename' => null
        ];
    }

    // Vérifier l'extension
    $filename = $file['name'];
    $extension = strtolower(pathinfo($filename, PATHINFO_EXTENSION));

    if (!in_array($extension, ALLOWED_EXTENSIONS)) {
        return [
            'success' => false,
            'message' => 'Seuls les fichiers .srt sont acceptés.',
            'content' => null,
            'filename' => null
        ];
    }

    // Lire le contenu
    $content = file_get_contents($file['tmp_name']);

    if ($content === false) {
        return [
            'success' => false,
            'message' => 'Impossible de lire le fichier.',
            'content' => null,
            'filename' => null
        ];
    }

    // Détecter et convertir l'encodage si nécessaire
    $encoding = mb_detect_encoding($content, ['UTF-8', 'ISO-8859-1', 'Windows-1252', 'ASCII'], true);

    if ($encoding && $encoding !== 'UTF-8') {
        $content = mb_convert_encoding($content, 'UTF-8', $encoding);
    }

    // Nettoyer le contenu
    $content = cleanSRTContent($content);

    // Supprimer le fichier temporaire
    @unlink($file['tmp_name']);

    return [
        'success' => true,
        'message' => 'Fichier validé avec succès.',
        'content' => $content,
        'filename' => $filename
    ];
}

/**
 * Nettoie le contenu SRT
 * - Normalise les sauts de ligne
 * - Supprime les espaces inutiles
 * - Valide la structure
 *
 * @param string $content Le contenu brut
 * @return string Le contenu nettoyé
 */
function cleanSRTContent($content) {
    // Normaliser les retours à la ligne (Windows, Unix, Mac)
    $content = str_replace(["\r\n", "\r"], "\n", $content);

    // Supprimer les espaces en début et fin
    $content = trim($content);

    // Supprimer les lignes vides multiples (garder max 2 \n consécutifs)
    $content = preg_replace("/\n{3,}/", "\n\n", $content);

    // Nettoyer chaque bloc
    $blocks = explode("\n\n", $content);
    $cleanedBlocks = [];

    foreach ($blocks as $block) {
        $lines = explode("\n", trim($block));
        $cleanedLines = [];

        foreach ($lines as $line) {
            // Supprimer les espaces en début/fin de chaque ligne
            $cleanedLine = trim($line);

            if ($cleanedLine !== '') {
                $cleanedLines[] = $cleanedLine;
            }
        }

        if (count($cleanedLines) > 0) {
            $cleanedBlocks[] = implode("\n", $cleanedLines);
        }
    }

    return implode("\n\n", $cleanedBlocks);
}

/**
 * Génère un nom de fichier sécurisé
 *
 * @param string $filename Le nom original
 * @param string $suffix Le suffixe à ajouter (ex: '_SR')
 * @return string Le nom sécurisé
 */
function sanitizeFilename($filename, $suffix = '') {
    $info = pathinfo($filename);
    $basename = $info['filename'];
    $extension = isset($info['extension']) ? $info['extension'] : 'srt';

    // Nettoyer le nom
    $basename = preg_replace('/[^a-zA-Z0-9_-]/', '_', $basename);

    return $basename . $suffix . '.' . $extension;
}

/**
 * Log une erreur dans le fichier de log
 *
 * @param string $message Le message d'erreur
 * @param array $context Contexte additionnel
 */
function logError($message, $context = []) {
    $timestamp = date('Y-m-d H:i:s');
    $contextStr = !empty($context) ? ' | ' . json_encode($context) : '';
    $logMessage = "[{$timestamp}] ERROR: {$message}{$contextStr}\n";

    error_log($logMessage, 3, __DIR__ . '/../../logs/error.log');
}

/**
 * Fonction pour future intégration base de données
 * Prête à être utilisée pour les quotas ou historique
 */
function initDatabase() {
    // À implémenter si besoin
    // $pdo = new PDO("mysql:host=" . DB_HOST . ";dbname=" . DB_NAME, DB_USER, DB_PASS);
    // return $pdo;
}

/**
 * Fonction pour future gestion des quotas
 */
function checkQuota($userId = null) {
    // À implémenter si besoin
    return true; // Pas de limite pour le moment
}
