<?php
/**
 * API pour récupérer les règles de vocabulaire
 * Utilisé par le Cloudflare Worker pour synchroniser les règles
 */

// CORS headers pour permettre les appels depuis le Worker
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

// Gestion des requêtes OPTIONS (preflight)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Seules les requêtes GET sont acceptées
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Méthode non autorisée']);
    exit;
}

// Charger les fonctions de vocabulaire
require_once __DIR__ . '/../lib/vocabulary.php';

try {
    // Charger les règles
    $rulesData = loadVocabularyRules();

    // Filtrer uniquement les règles activées
    $enabledRules = array_filter($rulesData['rules'] ?? [], function($rule) {
        return $rule['enabled'] ?? false;
    });

    // Réindexer le tableau
    $enabledRules = array_values($enabledRules);

    // Retourner les règles
    echo json_encode([
        'success' => true,
        'version' => $rulesData['version'] ?? '1.0',
        'lastUpdate' => $rulesData['lastUpdate'] ?? date('c'),
        'rules' => $enabledRules,
        'count' => count($enabledRules)
    ], JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Erreur lors du chargement des règles',
        'message' => $e->getMessage()
    ]);
}
