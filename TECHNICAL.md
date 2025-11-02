# Documentation Technique - SRT Corrector Pro

## 🏗️ Architecture

### Vue d'ensemble

```
┌─────────────┐
│   Browser   │
│  (Frontend) │
└──────┬──────┘
       │ HTTPS
       ↓
┌─────────────┐      ┌──────────────┐
│  OVH Server │      │  Cloudflare  │
│  PHP 7.4+   │─────→│    Worker    │
└─────────────┘      └──────┬───────┘
                            │ HTTPS
                            ↓
                     ┌──────────────┐
                     │  Claude API  │
                     │  (Anthropic) │
                     └──────────────┘
```

### Flux de données

1. **Upload** : Browser → OVH (PHP) → Browser (JS)
2. **Correction** : Browser (JS) → Cloudflare Worker → Claude API
3. **Affichage** : Browser (JS) render results
4. **Export** : Browser (JS) generate file

## 📂 Structure détaillée

```
srt-corrector/
├── frontend/                    # Application frontend
│   ├── index.php               # Point d'entrée
│   ├── .htaccess               # Config Apache
│   │
│   ├── lib/                    # Bibliothèques PHP
│   │   ├── config.php          # Configuration
│   │   └── functions.php       # Fonctions utilitaires
│   │
│   └── assets/                 # Ressources statiques
│       ├── css/
│       │   └── style.css       # Styles (CSS Variables)
│       └── js/
│           ├── app.js          # Logique principale
│           └── srt-parser.js   # Parser/Export SRT
│
├── cloudflare-worker/          # Worker Cloudflare
│   ├── worker.js               # Code du worker
│   └── wrangler.toml          # Configuration
│
├── logs/                       # Logs (auto-créé)
├── example.srt                # Fichier de test
├── .gitignore                 # Git ignore
├── README.md                  # Documentation utilisateur
└── TECHNICAL.md              # Cette doc technique
```

## 🔧 Composants techniques

### Frontend PHP

#### config.php
- **Rôle** : Configuration centrale
- **Variables clés** :
  - `WORKER_URL` : URL du Worker Cloudflare
  - `MAX_FILE_SIZE` : Taille max (50 Ko)
  - Configuration future BDD

#### functions.php
- `validateAndCleanSRT()` : Validation upload
- `cleanSRTContent()` : Nettoyage du contenu
- `sanitizeFilename()` : Sécurisation noms fichiers
- `logError()` : Logging erreurs
- `initDatabase()` : Init BDD (future)
- `checkQuota()` : Gestion quotas (future)

#### index.php
- Gestion upload PHP
- Interface HTML
- Injection config JS
- Auto-traitement si upload réussi

### Frontend JavaScript

#### app.js
- **État global** : `AppState`
  - `originalFilename` : Nom fichier original
  - `blocks` : Blocs SRT corrigés
  - `validatedCorrections` : Set des corrections validées

- **Fonctions principales** :
  - `processUploadedFile()` : Traitement fichier
  - `sendToWorker()` : Communication Worker
  - `showEditor()` : Affichage éditeur
  - `renderCorrectedText()` : Rendu texte corrigé
  - `renderValidations()` : Rendu validations
  - `validateCorrections()` : Validation par type
  - `downloadSRT()` / `downloadTXT()` : Export

#### srt-parser.js
- **Module utilitaire** pour :
  - Parsing SRT
  - Génération SRT/TXT
  - Application corrections avec highlight
  - Validation format
  - Calcul statistiques
  - Gestion téléchargements

### Cloudflare Worker

#### worker.js

**Fonctions principales** :

1. `handleRequest()` : Point d'entrée
   - Gestion CORS
   - Validation requête
   - Orchestration traitement

2. `processSRT()` : Traitement SRT
   - Parse blocs
   - Découpage en chunks (50 blocs/chunk)
   - Traitement séquentiel chunks

3. `parseSRTBlocks()` : Parser SRT
   - Détection index/timecode/texte
   - Structure en objets

4. `correctWithClaude()` : Correction IA
   - Appel API Claude
   - Gestion erreurs
   - Parse réponse JSON

5. `buildPrompt()` : Construction prompt
   - Prompt structuré
   - Instructions catégorisation
   - Format JSON strict

## 🎨 Design System (CSS)

### Variables CSS (`:root`)

**Couleurs** :
- `--color-primary` : #4f46e5 (Indigo)
- `--color-minor` : #3b82f6 (Bleu)
- `--color-major` : #10b981 (Vert)
- `--color-doubt` : #f59e0b (Orange)

**Spacing** : xs/sm/md/lg/xl (0.5rem → 2rem)
**Radius** : sm/md/lg/xl (0.375rem → 1rem)
**Shadows** : sm/md/lg/xl

### Layout

- **Mobile-first** : Base styles pour mobile
- **Breakpoints** :
  - 640px : Small tablets
  - 1024px : Desktop

### Composants

1. **Upload Card** : Section upload centrée
2. **Loading** : Spinner + barre progression
3. **Editor Grid** : 2 colonnes (texte + validations)
4. **Stats Bar** : Flexbox, 4 items
5. **SRT Blocks** : Liste blocs avec highlights
6. **Validation Cards** : Cartes par correction

## 🔌 API Claude

### Modèle utilisé
- **Nom** : `claude-sonnet-4-20241022`
- **Max tokens** : 16000
- **Temperature** : 0 (déterministe)

### Format réponse attendu

```json
{
  "blocks": [
    {
      "index": 1,
      "original": "texte original",
      "corrected": "texte corrigé",
      "corrections": [
        {
          "type": "minor|major|doubt",
          "original": "c est",
          "corrected": "c'est",
          "reason": "Apostrophe obligatoire",
          "position": 0
        }
      ]
    }
  ]
}
```

### Catégorisation

**Minor** (bleu) :
- Apostrophes typographiques
- Espaces avant ponctuation
- Ponctuation basique
- Majuscules début phrase

**Major** (vert) :
- Orthographe évidente
- Accord sujet-verbe
- Conjugaison claire
- Majuscules institutions

**Doubt** (orange) :
- Choix stylistiques
- Contexte ambigu
- Plusieurs interprétations

## 🐛 Debugging

### Logs Frontend

**Fichier** : `frontend/logs/error.log`

**Format** :
```
[2025-10-31 14:30:45] ERROR: Message | {"context":"data"}
```

**Fonctions de log** :
```php
logError('Message', ['key' => 'value']);
```

### Logs Worker

**Dashboard Cloudflare** :
1. Workers & Pages
2. Sélectionner worker
3. Onglet "Logs"
4. Temps réel ou historique

**Console dans code** :
```javascript
console.log('Debug info')
console.error('Error info')
```

### Logs Browser

**Console DevTools (F12)** :
- Erreurs JS
- Requêtes réseau
- État application

**Points de debug** :
```javascript
console.log('AppState:', AppState)
console.log('Blocks:', AppState.blocks)
```

## ⚡ Performance

### Optimisations actuelles

1. **Chunking** : Découpage en 50 blocs/chunk
2. **Compression** : Gzip via .htaccess
3. **Cache** : Headers cache pour assets
4. **CSS** : Variables CSS (pas de preprocessor)
5. **JS** : Vanilla JS (pas de framework)

### Métriques attendues

- **Upload** : < 1s (fichier 50 Ko)
- **Correction** : 5-30s selon taille
- **Render** : < 500ms (100 blocs)
- **Export** : < 100ms

### Limites

- **Fichier max** : 50 Ko (~500 blocs)
- **Worker timeout** : 10 min (Cloudflare Paid)
- **Tokens Claude** : 16000 tokens/réponse

## 🔐 Sécurité

### Mesures implémentées

1. **Validation upload** :
   - Extension (.srt uniquement)
   - Taille (50 Ko max)
   - Type MIME

2. **Échappement données** :
   - HTML : `SRTParser.escapeHtml()`
   - SQL : N/A (pas de BDD pour l'instant)

3. **Clé API** :
   - Stockée dans Cloudflare Secrets
   - Jamais exposée frontend

4. **CORS** :
   - Headers configurés
   - Worker accepte toutes origines (à restreindre en prod)

5. **Logs** :
   - Fichiers hors web root
   - Pas d'affichage erreurs en prod

### Recommandations production

1. **HTTPS** : Obligatoire (Let's Encrypt)
2. **CORS** : Restreindre à domaine précis
3. **Rate limiting** : Implémenter quotas
4. **Monitoring** : Cloudflare Analytics
5. **Backup** : Sauvegardes régulières

## 🚀 Déploiement

### Checklist pré-déploiement

- [ ] Modifier `WORKER_URL` dans `config.php`
- [ ] Déployer Worker Cloudflare
- [ ] Configurer `ANTHROPIC_API_KEY`
- [ ] Tester Worker URL directement
- [ ] Upload frontend sur OVH
- [ ] Créer dossier `logs/` avec permissions
- [ ] Tester upload fichier
- [ ] Vérifier CORS
- [ ] Tester correction complète
- [ ] Tester export SRT/TXT

### Commandes déploiement

**Worker** :
```bash
cd cloudflare-worker
wrangler login
wrangler deploy
```

**Frontend** :
```bash
# Via FTP/SFTP
rsync -av frontend/ user@host:/path/to/st/
```

## 📊 Extensions futures

### Base de données

**Schema proposé** :

```sql
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    email VARCHAR(255) UNIQUE,
    created_at TIMESTAMP
);

CREATE TABLE corrections (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    filename VARCHAR(255),
    blocks_count INT,
    corrections_count INT,
    created_at TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

**Fonctions à implémenter** :
- `initDatabase()` : Connexion PDO
- `saveCorrection()` : Sauvegarder historique
- `checkQuota()` : Vérifier limites utilisateur

### Quotas

**Stratégie** :
1. Cookie/session pour tracking
2. Limite par IP/jour
3. Système utilisateur avec login

**Code prêt** :
```php
define('ENABLE_QUOTAS', true);
define('MAX_REQUESTS_PER_DAY', 100);
```

### Multi-fichiers

**Modifications nécessaires** :
1. Upload multiple dans `index.php`
2. Boucle traitement dans `app.js`
3. Agrégation résultats
4. Export zip

## 🧪 Tests

### Tests manuels

1. **Upload** :
   - Fichier valide (.srt, < 50 Ko)
   - Fichier invalide (trop gros, mauvais format)
   - Fichiers encodages variés (UTF-8, ISO-8859-1)

2. **Correction** :
   - Fichier avec fautes évidentes
   - Fichier déjà correct
   - Fichier avec ambiguïtés

3. **Validation** :
   - Valider individuellement
   - Valider par type
   - Valider tout
   - Modifier correction

4. **Export** :
   - SRT avec nom correct (_SR)
   - TXT sans timecodes
   - Encoding UTF-8 préservé

### Fichier de test fourni

`example.srt` contient :
- Fautes d'apostrophe
- Erreurs de typographie
- Nombres (milliers, années)
- Majuscules institutions
- Ambiguïtés (peut-être/peut être)

## 📞 Support technique

### FAQ

**Q : Le Worker ne répond pas ?**
R : Vérifier clé API, logs Worker, URL correcte

**Q : Erreur CORS ?**
R : Ajouter headers dans .htaccess, vérifier mod_headers

**Q : Fichier trop gros ?**
R : Augmenter `MAX_FILE_SIZE` ET `upload_max_filesize` PHP

**Q : Erreur encoding ?**
R : Le code détecte et convertit automatiquement

**Q : Corrections incorrectes ?**
R : Modifier manuellement ou ajuster prompt Worker

### Contacts

- **Repo** : [github.com/sebyrollins/calculatrice/srt-corrector]
- **Issues** : Utiliser GitHub Issues
- **Email** : [votre email]

---

**Version** : 1.0.0
**Dernière mise à jour** : 2025-10-31
