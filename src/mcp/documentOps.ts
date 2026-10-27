import * as fs from 'fs';
import * as path from 'path';
import YAML from 'yaml';
import { ComponentLibraryService } from '../ComponentLibraryService';
import { ArchDocumentBlock, ComponentLibrary } from '../shared/archTypes';
import {
  ArchIssue,
  LayoutDirection,
  autoLayoutBoxDiagram,
  autoLayoutDbDiagram,
  validateBlocks,
} from '../shared/archOps';
import {
  parseArchDocument,
  parseBoxYaml,
  parseDbYaml,
  parseSeqYaml,
  serializeArchDocument,
  serializeBoxYaml,
  serializeDbYaml,
  serializeSeqYaml,
} from '../shared/documentParser';
import {
  ArchPage,
  countContentBlocks,
  derivePageTitle,
  flattenPagesToBlocks,
  splitBlocksIntoPages,
} from '../shared/archPages';

const LIBRARY_FILES = ['arch-components.yaml', 'arch-components.yml', path.join('.arch', 'components.yaml')];

/** Bloc tel que fourni par un client MCP (diagrammes en objets JSON plutôt qu'en YAML). */
export type BlockInput =
  | { type: 'markdown'; content: string }
  | { type: 'arch-box'; diagram: Record<string, any>; layout?: 'auto' | 'keep'; direction?: LayoutDirection }
  | { type: 'arch-seq'; diagram: Record<string, any> }
  | { type: 'arch-db'; diagram: Record<string, any>; layout?: 'auto' | 'keep'; direction?: LayoutDirection };

/**
 * Remonte l'arborescence depuis `startDir` pour trouver le dossier contenant un
 * arch-components.yaml (même logique de fusion que l'extension VS Code).
 */
export function findWorkspaceRoot(startDir: string): string | undefined {
  let dir = path.resolve(startDir);
  for (;;) {
    if (LIBRARY_FILES.some((f) => fs.existsSync(path.join(dir, f)))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

export function loadLibrary(startDir: string): ComponentLibrary {
  return new ComponentLibraryService(findWorkspaceRoot(startDir)).getLibrary();
}

export function resolveArchPath(filePath: string, baseDir: string): string {
  const abs = path.resolve(baseDir, filePath);
  if (!abs.endsWith('.arch.md') && !abs.endsWith('.arch')) {
    throw new Error(`Le fichier doit avoir l'extension .arch.md ou .arch : ${abs}`);
  }
  return abs;
}

function needsLayout(diagram: Record<string, any>, key: 'nodes' | 'tables' = 'nodes'): boolean {
  const items = Array.isArray(diagram[key]) ? diagram[key] : [];
  return items.some(
    (n: any) => typeof n?.position?.x !== 'number' || typeof n?.position?.y !== 'number'
  );
}

let blockSeq = 0;

export function buildBlock(input: BlockInput, library: ComponentLibrary): ArchDocumentBlock {
  blockSeq += 1;
  if (input.type === 'markdown') {
    return { id: `block-md-new-${blockSeq}`, type: 'markdown', content: input.content };
  }
  if (input.type === 'arch-box') {
    let { diagram, error } = parseBoxYaml(YAML.stringify(input.diagram));
    if (error) throw new Error(`Diagramme arch-box invalide : ${error}`);
    for (const n of diagram.nodes) {
      if (n.props) {
        n.props = Object.fromEntries(Object.entries(n.props).map(([k, v]) => [k, String(v)]));
      }
    }
    const layout = input.layout || (needsLayout(input.diagram) ? 'auto' : 'keep');
    if (layout === 'auto') {
      diagram = autoLayoutBoxDiagram(diagram, library, { direction: input.direction });
    }
    return {
      id: `block-box-new-${blockSeq}`,
      type: 'arch-box',
      content: serializeBoxYaml(diagram),
      boxDiagram: diagram,
    };
  }
  if (input.type === 'arch-db') {
    let { diagram, error } = parseDbYaml(YAML.stringify(input.diagram));
    if (error) throw new Error(`Diagramme arch-db invalide : ${error}`);
    const layout = input.layout || (needsLayout(input.diagram, 'tables') ? 'auto' : 'keep');
    if (layout === 'auto') {
      diagram = autoLayoutDbDiagram(diagram, { direction: input.direction });
    }
    return {
      id: `block-db-new-${blockSeq}`,
      type: 'arch-db',
      content: serializeDbYaml(diagram),
      dbDiagram: diagram,
    };
  }
  const { diagram, error } = parseSeqYaml(YAML.stringify(input.diagram));
  if (error) throw new Error(`Diagramme arch-seq invalide : ${error}`);
  return {
    id: `block-seq-new-${blockSeq}`,
    type: 'arch-seq',
    content: serializeSeqYaml(diagram),
    seqDiagram: diagram,
  };
}

export interface WriteResult {
  path: string;
  blockCount: number;
  issues: ArchIssue[];
}

export function writeBlocks(
  absPath: string,
  blocks: ArchDocumentBlock[],
  library: ComponentLibrary
): WriteResult {
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  const text = serializeArchDocument(blocks);
  fs.writeFileSync(absPath, text, 'utf-8');
  // Relit le fichier pour que les index retournés correspondent à ceux de read_document
  const reparsed = parseArchDocument(text);
  return { path: absPath, blockCount: reparsed.length, issues: validateBlocks(reparsed, library) };
}

export function readBlocks(absPath: string): ArchDocumentBlock[] {
  if (!fs.existsSync(absPath)) {
    throw new Error(`Fichier introuvable : ${absPath}`);
  }
  return parseArchDocument(fs.readFileSync(absPath, 'utf-8'));
}

export function checkBlockIndex(blocks: ArchDocumentBlock[], index: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= blocks.length) {
    throw new Error(`Index de bloc ${index} hors limites (0..${blocks.length - 1})`);
  }
}

export function formatIssues(issues: ArchIssue[]): string {
  if (issues.length === 0) return 'Validation : aucun problème détecté.';
  const lines = issues.map(
    (i) =>
      `- [${i.level === 'error' ? 'ERREUR' : 'avertissement'}]` +
      (i.blockIndex !== undefined ? ` bloc ${i.blockIndex}` : '') +
      ` : ${i.message}`
  );
  return `Validation : ${issues.length} problème(s)\n${lines.join('\n')}`;
}

export function describeBlocks(blocks: ArchDocumentBlock[]): string {
  return blocks
    .map((b, idx) => {
      if (b.type === 'markdown') {
        return `### Bloc ${idx} — markdown\n${b.content}`;
      }
      const title = b.boxDiagram?.title || b.seqDiagram?.title || b.dbDiagram?.title || '';
      return `### Bloc ${idx} — ${b.type}${title ? ` : ${title}` : ''}\n\`\`\`yaml\n${b.content}\n\`\`\``;
    })
    .join('\n\n');
}

// ----------------------------------------------------------------------------
// Pages
// ----------------------------------------------------------------------------

/** Page telle que fournie par un client MCP (titre + blocs en objets JSON). */
export interface PageInput {
  title?: string;
  blocks: BlockInput[];
}

/** Construit une page (blocs YAML sérialisés) à partir d'une PageInput. */
export function buildPage(input: PageInput, index: number, library: ComponentLibrary): ArchPage {
  const page: ArchPage = {
    id: `page-new-${index + 1}`,
    title: (input.title || '').trim(),
    blocks: (input.blocks || []).map((b) => buildBlock(b, library)),
  };
  if (!page.title) page.title = derivePageTitle(page, index);
  return page;
}

/** Lit un document et le découpe en pages. */
export function readPages(absPath: string): ArchPage[] {
  return splitBlocksIntoPages(readBlocks(absPath));
}

export interface WritePagesResult {
  path: string;
  pageCount: number;
  blockCount: number;
  issues: ArchIssue[];
}

/** Écrit des pages (aplaties en blocs, marqueurs réinjectés) sur disque. */
export function writePages(
  absPath: string,
  pages: ArchPage[],
  library: ComponentLibrary
): WritePagesResult {
  const result = writeBlocks(absPath, flattenPagesToBlocks(pages), library);
  return {
    path: result.path,
    pageCount: pages.length,
    blockCount: countContentBlocks(pages),
    issues: result.issues,
  };
}

/** Index de bloc global (hors marqueurs) du premier bloc de chaque page. */
function pageStartIndexes(pages: ArchPage[]): number[] {
  const starts: number[] = [];
  let offset = 0;
  for (const page of pages) {
    starts.push(offset);
    offset += page.blocks.length;
  }
  return starts;
}

/** Résumé des pages : titre + plage d'index de bloc global. */
export function describePageList(pages: ArchPage[]): string {
  const starts = pageStartIndexes(pages);
  const lines = pages.map((p, i) => {
    const start = starts[i];
    const end = start + p.blocks.length - 1;
    const range =
      p.blocks.length === 0 ? '(vide)' : p.blocks.length === 1 ? `bloc ${start}` : `blocs ${start}..${end}`;
    return `- Page ${i} — « ${p.title} » (${p.blocks.length} bloc(s), ${range})`;
  });
  return `${pages.length} page(s) :\n${lines.join('\n')}`;
}

/** Description complète : pages + blocs numérotés par index global. */
export function describePages(pages: ArchPage[]): string {
  const starts = pageStartIndexes(pages);
  const sections = pages.map((page, pIdx) => {
    const header = `## Page ${pIdx} — « ${page.title} »`;
    if (page.blocks.length === 0) {
      return `${header}\n_(page vide)_`;
    }
    const body = page.blocks
      .map((b, localIdx) => {
        const idx = starts[pIdx] + localIdx;
        if (b.type === 'markdown') {
          return `### Bloc ${idx} — markdown\n${b.content}`;
        }
        const title = b.boxDiagram?.title || b.seqDiagram?.title || b.dbDiagram?.title || '';
        return `### Bloc ${idx} — ${b.type}${title ? ` : ${title}` : ''}\n\`\`\`yaml\n${b.content}\n\`\`\``;
      })
      .join('\n\n');
    return `${header}\n\n${body}`;
  });
  return `${describePageList(pages)}\n\n${sections.join('\n\n')}`;
}

/** Vérifie qu'un index de page est valide. */
export function checkPageIndex(pages: ArchPage[], index: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= pages.length) {
    throw new Error(`Index de page ${index} hors limites (0..${pages.length - 1})`);
  }
}
