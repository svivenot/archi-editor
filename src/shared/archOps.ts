import dagre from '@dagrejs/dagre';
import {
  ArchBoxDiagram,
  ArchDbDiagram,
  ArchDocumentBlock,
  ArchSeqDiagram,
  ComponentDefinition,
  ComponentLibrary,
} from './archTypes';
import { parseArchDocument } from './documentParser';

// ============================================================================
// Validation des diagrammes
// ============================================================================

export interface ArchIssue {
  level: 'error' | 'warning';
  blockIndex?: number;
  message: string;
}

function findDuplicates(ids: string[]): string[] {
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) dups.add(id);
    seen.add(id);
  }
  return Array.from(dups);
}

export function validateBoxDiagram(
  diagram: ArchBoxDiagram,
  library: ComponentLibrary
): ArchIssue[] {
  const issues: ArchIssue[] = [];
  const components = new Map(library.components.map((c) => [c.id, c]));
  const nodeIds = new Set(diagram.nodes.map((n) => n.id));

  for (const dup of findDuplicates(diagram.nodes.map((n) => n.id))) {
    issues.push({ level: 'error', message: `Identifiant de nœud dupliqué : "${dup}"` });
  }
  for (const dup of findDuplicates(diagram.edges.map((e) => e.id))) {
    issues.push({ level: 'error', message: `Identifiant de lien dupliqué : "${dup}"` });
  }

  for (const n of diagram.nodes) {
    if (!components.has(n.componentRef)) {
      issues.push({
        level: 'warning',
        message: `Nœud "${n.id}" : componentRef inconnu "${n.componentRef}" (rendu en boîte générique)`,
      });
    }
    if (n.parentId) {
      const parent = diagram.nodes.find((p) => p.id === n.parentId);
      if (!parent) {
        issues.push({
          level: 'error',
          message: `Nœud "${n.id}" : parentId "${n.parentId}" introuvable`,
        });
      } else if (!components.get(parent.componentRef)?.isContainer) {
        issues.push({
          level: 'warning',
          message: `Nœud "${n.id}" : le parent "${n.parentId}" n'est pas un conteneur (isContainer)`,
        });
      }
    }
  }

  for (const e of diagram.edges) {
    if (!nodeIds.has(e.source)) {
      issues.push({ level: 'error', message: `Lien "${e.id}" : source "${e.source}" introuvable` });
    }
    if (!nodeIds.has(e.target)) {
      issues.push({ level: 'error', message: `Lien "${e.id}" : cible "${e.target}" introuvable` });
    }
  }

  return issues;
}

export function validateSeqDiagram(
  diagram: ArchSeqDiagram,
  library: ComponentLibrary
): ArchIssue[] {
  const issues: ArchIssue[] = [];
  const components = new Set(library.components.map((c) => c.id));
  const participantIds = new Set(diagram.participants.map((p) => p.id));

  for (const dup of findDuplicates(diagram.participants.map((p) => p.id))) {
    issues.push({ level: 'error', message: `Participant dupliqué : "${dup}"` });
  }
  for (const dup of findDuplicates(diagram.items.map((i) => i.id))) {
    issues.push({ level: 'error', message: `Identifiant d'étape dupliqué : "${dup}"` });
  }

  for (const p of diagram.participants) {
    if (p.componentRef && !components.has(p.componentRef)) {
      issues.push({
        level: 'warning',
        message: `Participant "${p.id}" : componentRef inconnu "${p.componentRef}"`,
      });
    }
  }

  for (const it of diagram.items) {
    if (it.type === 'message') {
      for (const end of [it.from, it.to]) {
        if (!end || !participantIds.has(end)) {
          issues.push({
            level: 'error',
            message: `Message "${it.id}" : participant "${end ?? ''}" introuvable`,
          });
        }
      }
    } else if (it.type === 'note') {
      if (!it.participantId || !participantIds.has(it.participantId)) {
        issues.push({
          level: 'error',
          message: `Note "${it.id}" : participantId "${it.participantId ?? ''}" introuvable`,
        });
      }
    }
  }

  return issues;
}

export function validateDbDiagram(diagram: ArchDbDiagram): ArchIssue[] {
  const issues: ArchIssue[] = [];
  const tableIds = new Set(diagram.tables.map((t) => t.id));

  for (const dup of findDuplicates(diagram.tables.map((t) => t.id))) {
    issues.push({ level: 'error', message: `Identifiant de table dupliqué : "${dup}"` });
  }
  for (const dup of findDuplicates(diagram.relations.map((r) => r.id))) {
    issues.push({ level: 'error', message: `Identifiant de relation dupliqué : "${dup}"` });
  }

  for (const t of diagram.tables) {
    if (t.columns.length === 0) {
      issues.push({ level: 'warning', message: `Table "${t.name}" : aucune colonne définie` });
    }
    for (const dup of findDuplicates(t.columns.map((c) => c.name))) {
      issues.push({ level: 'warning', message: `Table "${t.name}" : colonne dupliquée "${dup}"` });
    }
  }

  for (const r of diagram.relations) {
    const srcTable = diagram.tables.find((t) => t.id === r.source);
    const tgtTable = diagram.tables.find((t) => t.id === r.target);
    if (!tableIds.has(r.source)) {
      issues.push({ level: 'error', message: `Relation "${r.id}" : table source "${r.source}" introuvable` });
    }
    if (!tableIds.has(r.target)) {
      issues.push({ level: 'error', message: `Relation "${r.id}" : table cible "${r.target}" introuvable` });
    }
    if (srcTable && r.sourceColumn && !srcTable.columns.some((c) => c.name === r.sourceColumn)) {
      issues.push({
        level: 'warning',
        message: `Relation "${r.id}" : colonne source "${r.sourceColumn}" absente de "${srcTable.name}"`,
      });
    }
    if (tgtTable && r.targetColumn && !tgtTable.columns.some((c) => c.name === r.targetColumn)) {
      issues.push({
        level: 'warning',
        message: `Relation "${r.id}" : colonne cible "${r.targetColumn}" absente de "${tgtTable.name}"`,
      });
    }
  }

  return issues;
}

export function validateBlocks(
  blocks: ArchDocumentBlock[],
  library: ComponentLibrary
): ArchIssue[] {
  const issues: ArchIssue[] = [];
  blocks.forEach((block, blockIndex) => {
    if (block.parseError) {
      issues.push({ level: 'error', blockIndex, message: `YAML invalide : ${block.parseError}` });
      return;
    }
    const blockIssues =
      block.type === 'arch-box' && block.boxDiagram
        ? validateBoxDiagram(block.boxDiagram, library)
        : block.type === 'arch-seq' && block.seqDiagram
        ? validateSeqDiagram(block.seqDiagram, library)
        : block.type === 'arch-db' && block.dbDiagram
        ? validateDbDiagram(block.dbDiagram)
        : [];
    for (const issue of blockIssues) {
      issues.push({ ...issue, blockIndex });
    }
  });
  return issues;
}

export function validateArchDocument(text: string, library: ComponentLibrary): ArchIssue[] {
  return validateBlocks(parseArchDocument(text), library);
}

// ============================================================================
// Mise en page automatique (Dagre, conteneurs imbriqués via parentId)
// ============================================================================

export type LayoutDirection = 'LR' | 'TB';

export interface LayoutOptions {
  direction?: LayoutDirection;
}

// Dimensions approximatives des cartes rendues par ArchBoxEditor (.arch-rf-node : 195-250px)
const NODE_WIDTH = 250;
const NODE_BASE_HEIGHT = 92;
const NODE_PROP_HEIGHT = 18;
const CONTAINER_PAD_X = 40;
const CONTAINER_PAD_TOP = 76;
const CONTAINER_PAD_BOTTOM = 40;

function estimateNodeHeight(propsCount: number): number {
  return NODE_BASE_HEIGHT + Math.min(propsCount, 4) * NODE_PROP_HEIGHT;
}

/**
 * Calcule les positions (absolues) de tous les nœuds et la taille des conteneurs.
 * Les nœuds dont le parentId référence un conteneur sont placés à l'intérieur de celui-ci.
 */
export function autoLayoutBoxDiagram(
  diagram: ArchBoxDiagram,
  library: ComponentLibrary,
  options: LayoutOptions = {}
): ArchBoxDiagram {
  const components = new Map<string, ComponentDefinition>(
    library.components.map((c) => [c.id, c])
  );
  const nodeById = new Map(diagram.nodes.map((n) => [n.id, n]));
  const childrenOf = new Map<string, string[]>();
  for (const n of diagram.nodes) {
    if (n.parentId && nodeById.has(n.parentId)) {
      const list = childrenOf.get(n.parentId) || [];
      list.push(n.id);
      childrenOf.set(n.parentId, list);
    }
  }
  const isContainer = (id: string): boolean => {
    const n = nodeById.get(id);
    return Boolean(n && (components.get(n.componentRef)?.isContainer || childrenOf.has(id)));
  };

  const depthOf = (id: string): number => {
    const parentId = nodeById.get(id)?.parentId;
    return parentId && nodeById.has(parentId) ? 1 + depthOf(parentId) : 0;
  };
  const depth = Math.max(0, ...diagram.nodes.map((n) => depthOf(n.id)));
  const direction = options.direction || 'LR';
  // Espace nécessaire pour loger les marges des conteneurs (d niveaux de part et d'autre)
  const padAcrossX = CONTAINER_PAD_X * 2 * depth + 70;
  const padAcrossY = (CONTAINER_PAD_TOP + CONTAINER_PAD_BOTTOM) * depth + 60;
  const rankGap = Math.max(150, direction === 'LR' ? padAcrossX : padAcrossY);
  const nodeGap = Math.max(60, direction === 'LR' ? padAcrossY : padAcrossX);

  const g = new dagre.graphlib.Graph({ compound: true });
  g.setGraph({
    rankdir: direction,
    nodesep: nodeGap,
    // En mode compound, Dagre insère 2 rangs de bordure par niveau d'imbrication
    ranksep: rankGap / (2 * depth + 1),
    marginx: 40,
    marginy: 40,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of diagram.nodes) {
    if (childrenOf.has(n.id)) {
      g.setNode(n.id, {});
    } else if (isContainer(n.id)) {
      g.setNode(n.id, { width: 320, height: 180 });
    } else {
      g.setNode(n.id, {
        width: NODE_WIDTH,
        height: estimateNodeHeight(Object.keys(n.props || {}).length),
      });
    }
  }
  for (const n of diagram.nodes) {
    if (n.parentId && nodeById.has(n.parentId)) {
      g.setParent(n.id, n.parentId);
    }
  }
  // Dagre ne sait pas relier des clusters : on ne garde que les liens entre feuilles
  for (const e of diagram.edges) {
    if (
      nodeById.has(e.source) &&
      nodeById.has(e.target) &&
      !isContainer(e.source) &&
      !isContainer(e.target) &&
      e.source !== e.target
    ) {
      g.setEdge(e.source, e.target);
    }
  }

  dagre.layout(g);

  // Boîtes des feuilles (coin haut-gauche + taille)
  const boxes = new Map<string, { x: number; y: number; w: number; h: number }>();
  for (const n of diagram.nodes) {
    if (isContainer(n.id)) continue;
    const laid = g.node(n.id);
    boxes.set(n.id, {
      x: laid.x - laid.width / 2,
      y: laid.y - laid.height / 2,
      w: laid.width,
      h: laid.height,
    });
  }

  // Conteneurs : englobent leurs descendants avec marges (calcul post-ordre)
  const computeContainer = (id: string): { x: number; y: number; w: number; h: number } => {
    const existing = boxes.get(id);
    if (existing) return existing;
    const kids = (childrenOf.get(id) || []).map((kid) => computeContainer(kid));
    let box: { x: number; y: number; w: number; h: number };
    if (kids.length === 0) {
      const laid = g.node(id);
      box = { x: laid.x - laid.width / 2, y: laid.y - laid.height / 2, w: laid.width, h: laid.height };
    } else {
      const minX = Math.min(...kids.map((k) => k.x));
      const minY = Math.min(...kids.map((k) => k.y));
      const maxX = Math.max(...kids.map((k) => k.x + k.w));
      const maxY = Math.max(...kids.map((k) => k.y + k.h));
      box = {
        x: minX - CONTAINER_PAD_X,
        y: minY - CONTAINER_PAD_TOP,
        w: maxX - minX + CONTAINER_PAD_X * 2,
        h: maxY - minY + CONTAINER_PAD_TOP + CONTAINER_PAD_BOTTOM,
      };
    }
    boxes.set(id, box);
    return box;
  };
  for (const n of diagram.nodes) {
    if (isContainer(n.id)) computeContainer(n.id);
  }

  // Décale l'ensemble pour démarrer à (40, 40)
  const all = Array.from(boxes.values());
  const offsetX = 40 - Math.min(...all.map((b) => b.x));
  const offsetY = 40 - Math.min(...all.map((b) => b.y));

  return {
    ...diagram,
    nodes: diagram.nodes.map((n) => {
      const box = boxes.get(n.id)!;
      const laidOut = {
        ...n,
        position: { x: Math.round(box.x + offsetX), y: Math.round(box.y + offsetY) },
      };
      if (isContainer(n.id)) {
        laidOut.width = Math.round(box.w);
        laidOut.height = Math.round(box.h);
      } else {
        delete laidOut.width;
        delete laidOut.height;
      }
      return laidOut;
    }),
  };
}

// ============================================================================
// Mise en page automatique des schémas de base de données (Dagre)
// ============================================================================

// Dimensions approximatives des cartes de table rendues par ArchDbEditor
const DB_TABLE_WIDTH = 240;
const DB_HEADER_HEIGHT = 44;
const DB_ROW_HEIGHT = 24;

function estimateTableHeight(columnsCount: number): number {
  return DB_HEADER_HEIGHT + Math.max(1, columnsCount) * DB_ROW_HEIGHT + 8;
}

/**
 * Calcule les positions des tables d'un schéma de base de données à partir des relations.
 */
export function autoLayoutDbDiagram(
  diagram: ArchDbDiagram,
  options: LayoutOptions = {}
): ArchDbDiagram {
  const direction = options.direction || 'LR';
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: direction, nodesep: 70, ranksep: 140, marginx: 40, marginy: 40 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const t of diagram.tables) {
    g.setNode(t.id, { width: DB_TABLE_WIDTH, height: estimateTableHeight(t.columns.length) });
  }
  for (const r of diagram.relations) {
    if (g.hasNode(r.source) && g.hasNode(r.target) && r.source !== r.target) {
      g.setEdge(r.source, r.target);
    }
  }

  dagre.layout(g);

  return {
    ...diagram,
    tables: diagram.tables.map((t) => {
      const laid = g.node(t.id);
      if (!laid) return t;
      return {
        ...t,
        position: {
          x: Math.round(laid.x - laid.width / 2),
          y: Math.round(laid.y - laid.height / 2),
        },
      };
    }),
  };
}
