import * as fs from 'fs';
import * as path from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { autoLayoutBoxDiagram, autoLayoutDbDiagram, validateBlocks } from '../shared/archOps';
import { serializeBoxYaml, serializeDbYaml } from '../shared/documentParser';
import {
  BlockInput,
  PageInput,
  buildBlock,
  buildPage,
  checkPageIndex,
  describePageList,
  describePages,
  findWorkspaceRoot,
  formatIssues,
  loadLibrary,
  readBlocks,
  readPages,
  resolveArchPath,
  writeBlocks,
  writePages,
} from './documentOps';
import { derivePageTitle, locateBlock } from '../shared/archPages';
import { ARCH_FORMAT_GUIDE } from './formatGuide';
import { exportConfluence } from './confluenceExport';

// Répertoire de base des chemins relatifs : celui depuis lequel Claude Code lance le serveur
const BASE_DIR = process.env.ARCH_WORKSPACE || process.cwd();

// ----------------------------------------------------------------------------
// Schémas d'entrée
// ----------------------------------------------------------------------------

const stringRecord = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]));

const boxNodeSchema = z.object({
  id: z.string().describe('Identifiant unique (kebab-case)'),
  componentRef: z.string().describe('Id du composant du catalogue (arch_list_components)'),
  label: z.string(),
  subtitle: z.string().optional(),
  parentId: z.string().optional().describe('Id du conteneur parent (composant isContainer)'),
  props: stringRecord.optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  width: z.number().optional(),
  height: z.number().optional(),
});

const boxEdgeSchema = z.object({
  id: z.string().optional(),
  source: z.string(),
  target: z.string(),
  label: z.string().optional(),
  protocol: z.string().optional(),
  style: z.enum(['solid', 'dashed', 'dotted']).optional(),
  bidirectional: z.boolean().optional(),
  animated: z.boolean().optional(),
  sourceHandle: z
    .enum(['left', 'right', 'top', 'bottom'])
    .optional()
    .describe('Côté de la boîte source (droite par défaut)'),
  targetHandle: z
    .enum(['left', 'right', 'top', 'bottom'])
    .optional()
    .describe('Côté de la boîte cible (gauche par défaut)'),
});

const boxDiagramSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  nodes: z.array(boxNodeSchema),
  edges: z.array(boxEdgeSchema).default([]),
});

const seqDiagramSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  participants: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      componentRef: z.string().optional(),
      subtitle: z.string().optional(),
    })
  ),
  items: z.array(
    z.object({
      id: z.string().optional(),
      type: z.enum(['message', 'block', 'note']).default('message'),
      label: z.string(),
      from: z.string().optional(),
      to: z.string().optional(),
      protocol: z.string().optional(),
      kind: z.enum(['sync', 'async', 'reply', 'self']).optional(),
      blockKind: z.enum(['alt', 'opt', 'loop', 'par']).optional(),
      participantId: z.string().optional(),
    })
  ),
});

const dbColumnSchema = z.object({
  name: z.string(),
  type: z.string().optional().describe('Type SQL : UUID, VARCHAR(255), INT, TIMESTAMP...'),
  pk: z.boolean().optional().describe('Clé primaire'),
  fk: z.boolean().optional().describe('Clé étrangère'),
  nullable: z.boolean().optional(),
  unique: z.boolean().optional(),
  note: z.string().optional(),
});

const dbDiagramSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  tables: z.array(
    z.object({
      id: z.string().describe('Identifiant unique (kebab-case)'),
      name: z.string().describe('Nom de la table'),
      schema: z.string().optional().describe('Schéma SQL (public, dbo...)'),
      color: z.string().optional().describe('Couleur d’accent de l’en-tête (hex)'),
      columns: z.array(dbColumnSchema),
      position: z.object({ x: z.number(), y: z.number() }).optional(),
    })
  ),
  relations: z
    .array(
      z.object({
        id: z.string().optional(),
        source: z.string().describe('Id de la table source (porteuse de la clé étrangère)'),
        target: z.string().describe('Id de la table cible (référencée)'),
        sourceColumn: z.string().optional(),
        targetColumn: z.string().optional(),
        cardinality: z
          .enum(['one-to-one', 'one-to-many', 'many-to-one', 'many-to-many'])
          .optional(),
        label: z.string().optional(),
      })
    )
    .default([]),
});

const blockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('markdown'), content: z.string().describe('Texte Markdown') }),
  z.object({
    type: z.literal('arch-box'),
    diagram: boxDiagramSchema,
    layout: z
      .enum(['auto', 'keep'])
      .optional()
      .describe('auto = recalcule les positions ; par défaut auto si une position manque'),
    direction: z.enum(['LR', 'TB']).optional().describe('Sens de la mise en page (LR par défaut)'),
  }),
  z.object({ type: z.literal('arch-seq'), diagram: seqDiagramSchema }),
  z.object({
    type: z.literal('arch-db'),
    diagram: dbDiagramSchema,
    layout: z
      .enum(['auto', 'keep'])
      .optional()
      .describe('auto = recalcule les positions des tables ; par défaut auto si une position manque'),
    direction: z.enum(['LR', 'TB']).optional().describe('Sens de la mise en page (LR par défaut)'),
  }),
]);

const pageSchema = z.object({
  title: z.string().optional().describe('Titre de la page (déduit du 1er titre Markdown sinon)'),
  blocks: z.array(blockSchema).describe('Blocs de la page, dans l’ordre'),
});

const pathSchema = z
  .string()
  .describe(`Chemin du fichier .arch.md (relatif à ${BASE_DIR} ou absolu)`);

// ----------------------------------------------------------------------------
// Serveur
// ----------------------------------------------------------------------------

const server = new McpServer({ name: 'archi-editor', version: '0.4.3' });

function text(body: string) {
  return { content: [{ type: 'text' as const, text: body }] };
}

function failure(err: unknown) {
  return { isError: true, ...text(err instanceof Error ? err.message : String(err)) };
}

server.registerTool(
  'arch_get_format_guide',
  {
    title: 'Guide du format .arch.md',
    description:
      'Retourne la spécification des documents Archi Editor (arch-box, arch-seq, arch-db) et les bonnes pratiques. À lire avant de créer un document.',
    annotations: { readOnlyHint: true },
  },
  async () => text(ARCH_FORMAT_GUIDE)
);

server.registerTool(
  'arch_list_components',
  {
    title: 'Catalogue de composants',
    description:
      'Liste les composants utilisables dans componentRef (intégrés + arch-components.yaml du projet). Filtrable par catégorie ou mot-clé.',
    inputSchema: {
      category: z.string().optional().describe('database, middleware, aws, azure, generic ou catégorie personnalisée'),
      query: z.string().optional().describe('Filtre texte sur id, nom, techno, description'),
      directory: z.string().optional().describe('Dossier depuis lequel chercher arch-components.yaml'),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ category, query, directory }) => {
    const dir = path.resolve(BASE_DIR, directory || '.');
    const library = loadLibrary(dir);
    const q = query?.trim().toLowerCase();
    const comps = library.components.filter(
      (c) =>
        (!category || c.category === category) &&
        (!q ||
          [c.id, c.name, c.defaultTech, c.description]
            .filter(Boolean)
            .some((s) => s!.toLowerCase().includes(q)))
    );
    const lines = comps.map(
      (c) =>
        `- ${c.id} — ${c.name} [${c.category}${c.isContainer ? ', conteneur' : ''}]` +
        (c.defaultTech ? ` · ${c.defaultTech}` : '')
    );
    const root = findWorkspaceRoot(dir);
    return text(
      `Catégories : ${library.categories.map((c) => `${c.id} (${c.label})`).join(', ')}\n` +
        `Catalogue projet : ${root ? path.join(root, 'arch-components.yaml') : 'aucun (composants intégrés seulement)'}\n\n` +
        `${comps.length} composant(s) :\n${lines.join('\n')}`
    );
  }
);

server.registerTool(
  'arch_create_document',
  {
    title: 'Créer un document .arch.md',
    description:
      'Crée un document d’architecture complet : blocs Markdown et diagrammes (arch-box / arch-seq / arch-db) en JSON. Fournir soit "blocs" (document d’une seule page), soit "pages" (document multi-pages). Les positions des arch-box et arch-db sont calculées automatiquement.',
    inputSchema: {
      path: pathSchema,
      title: z.string().optional().describe('Titre H1 ajouté en tête du document (1re page)'),
      blocks: z.array(blockSchema).optional().describe('Blocs d’un document mono-page, dans l’ordre'),
      pages: z
        .array(pageSchema)
        .optional()
        .describe('Pages d’un document multi-pages (alternative à "blocs")'),
      overwrite: z.boolean().optional().describe('Écraser le fichier s’il existe (false par défaut)'),
    },
  },
  async ({ path: filePath, title, blocks, pages, overwrite }) => {
    try {
      const abs = resolveArchPath(filePath, BASE_DIR);
      if (fs.existsSync(abs) && !overwrite) {
        throw new Error(`Le fichier existe déjà : ${abs} (passer overwrite: true ou utiliser arch_insert_block)`);
      }
      if (blocks && pages) {
        throw new Error('Fournir "blocs" OU "pages", pas les deux.');
      }
      if (!blocks && !pages) {
        throw new Error('Fournir "blocs" (mono-page) ou "pages" (multi-pages).');
      }
      const library = loadLibrary(path.dirname(abs));

      if (pages) {
        const builtPages = (pages as PageInput[]).map((p, i) => {
          const page = buildPage(p, i, library);
          if (i === 0 && title) {
            page.blocks.unshift(buildBlock({ type: 'markdown', content: `# ${title}` }, library));
          }
          return page;
        });
        const result = writePages(abs, builtPages, library);
        return text(
          `Document écrit : ${result.path} (${result.pageCount} page(s), ${result.blockCount} blocs)\n${formatIssues(result.issues)}`
        );
      }

      const inputs: BlockInput[] = title
        ? [{ type: 'markdown', content: `# ${title}` }, ...(blocks as BlockInput[])]
        : (blocks as BlockInput[]);
      const result = writeBlocks(abs, inputs.map((b) => buildBlock(b, library)), library);
      return text(`Document écrit : ${result.path} (${result.blockCount} blocs)\n${formatIssues(result.issues)}`);
    } catch (err) {
      return failure(err);
    }
  }
);

server.registerTool(
  'arch_read_document',
  {
    title: 'Lire un document .arch.md',
    description: 'Retourne les pages et les blocs numérotés d’un document (Markdown et YAML des diagrammes). Les index de bloc sont globaux (toutes pages confondues) et servent aux outils d’édition.',
    inputSchema: { path: pathSchema },
    annotations: { readOnlyHint: true },
  },
  async ({ path: filePath }) => {
    try {
      const abs = resolveArchPath(filePath, BASE_DIR);
      return text(`${abs}\n\n${describePages(readPages(abs))}`);
    } catch (err) {
      return failure(err);
    }
  }
);

server.registerTool(
  'arch_insert_block',
  {
    title: 'Insérer un bloc',
    description: 'Insère un bloc Markdown ou un diagramme dans une page d’un document existant (dernière page, à la fin, par défaut).',
    inputSchema: {
      path: pathSchema,
      block: blockSchema,
      page: z
        .number()
        .int()
        .optional()
        .describe('Index de page cible (voir arch_list_pages). Par défaut : dernière page.'),
      index: z
        .number()
        .int()
        .optional()
        .describe('Position d’insertion dans la page (fin de page par défaut)'),
    },
  },
  async ({ path: filePath, block, page, index }) => {
    try {
      const abs = resolveArchPath(filePath, BASE_DIR);
      const pages = readPages(abs);
      const library = loadLibrary(path.dirname(abs));
      const pageIdx = page === undefined ? pages.length - 1 : page;
      checkPageIndex(pages, pageIdx);
      const target = pages[pageIdx];
      const at =
        index === undefined ? target.blocks.length : Math.max(0, Math.min(index, target.blocks.length));
      target.blocks.splice(at, 0, buildBlock(block as BlockInput, library));
      const result = writePages(abs, pages, library);
      return text(
        `Bloc inséré (page ${pageIdx}, position ${at}) : ${result.path}\n${formatIssues(result.issues)}`
      );
    } catch (err) {
      return failure(err);
    }
  }
);

server.registerTool(
  'arch_update_block',
  {
    title: 'Remplacer un bloc',
    description:
      'Remplace le bloc à l’index donné (voir arch_read_document). Pour un arch-box, les positions fournies sont conservées sauf layout: "auto".',
    inputSchema: { path: pathSchema, index: z.number().int(), block: blockSchema },
  },
  async ({ path: filePath, index, block }) => {
    try {
      const abs = resolveArchPath(filePath, BASE_DIR);
      const pages = readPages(abs);
      const { pageIndex, localIndex } = locateBlock(pages, index);
      const library = loadLibrary(path.dirname(abs));
      pages[pageIndex].blocks[localIndex] = buildBlock(block as BlockInput, library);
      const result = writePages(abs, pages, library);
      return text(`Bloc ${index} remplacé : ${result.path}\n${formatIssues(result.issues)}`);
    } catch (err) {
      return failure(err);
    }
  }
);

server.registerTool(
  'arch_remove_block',
  {
    title: 'Supprimer un bloc',
    description: 'Supprime le bloc à l’index donné.',
    inputSchema: { path: pathSchema, index: z.number().int() },
    annotations: { destructiveHint: true },
  },
  async ({ path: filePath, index }) => {
    try {
      const abs = resolveArchPath(filePath, BASE_DIR);
      const pages = readPages(abs);
      const { pageIndex, localIndex } = locateBlock(pages, index);
      const removed = pages[pageIndex].blocks.splice(localIndex, 1)[0];
      const library = loadLibrary(path.dirname(abs));
      const result = writePages(abs, pages, library);
      return text(`Bloc ${index} (${removed.type}) supprimé : ${result.path}\n${formatIssues(result.issues)}`);
    } catch (err) {
      return failure(err);
    }
  }
);

server.registerTool(
  'arch_layout_diagram',
  {
    title: 'Réorganiser un diagramme',
    description:
      'Recalcule automatiquement les positions d’un bloc arch-box (et tailles de conteneurs) ou arch-db (tables) existant.',
    inputSchema: {
      path: pathSchema,
      index: z.number().int(),
      direction: z.enum(['LR', 'TB']).optional(),
    },
  },
  async ({ path: filePath, index, direction }) => {
    try {
      const abs = resolveArchPath(filePath, BASE_DIR);
      const pages = readPages(abs);
      const { pageIndex, localIndex } = locateBlock(pages, index);
      const block = pages[pageIndex].blocks[localIndex];
      const library = loadLibrary(path.dirname(abs));
      if (block.type === 'arch-box' && block.boxDiagram) {
        const diagram = autoLayoutBoxDiagram(block.boxDiagram, library, { direction });
        pages[pageIndex].blocks[localIndex] = { ...block, boxDiagram: diagram, content: serializeBoxYaml(diagram) };
      } else if (block.type === 'arch-db' && block.dbDiagram) {
        const diagram = autoLayoutDbDiagram(block.dbDiagram, { direction });
        pages[pageIndex].blocks[localIndex] = { ...block, dbDiagram: diagram, content: serializeDbYaml(diagram) };
      } else {
        throw new Error(`Le bloc ${index} n’est pas un diagramme arch-box ou arch-db`);
      }
      const result = writePages(abs, pages, library);
      return text(`Bloc ${index} réorganisé : ${result.path}\n${formatIssues(result.issues)}`);
    } catch (err) {
      return failure(err);
    }
  }
);

server.registerTool(
  'arch_list_pages',
  {
    title: 'Lister les pages',
    description:
      'Liste les pages d’un document multi-pages avec leur titre et la plage d’index de bloc global de chaque page.',
    inputSchema: { path: pathSchema },
    annotations: { readOnlyHint: true },
  },
  async ({ path: filePath }) => {
    try {
      const abs = resolveArchPath(filePath, BASE_DIR);
      return text(`${abs}\n\n${describePageList(readPages(abs))}`);
    } catch (err) {
      return failure(err);
    }
  }
);

server.registerTool(
  'arch_add_page',
  {
    title: 'Ajouter une page',
    description:
      'Ajoute une nouvelle page au document (à la fin par défaut, ou à l’index "index"). La page peut être vide ou contenir des blocs initiaux.',
    inputSchema: {
      path: pathSchema,
      title: z.string().optional().describe('Titre de la page (déduit du 1er titre Markdown sinon)'),
      blocks: z.array(blockSchema).optional().describe('Blocs initiaux de la page (vide par défaut)'),
      index: z
        .number()
        .int()
        .optional()
        .describe('Position de la page dans le document (fin par défaut)'),
    },
  },
  async ({ path: filePath, title, blocks, index }) => {
    try {
      const abs = resolveArchPath(filePath, BASE_DIR);
      const pages = readPages(abs);
      const library = loadLibrary(path.dirname(abs));
      const at = index === undefined ? pages.length : Math.max(0, Math.min(index, pages.length));
      const newPage = buildPage({ title, blocks: (blocks as BlockInput[]) || [] }, at, library);
      pages.splice(at, 0, newPage);
      const result = writePages(abs, pages, library);
      return text(
        `Page ajoutée à l’index ${at} (« ${newPage.title} ») : ${result.path} (${result.pageCount} page(s))\n${formatIssues(result.issues)}`
      );
    } catch (err) {
      return failure(err);
    }
  }
);

server.registerTool(
  'arch_rename_page',
  {
    title: 'Renommer une page',
    description: 'Change le titre de la page à l’index donné (voir arch_list_pages).',
    inputSchema: {
      path: pathSchema,
      index: z.number().int().describe('Index de la page à renommer'),
      title: z.string().describe('Nouveau titre de la page'),
    },
  },
  async ({ path: filePath, index, title }) => {
    try {
      const abs = resolveArchPath(filePath, BASE_DIR);
      const pages = readPages(abs);
      checkPageIndex(pages, index);
      const library = loadLibrary(path.dirname(abs));
      pages[index].title = title.trim() || derivePageTitle(pages[index], index);
      const result = writePages(abs, pages, library);
      return text(`Page ${index} renommée « ${pages[index].title} » : ${result.path}\n${formatIssues(result.issues)}`);
    } catch (err) {
      return failure(err);
    }
  }
);

server.registerTool(
  'arch_remove_page',
  {
    title: 'Supprimer une page',
    description: 'Supprime la page à l’index donné et tous ses blocs. Le document doit conserver au moins une page.',
    inputSchema: {
      path: pathSchema,
      index: z.number().int().describe('Index de la page à supprimer'),
    },
    annotations: { destructiveHint: true },
  },
  async ({ path: filePath, index }) => {
    try {
      const abs = resolveArchPath(filePath, BASE_DIR);
      const pages = readPages(abs);
      checkPageIndex(pages, index);
      if (pages.length <= 1) {
        throw new Error('Impossible de supprimer la dernière page du document.');
      }
      const removed = pages.splice(index, 1)[0];
      const library = loadLibrary(path.dirname(abs));
      const result = writePages(abs, pages, library);
      return text(
        `Page ${index} (« ${removed.title} », ${removed.blocks.length} bloc(s)) supprimée : ${result.path} (${result.pageCount} page(s))\n${formatIssues(result.issues)}`
      );
    } catch (err) {
      return failure(err);
    }
  }
);

server.registerTool(
  'arch_validate_document',
  {
    title: 'Valider un document',
    description: 'Vérifie le YAML, les références de composants, de nœuds et de participants.',
    inputSchema: { path: pathSchema },
    annotations: { readOnlyHint: true },
  },
  async ({ path: filePath }) => {
    try {
      const abs = resolveArchPath(filePath, BASE_DIR);
      const library = loadLibrary(path.dirname(abs));
      return text(`${abs}\n${formatIssues(validateBlocks(readBlocks(abs), library))}`);
    } catch (err) {
      return failure(err);
    }
  }
);

server.registerTool(
  'arch_export_confluence',
  {
    title: 'Exporter vers Confluence (schémas en PNG)',
    description:
      'Prépare la publication Confluence d’un document .arch.md : convertit le Markdown en format storage (XHTML), rend chaque diagramme (arch-box / arch-seq / arch-db) en PNG sur disque et retourne le corps de page avec les macros image. Publier ensuite via le MCP Atlassian (createConfluencePage / updateConfluencePage) puis attacher les PNG retournés à la page.',
    inputSchema: {
      path: pathSchema,
      outDir: z
        .string()
        .optional()
        .describe('Dossier de sortie des PNG et du corps de page (par défaut <nom>.confluence/ à côté du fichier)'),
      scale: z.number().optional().describe('Facteur d’échelle des PNG (2 par défaut, pour un rendu net)'),
      title: z.string().optional().describe('Titre de la page (par défaut le premier titre H1 du document)'),
    },
  },
  async ({ path: filePath, outDir, scale, title }) => {
    try {
      const abs = resolveArchPath(filePath, BASE_DIR);
      const library = loadLibrary(path.dirname(abs));
      const result = await exportConfluence({ absPath: abs, library, outDir, scale, title });
      const imgLines = result.images
        .map((im) => `  - ${im.filename}  (${im.width}×${im.height})  →  ${im.file}`)
        .join('\n');
      return text(
        `Export Confluence prêt.\n` +
          `Titre : ${result.title}\n` +
          `Dossier : ${result.outDir}\n` +
          `Corps (format storage) : ${result.bodyPath}\n` +
          `${result.images.length} diagramme(s) PNG :\n${imgLines || '  (aucun)'}\n\n` +
          `Étapes de publication via le MCP Atlassian :\n` +
          `1. createConfluencePage (ou updateConfluencePage si la page existe) avec title="${result.title}" et le corps ci-dessous.\n` +
          `2. Attacher chaque PNG listé ci-dessus à la page (les macros <ac:image> y font référence par nom de fichier).\n\n` +
          `----- CORPS DE PAGE (format storage) -----\n${result.body}`
      );
    } catch (err) {
      return failure(err);
    }
  }
);

async function main() {
  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error('archi-editor MCP :', err);
  process.exit(1);
});
