# Configuration de l'application

Ce dossier contient le fichier de configuration principal de l'application SRT Corrector Pro.

## Fichiers

- **app-config.json** : Configuration principale (créée automatiquement au premier accès)
- **app-config.example.json** : Fichier exemple (versionné)

## Structure de la configuration

```json
{
  "version": "1.0",
  "lastUpdate": "2025-11-16T00:00:00Z",
  "general": {
    "maxFileSize": 200,
    "maintenanceMode": false
  },
  "security": {
    "privateMode": false,
    "password": "1974"
  },
  "worker": {
    "url": "https://votre-worker.workers.dev"
  },
  "prompts": {
    "pass1": "...",
    "pass2": "...",
    "pass3": "...",
    "pass4": "..."
  }
}
```

## Configuration via l'interface admin

Accédez à `/admin/config.php` pour modifier la configuration via l'interface graphique :

- **Paramètres généraux** : Taille max fichier, mode maintenance
- **Sécurité** : Mode privé, mot de passe
- **Worker** : URL du Worker Cloudflare
- **Prompts** : Instructions pour les 4 passes de correction

## Permissions

Assurez-vous que le serveur web a les droits d'écriture :

```bash
chmod 755 frontend/config/
```

## Sécurité

- Le fichier `app-config.json` est ignoré par Git
- Seul le fichier exemple est versionné
- Le mot de passe est hashé côté client (SHA-256) lors de la validation
