import * as fs from 'fs';
import * as path from 'path';
import YAML from 'yaml';
import { ComponentLibraryService } from '../ComponentLibraryService';
import { ArchDocumentBlock, ComponentLibrary } from '../shared/archTypes';
import {
  ArchIssue,
  LayoutDirection,
  autoLayoutBoxDiagram,
  validateBlocks,
} from '../shared/archOps';
import {
  parseArchDocument,
  parseBoxYaml,
  parseSeqYaml,
  serializeArchDocument,
  serializeBoxYaml,
  serializeSeqYaml,
} from '../shared/documentParser';

const LIBRARY_FILES = ['arch-components.yaml', 'arch-components.yml', path.join('.arch', 'components.yaml')];

/** Bloc tel que fourni par un client MCP (diagrammes en objets JSON plutôt qu'en YAML). */
export type BlockInput =
  | { type: 'markdown'; content: string }
  | { type: 'arch-box'; diagram: Record<string, any>; layout?: 'auto' | 'keep'; direction?: LayoutDirection }
  | { type: 'arch-seq'; diagram: Record<string, any> };

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

function needsLayout(diagram: Record<string, any>): boolean {
  const nodes = Array.isArray(diagram.nodes) ? diagram.nodes : [];
  return nodes.some(
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
      const title = b.boxDiagram?.title || b.seqDiagram?.title || '';
      return `### Bloc ${idx} — ${b.type}${title ? ` : ${title}` : ''}\n\`\`\`yaml\n${b.content}\n\`\`\``;
    })
    .join('\n\n');
}
