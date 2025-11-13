# Configuration de l'application

## 📋 Vue d'ensemble

La page de configuration permet de gérer les paramètres globaux de l'application SRT Corrector Pro, notamment l'URL du Worker Cloudflare et les prompts de chaque passe de correction.

## 🔑 Accès

1. Connectez-vous à l'interface admin : `https://votre-domaine.com/admin/`
2. Cliquez sur la carte "Configuration"
3. Vous accédez à la page de configuration

## ⚙️ Paramètres configurables

### 1. URL du Worker Cloudflare

**Champ** : `URL du Worker`
**Description** : L'URL complète de votre Worker Cloudflare qui traite les corrections

**Exemple** :
```
https://srt-corrector-worker.sraynal.workers.dev
```

**Utilité** : Cette URL est utilisée par le frontend pour envoyer les fichiers SRT au Worker pour traitement.

### 2. Prompts des passes de correction

Vous pouvez personnaliser les instructions système (prompts) envoyées à Claude pour chaque passe :

#### **Pass 1 : Corrections naturelles**
- Orthographe, conjugaison, grammaire, typographie
- C'est la passe générale qui corrige les fautes évidentes

#### **Pass 2 : Institutions + Formatage**
- Majuscules des institutions (Gouvernement, Assemblée nationale, etc.)
- Espaces milliers (10 000 au lieu de 10000)
- Traits d'union (rendez-vous, au-delà, etc.)
- Majuscules abusives

#### **Pass 3 : Ministères + Formules de politesse**
- Capitalisation correcte des ministères
- Usage de monsieur/madame en minuscule dans le discours oral

#### **Pass 4 : Ambiguïté de genre**
- Détection des accords ambigus (je suis venu/venue)
- Proposition d'alternatives pour le genre du locuteur

## 💾 Fichier de configuration

Le fichier de configuration est stocké dans :
```
/frontend/config/app-config.json
```

**⚠️ Important** : Ce fichier est ignoré par Git (`.gitignore`) pour permettre des configurations différentes par environnement.

### Structure du fichier

```json
{
  "version": "1.0",
  "lastUpdate": "2025-11-13T00:00:00Z",
  "worker": {
    "url": "https://votre-worker.workers.dev"
  },
  "prompts": {
    "pass1": "Prompt de la passe 1...",
    "pass2": "Prompt de la passe 2...",
    "pass3": "Prompt de la passe 3...",
    "pass4": "Prompt de la passe 4..."
  }
}
```

## 🚀 Déploiement

### Premier déploiement

1. Copiez le fichier exemple :
   ```bash
   cp frontend/config/app-config.example.json frontend/config/app-config.json
   ```

2. Accédez à l'interface admin et configurez :
   - L'URL de votre Worker
   - Les prompts (ou gardez ceux par défaut)

3. Cliquez sur "💾 Enregistrer la configuration"

### Mise à jour du Worker

Si vous modifiez les prompts, **vous devez aussi les mettre à jour dans le Worker** :

1. Éditez `/cloudflare-worker/worker.js`
2. Modifiez les fonctions `buildSystemPromptPass1()` à `buildSystemPromptPass4()`
3. Redéployez le Worker :
   ```bash
   cd cloudflare-worker
   wrangler deploy
   ```

**Note** : À terme, le Worker pourrait charger les prompts dynamiquement depuis une API, mais pour l'instant ils sont statiques dans le code.

## 🔧 Utilisation

### Modifier l'URL du Worker

1. Accédez à la page Configuration
2. Modifiez le champ "URL du Worker"
3. Cliquez sur "Enregistrer la configuration"
4. L'application utilisera immédiatement la nouvelle URL

### Modifier un prompt

1. Accédez à la page Configuration
2. Modifiez le contenu du textarea du prompt souhaité
3. Cliquez sur "Enregistrer la configuration"
4. **Important** : Mettez à jour le Worker avec le même prompt
5. Redéployez le Worker

### Restaurer les prompts par défaut

Si vous voulez restaurer les prompts d'origine :

1. Supprimez le fichier de configuration :
   ```bash
   rm frontend/config/app-config.json
   ```

2. Copiez à nouveau l'exemple avec les valeurs par défaut :
   ```bash
   cp frontend/config/app-config.example.json frontend/config/app-config.json
   ```

3. Ou utilisez l'interface admin pour recréer le fichier avec les prompts originaux

## ⚠️ Précautions

1. **Testez vos modifications** : Avant de modifier les prompts en production, testez-les sur des fichiers de test
2. **Synchronisez Worker et Config** : Les prompts dans l'admin et dans le Worker doivent être identiques
3. **Sauvegardez** : Faites une copie de votre configuration avant des modifications importantes
4. **Format JSON** : Assurez-vous que les prompts respectent le format JSON attendu par Claude

## 📚 Exemples de modifications

### Ajouter une règle à la Pass 2

Vous pouvez ajouter une nouvelle règle dans le prompt de la Pass 2, par exemple :

```
5. DATES :
   ✗ 1er janvier, 2eme mars
   ✓ 1er janvier, 2e mars
```

### Rendre la Pass 1 plus stricte

Vous pouvez ajouter des instructions plus spécifiques :

```
RÈGLES SUPPLÉMENTAIRES :
- Corriger systématiquement "ça" en "cela" dans un contexte formel
- Éviter les anglicismes courants
```

## 🆘 Dépannage

### Les modifications ne s'appliquent pas

**Problème** : Les modifications dans l'admin ne changent rien
**Solution** : Les prompts dans l'admin sont pour information. Vous devez aussi modifier le Worker et le redéployer.

### Erreur lors de la sauvegarde

**Problème** : "Erreur lors de la sauvegarde de la configuration"
**Solution** : Vérifiez les permissions du dossier `/frontend/config/`
```bash
chmod 755 frontend/config/
chmod 644 frontend/config/app-config.json
```

### Le fichier app-config.json n'existe pas

**Problème** : Erreur au chargement de la page
**Solution** : Créez le fichier à partir de l'exemple
```bash
cp frontend/config/app-config.example.json frontend/config/app-config.json
```

## 🔮 Évolutions futures

- Chargement dynamique des prompts par le Worker via API
- Versioning des prompts avec historique
- Templates de prompts prédéfinis
- Interface de test des prompts en direct
- Gestion multi-environnement (dev, staging, prod)
