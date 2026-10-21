import * as fs from 'fs';
import * as path from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { autoLayoutBoxDiagram, validateBlocks } from '../shared/archOps';
import { serializeBoxYaml } from '../shared/documentParser';
import {
  BlockInput,
  buildBlock,
  checkBlockIndex,
  describeBlocks,
  findWorkspaceRoot,
  formatIssues,
  loadLibrary,
  readBlocks,
  resolveArchPath,
  writeBlocks,
} from './documentOps';
import { ARCH_FORMAT_GUIDE } from './formatGuide';

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
]);

const pathSchema = z
  .string()
  .describe(`Chemin du fichier .arch.md (relatif à ${BASE_DIR} ou absolu)`);

// ----------------------------------------------------------------------------
// Serveur
// ----------------------------------------------------------------------------

const server = new McpServer({ name: 'archi-editor', version: '0.1.0' });

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
      'Retourne la spécification des documents Archi Editor (arch-box, arch-seq) et les bonnes pratiques. À lire avant de créer un document.',
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
      'Crée un document d’architecture complet : blocs Markdown et diagrammes (arch-box / arch-seq) en JSON. Les positions des arch-box sont calculées automatiquement.',
    inputSchema: {
      path: pathSchema,
      title: z.string().optional().describe('Titre H1 ajouté en tête du document'),
      blocks: z.array(blockSchema).describe('Blocs dans l’ordre du document'),
      overwrite: z.boolean().optional().describe('Écraser le fichier s’il existe (false par défaut)'),
    },
  },
  async ({ path: filePath, title, blocks, overwrite }) => {
    try {
      const abs = resolveArchPath(filePath, BASE_DIR);
      if (fs.existsSync(abs) && !overwrite) {
        throw new Error(`Le fichier existe déjà : ${abs} (passer overwrite: true ou utiliser arch_insert_block)`);
      }
      const library = loadLibrary(path.dirname(abs));
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
    description: 'Retourne les blocs numérotés d’un document (Markdown et YAML des diagrammes). Les index servent aux outils d’édition.',
    inputSchema: { path: pathSchema },
    annotations: { readOnlyHint: true },
  },
  async ({ path: filePath }) => {
    try {
      const abs = resolveArchPath(filePath, BASE_DIR);
      return text(`${abs}\n\n${describeBlocks(readBlocks(abs))}`);
    } catch (err) {
      return failure(err);
    }
  }
);

server.registerTool(
  'arch_insert_block',
  {
    title: 'Insérer un bloc',
    description: 'Insère un bloc Markdown ou un diagramme dans un document existant (à la fin par défaut).',
    inputSchema: {
      path: pathSchema,
      block: blockSchema,
      index: z.number().int().optional().describe('Position d’insertion (fin du document par défaut)'),
    },
  },
  async ({ path: filePath, block, index }) => {
    try {
      const abs = resolveArchPath(filePath, BASE_DIR);
      const blocks = readBlocks(abs);
      const library = loadLibrary(path.dirname(abs));
      const at = index === undefined ? blocks.length : Math.max(0, Math.min(index, blocks.length));
      blocks.splice(at, 0, buildBlock(block as BlockInput, library));
      const result = writeBlocks(abs, blocks, library);
      return text(`Bloc inséré à l’index ${at} : ${result.path}\n${formatIssues(result.issues)}`);
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
      const blocks = readBlocks(abs);
      checkBlockIndex(blocks, index);
      const library = loadLibrary(path.dirname(abs));
      blocks[index] = buildBlock(block as BlockInput, library);
      const result = writeBlocks(abs, blocks, library);
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
      const blocks = readBlocks(abs);
      checkBlockIndex(blocks, index);
      const removed = blocks.splice(index, 1)[0];
      const library = loadLibrary(path.dirname(abs));
      const result = writeBlocks(abs, blocks, library);
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
    description: 'Recalcule automatiquement les positions et tailles de conteneurs d’un bloc arch-box existant.',
    inputSchema: {
      path: pathSchema,
      index: z.number().int(),
      direction: z.enum(['LR', 'TB']).optional(),
    },
  },
  async ({ path: filePath, index, direction }) => {
    try {
      const abs = resolveArchPath(filePath, BASE_DIR);
      const blocks = readBlocks(abs);
      checkBlockIndex(blocks, index);
      const block = blocks[index];
      if (block.type !== 'arch-box' || !block.boxDiagram) {
        throw new Error(`Le bloc ${index} n’est pas un diagramme arch-box`);
      }
      const library = loadLibrary(path.dirname(abs));
      const diagram = autoLayoutBoxDiagram(block.boxDiagram, library, { direction });
      blocks[index] = { ...block, boxDiagram: diagram, content: serializeBoxYaml(diagram) };
      const result = writeBlocks(abs, blocks, library);
      return text(`Bloc ${index} réorganisé : ${result.path}\n${formatIssues(result.issues)}`);
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

async function main() {
  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error('archi-editor MCP :', err);
  process.exit(1);
});
