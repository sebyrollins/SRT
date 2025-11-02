<?php
/**
 * Fichier de test PHP
 * À supprimer après vérification
 */

echo "✅ PHP fonctionne !<br>";
echo "Version PHP : " . phpversion() . "<br>";
echo "Mémoire disponible : " . ini_get('memory_limit') . "<br>";
echo "Upload max : " . ini_get('upload_max_filesize') . "<br>";
echo "Post max : " . ini_get('post_max_size') . "<br>";
echo "<br>";

// Test de config.php
if (file_exists(__DIR__ . '/lib/config.php')) {
    echo "✅ config.php trouvé<br>";
    require_once __DIR__ . '/lib/config.php';
    echo "Worker URL : " . WORKER_URL . "<br>";
} else {
    echo "❌ config.php non trouvé<br>";
}

echo "<br>";

// Test de functions.php
if (file_exists(__DIR__ . '/lib/functions.php')) {
    echo "✅ functions.php trouvé<br>";
} else {
    echo "❌ functions.php non trouvé<br>";
}

echo "<br>";

// Test du dossier logs
if (file_exists(__DIR__ . '/../logs')) {
    echo "✅ Dossier logs existe<br>";
    if (is_writable(__DIR__ . '/../logs')) {
        echo "✅ Dossier logs accessible en écriture<br>";
    } else {
        echo "⚠️ Dossier logs NON accessible en écriture<br>";
    }
} else {
    echo "❌ Dossier logs n'existe pas<br>";
}

echo "<br><hr><br>";
echo "<strong>Si tout est vert ci-dessus, le problème vient d'ailleurs.</strong><br>";
echo "<strong>Si vous voyez ce message, PHP 8.4 fonctionne correctement !</strong>";
