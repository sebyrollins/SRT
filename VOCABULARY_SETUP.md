# Configuration de la Pass 5 - Vocabulaire

## 🎯 Comment ça fonctionne

La Pass 5 permet de corriger le vocabulaire sans coût API en utilisant des règles personnalisables.

**Flux de synchronisation :**
```
Interface Admin → vocabulary-rules.json → API PHP → Cloudflare Worker → Correction SRT
```

---

## ⚙️ Configuration requise

### 1. **Configurer l'URL de l'API dans le Worker**

Le Worker doit savoir où récupérer les règles de vocabulaire.

**Option A : Modifier directement le fichier `worker.js`**

Ligne 8 de `cloudflare-worker/worker.js` :
```javascript
const VOCABULARY_API_URL = 'https://votre-domaine.com/api/vocabulary-rules.php'
```

Remplacer `votre-domaine.com` par votre domaine réel.

**Option B : Utiliser les variables d'environnement Cloudflare**

Cela permet de ne pas coder en dur l'URL et de la changer sans redéployer.

**Via `wrangler.toml` :**
```toml
[vars]
VOCABULARY_API_URL = "https://votre-domaine.com/api/vocabulary-rules.php"
```

Puis dans `worker.js` ligne 8 :
```javascript
const VOCABULARY_API_URL = typeof VOCABULARY_API_URL !== 'undefined'
  ? VOCABULARY_API_URL
  : 'https://votre-domaine.com/api/vocabulary-rules.php'
```

**Via Dashboard Cloudflare :**
1. Aller sur le dashboard Cloudflare
2. Workers & Pages > Votre Worker
3. Settings > Variables
4. Ajouter : `VOCABULARY_API_URL` = `https://votre-domaine.com/api/vocabulary-rules.php`

---

### 2. **Vérifier que l'API est accessible**

Tester l'API dans votre navigateur :
```
https://votre-domaine.com/api/vocabulary-rules.php
```

Vous devriez voir un JSON comme :
```json
{
  "success": true,
  "version": "1.0",
  "lastUpdate": "2025-11-12T14:30:00Z",
  "rules": [
    {
      "id": "rule-001",
      "enabled": true,
      "type": "exact",
      "variants": ["scanner", "scanneur"],
      "replace": "scanner",
      ...
    }
  ],
  "count": 5
}
```

---

### 3. **Créer des règles dans l'interface admin**

1. Accéder à `/admin/vocabulary.php`
2. Se connecter (mot de passe via variable d'environnement `ADMIN_PASSWORD`)
3. Ajouter des règles :
   - **Type exact** : pour plusieurs orthographes → une seule forme
   - **Type souple** : ignore casse, accents, pluriel, tirets
   - **Type regex** : pour patterns complexes
4. **Sauvegarder** (bouton en haut à droite)

---

### 4. **Tester la règle**

**Dans l'interface admin :**
- Utiliser le testeur en bas de page
- Entrer un texte d'exemple
- Cliquer sur "Tester toutes les règles"
- Vérifier que la correction s'applique

**Dans l'application SRT :**
- Uploader un fichier SRT contenant les mots à corriger
- Lancer la correction
- Vérifier que la Pass 5 apparaît dans les corrections

---

## 🔍 Vérification du fonctionnement

### Logs du Worker

Quand vous faites une correction, vérifiez les logs Cloudflare :

```
[processSRT] Starting Pass 5: Vocabulary corrections (no API cost)
[Pass 5] Fetching vocabulary rules from API: https://...
[Pass 5] Loaded 5 vocabulary rules from API
[processSRT] Pass 5: Using 5 vocabulary rules
[processSRT] Pass 5 completed:
  - 12/200 blocks modified
  - 15 vocabulary corrections applied
  - Duration: 25ms
  - Cost: $0.00 (no API call)
```

### En cas d'erreur

Si l'API ne répond pas :
```
[Pass 5] Failed to load vocabulary rules from API: ...
[Pass 5] Falling back to default rules
```

Le Worker utilisera alors les règles par défaut codées en dur dans `getDefaultVocabularyRules()`.

---

## 📊 Performance et cache

### Cache en mémoire

Les règles sont mises en cache pendant **5 minutes** pour éviter trop d'appels API.

**Paramètres du cache** (ligne 13 de `worker.js`) :
```javascript
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes
```

Vous pouvez ajuster cette durée selon vos besoins :
- Plus court (1 min) : règles mises à jour plus rapidement
- Plus long (30 min) : moins d'appels API, mais règles moins fraîches

### Invalidation du cache

Le cache est automatiquement invalidé après 5 minutes. Pour forcer la mise à jour :
- Redémarrer le Worker
- Ou attendre 5 minutes après la modification des règles

---

## 🛠️ Dépannage

### Problème : Les règles ne s'appliquent pas dans les SRT

**1. Vérifier que l'API est accessible :**
```bash
curl https://votre-domaine.com/api/vocabulary-rules.php
```

**2. Vérifier que les règles sont activées :**
- Dans l'admin, vérifier que la règle a le symbole ✅ (activée)
- Seules les règles avec `"enabled": true` sont retournées par l'API

**3. Vérifier les logs du Worker :**
- Dashboard Cloudflare > Workers & Pages > Votre Worker > Logs
- Chercher les lignes `[Pass 5]`

**4. Tester dans l'admin d'abord :**
- Si ça fonctionne dans le testeur admin mais pas dans le Worker :
  → Problème de chargement de l'API
- Si ça ne fonctionne pas dans le testeur admin :
  → Problème de pattern regex

---

### Problème : CORS error

Si vous voyez des erreurs CORS dans les logs :

**1. Vérifier les headers dans `vocabulary-rules.php` :**
```php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
```

**2. Vérifier que votre serveur permet les requêtes cross-origin**

---

### Problème : Timeout

Si l'API met trop longtemps à répondre (> 5 secondes), le Worker utilise les règles par défaut.

**Solutions :**
- Optimiser la taille du fichier JSON (supprimer les règles inutilisées)
- Augmenter le timeout dans `worker.js` ligne 1176 :
  ```javascript
  signal: AbortSignal.timeout(10000) // 10 secondes au lieu de 5
  ```

---

## 📝 Exemple complet

### 1. Créer une règle "Petites Villes de demain"

**Dans l'admin (`/admin/vocabulary.php`) :**
- Type : Souple
- Recherche : `petite ville de demain`
- Remplacement : `Petites Villes de demain`
- Options : ✅ Ignorer majuscules, ✅ Ignorer pluriel
- Sauvegarder

### 2. Tester dans l'admin

Texte : `Les petites villes de demain seront durables`
Résultat attendu : `Les Petites Villes de demain seront durables`

### 3. Configurer le Worker

Dans `worker.js` ligne 8 :
```javascript
const VOCABULARY_API_URL = 'https://mon-site.com/api/vocabulary-rules.php'
```

### 4. Redéployer le Worker

```bash
cd cloudflare-worker
wrangler deploy
```

### 5. Tester avec un SRT

Uploader un fichier contenant :
```
1
00:00:01,000 --> 00:00:03,000
Les petites villes de demain
```

Après correction, vous devriez voir :
```
1
00:00:01,000 --> 00:00:03,000
Les Petites Villes de demain
```

Et dans les corrections proposées, vous verrez la faute détectée par la Pass 5.

---

## 🚀 Déploiement

Après avoir modifié le Worker :

```bash
cd cloudflare-worker
wrangler deploy
```

Les règles seront chargées automatiquement depuis l'API au prochain traitement de SRT.

---

## 💡 Conseils

1. **Commencer simple** : Testez d'abord avec 1-2 règles pour valider que tout fonctionne
2. **Utiliser le testeur** : Toujours tester dans l'admin avant de sauvegarder
3. **Surveiller les logs** : Vérifier que les règles sont bien chargées
4. **Cache** : Penser à attendre 5 minutes après une modification pour voir l'effet
5. **Fallback** : En cas de problème d'API, les règles par défaut prennent le relais

---

## 📚 Ressources

- **Interface admin** : `/admin/vocabulary.php`
- **API des règles** : `/api/vocabulary-rules.php`
- **Fichier JSON** : `/frontend/config/vocabulary-rules.json`
- **Code Worker** : `/cloudflare-worker/worker.js`
- **Documentation Cloudflare** : https://developers.cloudflare.com/workers/
