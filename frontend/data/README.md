# Dossier de configuration

Ce dossier contient les fichiers de configuration de l'application SRT Corrector Pro.

## Fichiers

- **app-config.json** : Configuration de sécurité (mode privé et mot de passe)
  - Créé automatiquement au premier accès
  - Modifiable via `/admin/config.php`
  - **NON versionné** (sécurité)

## Configuration par défaut

```json
{
  "private_mode": false,
  "password": "1974",
  "last_updated": null
}
```

## Permissions

Assurez-vous que le serveur web a les droits d'écriture sur ce dossier :

```bash
chmod 755 /path/to/frontend/data
```

## Sécurité

- Les fichiers JSON sont ignorés par Git (`.gitignore`)
- Le mot de passe est hashé côté client (SHA-256)
- Le mode privé protège uniquement le mode "Sonnet Pro" (appels API)
