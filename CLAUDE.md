# Archi Editor

Extension VS Code (éditeur WYSIWYG de fichiers `.arch.md`) + serveur MCP pour générer ces fichiers depuis Claude Code.

## Structure
- `src/shared/` : code pur partagé extension / webview / MCP — types (`archTypes.ts`), parseur-sérialiseur (`documentParser.ts`), découpage en pages (`archPages.ts`), catalogue intégré (`defaultLibrary.ts`), validation et auto-layout (`archOps.ts`).
- `src/extension.ts`, `src/ArchEditorProvider.ts`, `src/ComponentLibraryService.ts`, `src/PdfExportService.ts` : hôte VS Code.
- `webview-ui/` : interface React (TipTap, @xyflow/react, Dagre), alias `@shared` vers `src/shared`.
- `src/mcp/` : serveur MCP stdio (`server.ts`), opérations fichier (`documentOps.ts`), guide de format (`formatGuide.ts`).
- `.claude/agents/arch-designer.md` : agent qui pilote le MCP.

## Commandes
- `npm test` (vitest), `npm run typecheck`, `npm run build` (extension + MCP + webview), `npm run package:vsix`.
- `npm run build:mcp` après toute modification de `src/mcp` ou `src/shared` : `.mcp.json` lance `dist/mcp-server.js`.

## Conventions
- Textes, commentaires et messages utilisateur en français.
- Un nouveau composant intégré va dans `defaultLibrary.ts` **et** a besoin d'un symbole dans `webview-ui/src/symbols/ArchSymbolRegistry.tsx`.
- Toute évolution du format YAML doit toucher ensemble `archTypes.ts`, `documentParser.ts` (parse + serialize), `archOps.ts` (validation), les schémas zod de `src/mcp/server.ts` et `formatGuide.ts`.
- Pages : un `.arch.md` peut contenir plusieurs pages, délimitées par un marqueur Markdown `<!-- arch:page title="..." -->`. Le découpage/recollage vit dans `archPages.ts` (orthogonal aux schémas YAML des diagrammes, qui restent inchangés) ; le marqueur est **structurel** (retiré au parse, réinjecté à l'écriture, aucun marqueur si une seule page). Les index de bloc exposés par le MCP sont globaux (toutes pages confondues).
