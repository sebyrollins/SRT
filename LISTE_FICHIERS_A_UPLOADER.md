# 📦 LISTE EXACTE DES FICHIERS À UPLOADER

## ✅ Fichiers à uploader (7 fichiers au total)

### 1️⃣ Fichier principal
```
frontend/index.php
```

### 2️⃣ Scripts JavaScript
```
frontend/assets/js/password-protection.js
```

### 3️⃣ Pages admin
```
frontend/admin/index.php
frontend/admin/config.php
```

### 4️⃣ Dossier config (3 fichiers)
```
frontend/config/.gitignore          ⚠️ Fichier caché (commence par un point)
frontend/config/README.md
frontend/config/app-config.example.json
```

---

## ⚠️ IMPORTANT : Le fichier .gitignore

Le fichier `frontend/config/.gitignore` est un **fichier caché** (commence par un point).

### Contenu de ce fichier :
```
*.json
```

### Comment l'uploader :

**Via FTP** (FileZilla, etc.) :
1. Assurez-vous que les fichiers cachés sont visibles :
   - FileZilla : Serveur → Forcer l'affichage des fichiers cachés
   - Ou : Affichage → Afficher les fichiers cachés
2. Créez manuellement le fichier `.gitignore` dans `frontend/config/`
3. Éditez-le et mettez dedans : `*.json`

**Via ligne de commande SSH** :
```bash
cd frontend/config/
echo "*.json" > .gitignore
```

**Alternative simple** : Si vous ne pouvez pas créer de fichier caché, ce n'est pas critique. Le fichier `.gitignore` sert uniquement à éviter de versionner le fichier `app-config.json` dans Git. Sur votre serveur en production, il n'est pas indispensable.

---

## 📝 APRÈS L'UPLOAD

### 1. Vérifier la structure de dossiers
Votre serveur doit avoir cette structure :
```
frontend/
├── index.php                           ✅ uploadé
├── admin/
│   ├── index.php                       ✅ uploadé
│   └── config.php                      ✅ uploadé
├── assets/
│   └── js/
│       └── password-protection.js      ✅ uploadé
└── config/
    ├── .gitignore                      ✅ uploadé (ou créé manuellement)
    ├── README.md                       ✅ uploadé
    ├── app-config.example.json         ✅ uploadé
    └── app-config.json                 ⏳ sera créé automatiquement
```

### 2. Créer la configuration
1. Allez sur `https://votre-site.com/frontend/admin/config.php`
2. Remplissez tous les champs
3. ☑️ Cochez "Activer le mode privé"
4. Mot de passe : `1974`
5. Cliquez sur "💾 Enregistrer la configuration"
6. ✅ Le fichier `app-config.json` est créé automatiquement !

### 3. Tester
1. Allez sur `https://votre-site.com/frontend/index.php`
2. Sélectionnez "Sonnet Pro"
3. Une popup devrait apparaître
4. Entrez `1974`
5. ✅ Vous devriez être autorisé !

---

## 🐛 SI LE MOT DE PASSE NE FONCTIONNE TOUJOURS PAS

### Uploader le fichier de debug
```
frontend/assets/js/password-protection-debug.js
```

### Modifier temporairement index.php
Ligne ~518, remplacer :
```html
<script src="assets/js/password-protection.js"></script>
```
par :
```html
<script src="assets/js/password-protection-debug.js"></script>
```

### Ouvrir la console du navigateur
1. Appuyez sur F12
2. Allez dans l'onglet "Console"
3. Essayez d'entrer le mot de passe
4. Les logs vous diront exactement où est le problème
5. Prenez une capture d'écran et partagez-la

---

## 🔧 PERMISSIONS

Assurez-vous que le dossier `frontend/config/` est accessible en écriture :
```bash
chmod 755 frontend/config/
```

---

## ✅ CHECKLIST RAPIDE

- [ ] `frontend/index.php` uploadé
- [ ] `frontend/assets/js/password-protection.js` uploadé
- [ ] `frontend/admin/index.php` uploadé
- [ ] `frontend/admin/config.php` uploadé
- [ ] `frontend/config/README.md` uploadé
- [ ] `frontend/config/app-config.example.json` uploadé
- [ ] `frontend/config/.gitignore` créé (contient `*.json`)
- [ ] Aller sur `/admin/config.php`
- [ ] Activer le mode privé
- [ ] Sauvegarder la configuration
- [ ] Tester sur `/index.php`

---

## 💡 RÉSUMÉ

**7 fichiers** à uploader + **1 fichier** à créer manuellement si besoin (`.gitignore`).

Le plus important est que le dossier `frontend/config/` existe et soit accessible en écriture pour que le fichier `app-config.json` puisse être créé automatiquement lors de la première sauvegarde.
