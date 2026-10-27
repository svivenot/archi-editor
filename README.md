# Archi Editor - Extension VS Code d'Architecture WYSIWYG

Extension VS Code permettant d'éditer en **WYSIWYG** des documents d'architecture (`.arch.md` et `.arch`) mêlant :
- **Texte riche en Markdown** (éditeur TipTap WYSIWYG avec synchronisation bidirectionnelle Markdown).
- **Diagrammes de boîtes connectées (`arch-box`)** décrits en YAML et éditables sur un canevas interactif (`@xyflow/react` + auto-layout `Dagre`).
- **Diagrammes de séquence (`arch-seq`)** décrits en YAML et éditables visuellement (participants typés avec symboles, messages synchrones/asynchrones/retours, blocs `alt`/`opt`/`loop`/`par`, notes).
- **Schémas de base de données (`arch-db`)** décrits en YAML et éditables sur un canevas interactif : tables avec colonnes typées, clés primaires/étrangères, contraintes `unique`/`nullable`, relations avec cardinalité (1—1, 1—N, N—1, N—N) et auto-layout `Dagre`.
- **Bibliothèque de composants intégrée et extensible (`arch-components.yaml`)** incluant :
  - **Bases de données** : MS SQL Server (`mssql`), Oracle Database (`oracle`), PostgreSQL (`postgresql`).
  - **Messaging, Proxy & IAM** : RabbitMQ (`rabbitmq`), Traefik Proxy (`traefik`), Keycloak (`keycloak`).
  - **Amazon Web Services (AWS)** : VPC, Subnet, EC2, Lambda, EKS, ECS, API Gateway, ALB, CloudFront, Route 53, S3, RDS, DynamoDB, ElastiCache, SQS, SNS, EventBridge, IAM.
  - **Microsoft Azure** : Resource Group, VNet, VM, AKS, App Service, Functions, APIM, Application Gateway, Front Door, Azure SQL, Cosmos DB, Blob Storage, Redis, Service Bus, Event Grid, Entra ID, Key Vault.
- **Export en PDF** en un clic depuis la barre d'outils ou la palette de commandes VS Code (`Archi Editor: Exporter en PDF`).

## Installer l'extension

Téléchargez `archi-editor-X.Y.Z.vsix` depuis la [dernière release](https://github.com/svivenot/archi-editor/releases/latest),
puis dans VS Code : *Extensions > … > Install from VSIX…*, ou en ligne de commande :

```bash
code --install-extension archi-editor-X.Y.Z.vsix
```

## Lancer l'extension en développement dans VS Code

1. Ouvrez ce dossier dans VS Code.
2. Appuyez sur **`F5`** (la configuration `.vscode/launch.json` compile automatiquement l'extension et ouvre une fenêtre *Extension Development Host* sur le fichier d'exemple `examples/architecture-demo.arch.md`).
3. Vous pouvez également prévisualiser l'interface WYSIWYG dans un navigateur avec `npm run dev:webview`.

## Générer des documents avec Claude Code (serveur MCP + agent)

Le dépôt fournit un serveur MCP (`src/mcp/server.ts` → `dist/mcp-server.js`) qui permet à Claude Code
de créer et modifier des fichiers `.arch.md` : les diagrammes sont passés en JSON, le serveur valide
les références, calcule la mise en page (Dagre, conteneurs imbriqués via `parentId`) et écrit le YAML.

| Outil | Rôle |
|---|---|
| `arch_get_format_guide` | Spécification du format et bonnes pratiques |
| `arch_list_components` | Catalogue (intégré + `arch-components.yaml` du projet) |
| `arch_create_document` | Crée un document complet (Markdown + diagrammes) |
| `arch_read_document` | Liste les blocs numérotés d'un document |
| `arch_insert_block` / `arch_update_block` / `arch_remove_block` | Édition par bloc |
| `arch_layout_diagram` | Recalcule la mise en page d'un `arch-box` ou `arch-db` (LR ou TB) |
| `arch_validate_document` | YAML, `componentRef`, liens, participants |
| `arch_export_confluence` | Prépare la publication Confluence : Markdown → format *storage* (XHTML) + schémas rendus en PNG |

### Exporter vers Confluence

L'outil `arch_export_confluence` rend chaque diagramme (`arch-box`, `arch-seq`, `arch-db`) en **PNG**
côté serveur (rendu SVG → PNG, sans navigateur) et convertit le Markdown au format *storage* Confluence.
Il écrit les PNG et le corps de page dans un dossier `<nom>.confluence/` et retourne le corps avec les
macros `<ac:image>`. La publication se fait ensuite avec un serveur MCP Atlassian :

1. `arch_export_confluence` → corps *storage* + PNG sur disque ;
2. `createConfluencePage` (ou `updateConfluencePage` si la page existe) avec ce corps ;
3. attacher les PNG retournés à la page (les macros image les référencent par nom de fichier).

Exemple de demande à Claude Code : « Exporte `docs/architecture.arch.md` vers Confluence dans l'espace
DEV, les schémas en PNG. »

### Installation du serveur MCP et de l'agent

Prérequis : [Claude Code](https://docs.claude.com/claude-code), Node.js 18 ou plus récent et git.

#### 1. Récupérer et construire le serveur MCP

```bash
git clone https://github.com/svivenot/archi-editor.git ~/archi-editor
cd ~/archi-editor
npm install
npm run build:mcp      # produit dist/mcp-server.js (fichier autonome)
```

#### 2. Déclarer le serveur MCP dans Claude Code

Pour l'utiliser dans **tous vos projets** (portée utilisateur) :

```bash
claude mcp add --scope user archi-editor -- node ~/archi-editor/dist/mcp-server.js
```

Pour le partager avec l'équipe d'**un seul projet**, ajoutez plutôt un fichier `.mcp.json` à la racine de
ce projet (Claude Code demandera de l'approuver au premier lancement) :

```json
{
  "mcpServers": {
    "archi-editor": {
      "command": "node",
      "args": ["/chemin/absolu/vers/archi-editor/dist/mcp-server.js"]
    }
  }
}
```

> Dans le dépôt archi-editor lui-même, `.mcp.json` est déjà présent : il suffit de lancer `claude`
> depuis ce dossier après le `npm run build:mcp`.

#### 3. Installer l'agent `arch-designer`

L'agent est un simple fichier Markdown à copier dans le dossier des agents de Claude Code :

```bash
# Pour tous vos projets
mkdir -p ~/.claude/agents
cp ~/archi-editor/.claude/agents/arch-designer.md ~/.claude/agents/

# Ou pour un seul projet (à versionner avec lui)
mkdir -p .claude/agents
cp ~/archi-editor/.claude/agents/arch-designer.md .claude/agents/
```

Sans cloner le dépôt, le fichier peut aussi être téléchargé directement :

```bash
curl -fsSL -o ~/.claude/agents/arch-designer.md \
  https://raw.githubusercontent.com/svivenot/archi-editor/main/.claude/agents/arch-designer.md
```

#### 4. Vérifier

```bash
claude mcp list        # archi-editor doit apparaître comme connecté
```

Dans une session Claude Code (relancée après l'installation), `/mcp` affiche les 9 outils `arch_*`
et `/agents` liste `arch-designer`. Il n'est pas obligatoire de nommer l'agent : Claude Code le
sollicite de lui-même pour les demandes de dossiers d'architecture, mais vous pouvez l'appeler
explicitement (« utilise arch-designer pour… »).

#### Mise à jour

```bash
cd ~/archi-editor && git pull && npm install && npm run build:mcp
cp .claude/agents/arch-designer.md ~/.claude/agents/   # si l'agent a évolué
```

#### Fonctionnement

- Les chemins de fichiers relatifs sont résolus depuis le dossier où Claude Code est lancé
  (surchargeable avec la variable d'environnement `ARCH_WORKSPACE`).
- Le catalogue personnalisé est cherché en remontant depuis le dossier du fichier généré
  (`arch-components.yaml`, `arch-components.yml`, `.arch/components.yaml`) : vos composants
  métier y sont donc utilisables par l'agent.
- Les fichiers produits s'ouvrent en WYSIWYG dans VS Code avec l'extension (voir les
  [releases](https://github.com/svivenot/archi-editor/releases) pour le `.vsix`).

### Exemples de demandes

- « Utilise arch-designer pour documenter l'architecture de ce dépôt dans `docs/architecture.arch.md` »
- « Crée un dossier d'architecture pour une API de paiement sur Azure (APIM, AKS, Service Bus, Azure SQL)
  avec la séquence de paiement »
- « Ajoute dans `docs/architecture.arch.md` une séquence de rafraîchissement de jeton Keycloak »

## Publier une release

Le workflow `.github/workflows/release.yml` construit l'extension, lance les tests et publie le `.vsix`
en pièce jointe d'une release GitHub à chaque tag `vX.Y.Z` (qui doit correspondre à `version` dans `package.json`) :

```bash
npm version patch   # met à jour package.json et crée le tag vX.Y.Z
git push --follow-tags
```

Un lancement manuel depuis l'onglet *Actions* produit le `.vsix` en artefact, sans créer de release.

## Licence

Distribué sous licence [MIT](LICENSE).
