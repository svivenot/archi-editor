# Archi Editor - Extension VS Code d'Architecture WYSIWYG

Extension VS Code permettant d'éditer en **WYSIWYG** des documents d'architecture (`.arch.md` et `.arch`) mêlant :
- **Texte riche en Markdown** (éditeur TipTap WYSIWYG avec synchronisation bidirectionnelle Markdown).
- **Diagrammes de boîtes connectées (`arch-box`)** décrits en YAML et éditables sur un canevas interactif (`@xyflow/react` + auto-layout `Dagre`).
- **Diagrammes de séquence (`arch-seq`)** décrits en YAML et éditables visuellement (participants typés avec symboles, messages synchrones/asynchrones/retours, blocs `alt`/`opt`/`loop`/`par`, notes).
- **Bibliothèque de composants intégrée et extensible (`arch-components.yaml`)** incluant :
  - **Bases de données** : MS SQL Server (`mssql`), Oracle Database (`oracle`), PostgreSQL (`postgresql`).
  - **Messaging, Proxy & IAM** : RabbitMQ (`rabbitmq`), Traefik Proxy (`traefik`), Keycloak (`keycloak`).
  - **Amazon Web Services (AWS)** : VPC, Subnet, EC2, Lambda, EKS, ECS, API Gateway, ALB, CloudFront, Route 53, S3, RDS, DynamoDB, ElastiCache, SQS, SNS, EventBridge, IAM.
  - **Microsoft Azure** : Resource Group, VNet, VM, AKS, App Service, Functions, APIM, Application Gateway, Front Door, Azure SQL, Cosmos DB, Blob Storage, Redis, Service Bus, Event Grid, Entra ID, Key Vault.
- **Export en PDF** en un clic depuis la barre d'outils ou la palette de commandes VS Code (`Archi Editor: Exporter en PDF`).

## Lancer l'extension dans VS Code

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
| `arch_layout_diagram` | Recalcule la mise en page d'un `arch-box` (LR ou TB) |
| `arch_validate_document` | YAML, `componentRef`, liens, participants |

### Installation

```bash
npm install && npm run build:mcp
```

- **Dans ce dépôt** : `.mcp.json` déclare déjà le serveur `archi-editor` (Claude Code demande
  de l'approuver au premier lancement). L'agent `arch-designer` est dans `.claude/agents/`.
- **Dans tous vos projets** :

  ```bash
  claude mcp add --scope user archi-editor -- node /chemin/vers/archi-editor/dist/mcp-server.js
  cp .claude/agents/arch-designer.md ~/.claude/agents/
  ```

Les chemins relatifs sont résolus depuis le dossier où Claude Code est lancé (ou `ARCH_WORKSPACE`).
Le catalogue personnalisé est cherché en remontant depuis le dossier du fichier
(`arch-components.yaml`, `arch-components.yml`, `.arch/components.yaml`).

### Exemples de demandes

- « Utilise arch-designer pour documenter l'architecture de ce dépôt dans `docs/architecture.arch.md` »
- « Crée un dossier d'architecture pour une API de paiement sur Azure (APIM, AKS, Service Bus, Azure SQL)
  avec la séquence de paiement »
- « Ajoute dans `docs/architecture.arch.md` une séquence de rafraîchissement de jeton Keycloak »

## Licence

Distribué sous licence [MIT](LICENSE).
