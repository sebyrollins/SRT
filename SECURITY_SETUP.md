# Configuration de la sécurité - Mode Privé

## Vue d'ensemble

Le système de protection par mot de passe permet de sécuriser l'accès au mode **Sonnet Pro** (qui utilise l'API Claude et génère des coûts) tout en laissant le mode **Cleaning** accessible librement (pas d'appel API, pas de coût).

## Fonctionnement

### 1. Configuration

Accédez à la page de configuration : **`frontend/admin/config.php`**

Options disponibles :
- ☑️ **Mode privé** : Active/désactive la protection par mot de passe
- 🔑 **Mot de passe** : Définir le mot de passe d'accès (par défaut : `1974`)

### 2. Comportement de l'application

#### Mode privé DÉSACTIVÉ
- Accès libre à tous les modèles (Sonnet Pro et Cleaning)
- Aucune demande de mot de passe

#### Mode privé ACTIVÉ
- **Modèle Sonnet sélectionné** :
  - Popup de mot de passe à l'ouverture
  - Popup à chaque changement de Cleaning vers Sonnet

- **Mot de passe CORRECT** :
  - Accès au mode Sonnet Pro
  - Possibilité d'utiliser l'API Claude

- **Mot de passe INCORRECT ou Annulé** :
  - Basculement automatique en mode Cleaning
  - Message informatif affiché
  - Pas d'appel API = pas de coût

- **Modèle Cleaning sélectionné** :
  - Aucune demande de mot de passe
  - Accès libre (pas d'API utilisée)

## Installation

### 1. Fichiers créés

```
frontend/
├── admin/
│   └── config.php              # Page d'administration
├── lib/
│   └── config-manager.php      # Gestionnaire de configuration
├── data/
│   ├── .gitignore              # Ignore les fichiers sensibles
│   ├── .gitkeep                # Conserve le dossier dans Git
│   ├── README.md               # Documentation du dossier
│   └── app-config.json         # Configuration (créé automatiquement)
└── assets/
    └── js/
        └── password-protection.js  # Logique de protection

index.php : Modifié pour intégrer la popup et la configuration
```

### 2. Permissions requises

Le serveur web doit avoir les droits d'écriture sur le dossier `frontend/data/` :

```bash
chmod 755 frontend/data/
```

### 3. Première utilisation

1. Accédez à `frontend/admin/config.php`
2. Configurez le mode privé et le mot de passe
3. Cliquez sur "Sauvegarder la configuration"
4. Le fichier `app-config.json` est créé automatiquement

## Sécurité

### Hashage du mot de passe

- Le mot de passe est stocké en clair dans `app-config.json` (côté serveur)
- Il est hashé en SHA-256 côté client avant la comparaison
- Le hash est injecté dans `window.APP_CONFIG.security.passwordHash`

### Protection des données

- Le fichier `app-config.json` est **ignoré par Git** (`.gitignore`)
- Seul le dossier `data/` (vide) est versionné
- Recommandation : Protéger `/admin/` avec `.htaccess` ou authentification serveur

### Exemple `.htaccess` pour protéger /admin/

```apache
# frontend/admin/.htaccess
AuthType Basic
AuthName "Administration"
AuthUserFile /path/to/.htpasswd
Require valid-user
```

## Cas d'usage

### Scénario 1 : Outil public avec mode Sonnet protégé
- Mode privé : **ACTIVÉ**
- Mot de passe : `votre-mot-de-passe-secret`
- Les utilisateurs peuvent utiliser le mode Cleaning librement
- Le mode Sonnet nécessite le mot de passe

### Scénario 2 : Outil totalement public
- Mode privé : **DÉSACTIVÉ**
- Accès libre à tous les modèles
- ⚠️ Attention aux coûts d'API !

### Scénario 3 : Outil privé (usage personnel)
- Mode privé : **ACTIVÉ**
- Mot de passe : votre mot de passe personnel
- Protection contre les utilisations non autorisées

## Dépannage

### La popup ne s'affiche pas
1. Vérifiez que le mode privé est activé dans `/admin/config.php`
2. Vérifiez que le modèle "Sonnet Pro" est sélectionné
3. Vérifiez la console du navigateur (F12) pour les erreurs JS

### Le mot de passe ne fonctionne pas
1. Vérifiez que le mot de passe est bien enregistré dans `/admin/config.php`
2. Videz le cache du navigateur
3. Vérifiez les permissions du dossier `data/`

### Le fichier de configuration n'est pas créé
1. Vérifiez les permissions du dossier `frontend/data/`
2. Vérifiez les logs PHP pour les erreurs
3. Essayez de créer manuellement un fichier test :
   ```bash
   touch frontend/data/test.txt
   ```

## API et Coûts

### Mode Sonnet Pro (avec mot de passe)
- Utilise l'API Claude Sonnet 4.5
- Coût par requête : ~$0.015 - $0.03 (selon la taille)
- Protection par mot de passe recommandée en production

### Mode Cleaning (sans mot de passe)
- Utilise uniquement des regex PHP (Pass 0 et 5)
- **Aucun appel API**
- **Aucun coût**
- Disponible sans restriction

## Support

Pour toute question ou problème :
1. Consultez les logs du navigateur (F12 > Console)
2. Vérifiez le fichier `/data/app-config.json`
3. Testez avec le mode privé désactivé

---

**Version** : 1.0.0
**Date** : 2025-11-16
