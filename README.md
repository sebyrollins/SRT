# SRT Corrector Pro

Application professionnelle de correction de fichiers SRT (sous-titres) utilisant l'IA Claude Sonnet 4.

## 🎯 Fonctionnalités

- ✅ Correction orthographique, grammaticale et de ponctuation
- ✅ Respect des règles typographiques françaises
- ✅ Catégorisation des corrections (mineures, majeures, doutes)
- ✅ Interface de validation intuitive
- ✅ Export SRT et TXT
- ✅ Design moderne et responsive

## 📋 Prérequis

### Backend (OVH)
- Hébergement mutualisé OVH (100 Mo minimum)
- PHP 8.4 (compatible PHP 8.0+)
- Accès FTP

### Cloudflare Worker
- Compte Cloudflare (payant ~5€/mois recommandé)
- Accès à l'API Claude (clé API Anthropic)
- Node.js et npm (pour le déploiement)

## 🚀 Installation

### 1. Déploiement du Cloudflare Worker

#### a. Installer Wrangler CLI

```bash
npm install -g wrangler
```

#### b. Se connecter à Cloudflare

```bash
wrangler login
```

#### c. Déployer le Worker

```bash
cd cloudflare-worker
wrangler deploy
```

#### d. Configurer la clé API Claude

1. Aller sur le dashboard Cloudflare : https://dash.cloudflare.com
2. Naviguer vers **Workers & Pages**
3. Cliquer sur votre worker `srt-corrector-worker`
4. Aller dans **Settings** > **Variables**
5. Ajouter une nouvelle variable :
   - **Nom** : `ANTHROPIC_API_KEY`
   - **Type** : Secret
   - **Valeur** : Votre clé API Claude (obtenir sur https://console.anthropic.com)
6. Cliquer sur **Save**

#### e. Noter l'URL du Worker

Après déploiement, notez l'URL affichée (format : `https://srt-corrector-worker.VOTRE-SUBDOMAIN.workers.dev`)

### 2. Configuration du Frontend

#### a. Modifier la configuration

Éditer le fichier `frontend/lib/config.php` :

```php
// Ligne 7 - Remplacer par l'URL de votre Worker
define('WORKER_URL', 'https://srt-corrector-worker.VOTRE-SUBDOMAIN.workers.dev');
```

### 3. Upload sur OVH

#### a. Structure sur le serveur

Uploader le contenu du dossier `frontend/` vers votre serveur OVH dans le dossier `st/` :

```
www.rollins.ovh/
└── st/
    ├── index.php
    ├── lib/
    │   ├── config.php
    │   └── functions.php
    ├── assets/
    │   ├── css/
    │   │   └── style.css
    │   └── js/
    │       ├── app.js
    │       └── srt-parser.js
    └── logs/          (créer ce dossier, permissions 755)
```

#### b. Permissions

Assurez-vous que le dossier `logs/` est accessible en écriture :

```bash
chmod 755 logs/
```

### 4. Configuration des CORS (si nécessaire)

Si vous rencontrez des erreurs CORS, ajouter un fichier `.htaccess` à la racine du dossier `st/` :

```apache
# Autoriser les requêtes cross-origin
Header set Access-Control-Allow-Origin "*"
Header set Access-Control-Allow-Methods "GET, POST, OPTIONS"
Header set Access-Control-Allow-Headers "Content-Type"
```

## 🎨 Utilisation

1. Accéder à : `https://www.rollins.ovh/st/`
2. Cliquer sur **Parcourir** et sélectionner un fichier SRT (max 50 Ko)
3. Cliquer sur **Corriger le fichier**
4. Attendre le traitement (quelques secondes à 1 minute)
5. Valider les corrections :
   - **Mineures (bleu)** : validées automatiquement
   - **Majeures (vert)** : corrections sûres à valider
   - **Doutes (orange)** : corrections ambiguës à vérifier
6. Télécharger le fichier corrigé :
   - **SRT** : fichier avec timecodes (nom_SR.srt)
   - **TXT** : texte brut sans timecodes

## 📊 Statistiques

Le bandeau en haut de l'éditeur affiche :
- **Total** : nombre total de corrections
- **Mineures** : corrections automatiques (apostrophes, espaces, etc.)
- **Majeures** : corrections importantes mais sûres
- **Doutes** : corrections à vérifier manuellement

## 🔧 Configuration avancée

### Augmenter la limite de taille de fichier

Éditer `frontend/lib/config.php` :

```php
// Ligne 10 - Changer de 50 Ko à 100 Ko
define('MAX_FILE_SIZE', 100 * 1024);
```

### Activer les quotas (future fonctionnalité)

Les fonctions sont prêtes dans `functions.php` :
- `initDatabase()` : initialiser une base de données
- `checkQuota()` : vérifier les quotas utilisateur

### Changer le modèle Claude

Éditer `cloudflare-worker/worker.js` ligne 181 :

```javascript
// Utiliser Haiku (moins cher mais moins performant)
model: 'claude-haiku-4-20250514'

// Utiliser Sonnet 4 (recommandé)
model: 'claude-sonnet-4-20250514'
```

## 🐛 Dépannage

### Le Worker ne répond pas

1. Vérifier que la clé API est bien configurée dans Cloudflare
2. Vérifier les logs du Worker : Dashboard Cloudflare > Workers > Logs
3. Tester l'URL du Worker directement dans un navigateur

### Erreur "Erreur serveur: 500"

1. Vérifier que l'URL du Worker est correcte dans `config.php`
2. Vérifier que la clé API Claude est valide
3. Consulter les logs : `frontend/logs/error.log`

### Le fichier ne s'upload pas

1. Vérifier la taille du fichier (< 50 Ko)
2. Vérifier que c'est bien un fichier `.srt`
3. Vérifier les permissions du dossier temporaire PHP

### Erreurs de CORS

1. Ajouter le fichier `.htaccess` (voir section Configuration)
2. Vérifier que `mod_headers` est activé sur le serveur

## 📝 Structure du code

### Frontend
- **index.php** : Interface principale
- **lib/config.php** : Configuration
- **lib/functions.php** : Fonctions utilitaires PHP
- **assets/css/style.css** : Styles
- **assets/js/app.js** : Logique principale
- **assets/js/srt-parser.js** : Parser et export SRT

### Backend (Cloudflare Worker)
- **worker.js** : Worker principal
- **wrangler.toml** : Configuration Cloudflare

## 🔒 Sécurité

- ✅ Validation des fichiers côté serveur
- ✅ Clé API stockée de manière sécurisée (Cloudflare Secrets)
- ✅ Échappement des données HTML/JS
- ✅ Limite de taille de fichier
- ✅ Logs d'erreurs

## 📈 Évolutions futures

- [ ] Base de données pour historique
- [ ] Système de quotas utilisateur
- [ ] Support multi-fichiers
- [ ] Export en d'autres formats (VTT, etc.)
- [ ] Comparaison avant/après côte à côte
- [ ] Thème sombre

## 📄 Licence

Propriétaire - Tous droits réservés

## 🙋 Support

Pour toute question ou problème :
1. Consulter les logs : `frontend/logs/error.log`
2. Vérifier la console du navigateur (F12)
3. Vérifier les logs du Worker Cloudflare

---

**Powered by Claude AI (Anthropic)**
