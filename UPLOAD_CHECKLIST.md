# 📋 Checklist des fichiers à uploader pour le système de mot de passe

## 🔴 FICHIERS CRITIQUES (obligatoires)

### 1. Frontend principal
```
frontend/index.php
```
**Pourquoi**: Charge la configuration et injecte le hash SHA-256 du mot de passe dans `window.APP_CONFIG`

### 2. JavaScript de protection
```
frontend/assets/js/password-protection.js
```
**Pourquoi**: Gère la popup, la validation du mot de passe et le basculement en mode Cleaning

### 3. Page d'administration
```
frontend/admin/config.php
```
**Pourquoi**: Permet de modifier le mode privé et le mot de passe

### 4. Page d'accueil admin
```
frontend/admin/index.php
```
**Pourquoi**: Point d'entrée de l'administration

## 🟡 FICHIERS DE CONFIGURATION (créés automatiquement)

### Dossier config
```
frontend/config/.gitignore
frontend/config/README.md
frontend/config/app-config.example.json
```

**Note**: Le fichier `frontend/config/app-config.json` sera créé automatiquement lors de la première sauvegarde depuis `/admin/config.php`

## 🔧 STRUCTURE DU FICHIER DE CONFIGURATION

Quand vous sauvegardez depuis `/admin/config.php`, le fichier `frontend/config/app-config.json` devrait contenir :

```json
{
  "version": "1.0",
  "lastUpdate": "2025-11-16T...",
  "general": {
    "maxFileSize": 200,
    "maintenanceMode": false
  },
  "security": {
    "privateMode": true,
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

## 🐛 FICHIER DE DÉBOGAGE (optionnel)

Si le mot de passe ne fonctionne toujours pas après avoir uploadé tous les fichiers ci-dessus, utilisez la version debug :

```
frontend/assets/js/password-protection-debug.js
```

### Comment utiliser la version debug :

1. Dans `frontend/index.php`, remplacez temporairement :
   ```html
   <script src="assets/js/password-protection.js"></script>
   ```
   par :
   ```html
   <script src="assets/js/password-protection-debug.js"></script>
   ```

2. Ouvrez la console du navigateur (F12 > Console)

3. Rechargez la page et vérifiez les logs :
   - Le mot de passe entré
   - Le hash calculé
   - Le hash attendu
   - Si les hashs correspondent

4. Prenez une capture d'écran des logs et partagez-la

## ✅ VÉRIFICATIONS APRÈS UPLOAD

### Étape 1 : Vérifier la configuration
1. Aller sur `/admin/config.php`
2. Cocher "Activer le mode privé"
3. Vérifier que le mot de passe est "1974"
4. Cliquer sur "Enregistrer la configuration"

### Étape 2 : Vérifier que le fichier JSON est créé
1. Se connecter en FTP/SSH
2. Vérifier que le fichier `frontend/config/app-config.json` existe
3. Vérifier son contenu (voir structure ci-dessus)

### Étape 3 : Tester la popup
1. Ouvrir `index.php`
2. Sélectionner "Sonnet Pro" dans le menu déroulant
3. Une popup devrait apparaître
4. Entrer "1974"
5. Cliquer sur "Valider"

### Étape 4 : Vérifier dans la console du navigateur
1. Appuyer sur F12
2. Aller dans l'onglet "Console"
3. Chercher les erreurs JavaScript
4. Vérifier que `window.APP_CONFIG` est défini :
   ```javascript
   console.log(window.APP_CONFIG);
   ```
   Devrait afficher :
   ```javascript
   {
     workerUrl: "...",
     maxFileSize: 51200,
     security: {
       privateMode: true,
       passwordHash: "ec54e99514663edb97adef400fbf34a77daae108303d3da8008a7dfb4cdf0f52"
     }
   }
   ```

## 🔑 HASH ATTENDU

Le hash SHA-256 du mot de passe "1974" doit être :
```
ec54e99514663edb97adef400fbf34a77daae108303d3da8008a7dfb4cdf0f52
```

Vous pouvez vérifier dans la console du navigateur :
```javascript
// Copier-coller cette fonction dans la console
async function testHash() {
    async function sha256(str) {
        const buffer = new TextEncoder().encode(str);
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    const hash = await sha256('1974');
    console.log('Hash de "1974":', hash);
    console.log('Hash attendu:', 'ec54e99514663edb97adef400fbf34a77daae108303d3da8008a7dfb4cdf0f52');
    console.log('Match:', hash === 'ec54e99514663edb97adef400fbf34a77daae108303d3da8008a7dfb4cdf0f52');
}
testHash();
```

## 📝 PERMISSIONS REQUISES

Assurez-vous que le serveur web a les permissions d'écriture sur :
```bash
chmod 755 frontend/config/
```

## ❓ PROBLÈMES COURANTS

### Problème : La popup ne s'affiche pas
**Cause** : Le mode privé n'est pas activé dans la configuration
**Solution** : Aller dans `/admin/config.php` et cocher "Activer le mode privé"

### Problème : Le mot de passe ne fonctionne pas
**Causes possibles** :
1. Le fichier `app-config.json` n'existe pas ou est mal formaté
2. Les hashs ne correspondent pas
3. Le JavaScript n'est pas chargé correctement

**Solution** : Utiliser la version debug (voir ci-dessus) pour identifier le problème exact

### Problème : Erreur JavaScript
**Cause** : Un fichier JavaScript n'est pas chargé
**Solution** : Vérifier dans la console (F12) et uploader les fichiers manquants

## 📞 SUPPORT

Si le problème persiste après avoir :
1. Uploadé tous les fichiers critiques
2. Vérifié la configuration
3. Utilisé la version debug

Partagez :
- Les logs de la console (F12 > Console)
- Le contenu de `window.APP_CONFIG`
- Le contenu du fichier `frontend/config/app-config.json`
