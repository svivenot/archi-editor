export type ComponentShape =
  | 'rounded-rect'
  | 'rect'
  | 'cylinder'
  | 'queue'
  | 'hexagon'
  | 'cloud'
  | 'actor'
  | 'container'
  | 'shield';

export interface ComponentCategory {
  id: string;
  label: string;
  badgeColor?: string;
}

export interface ComponentDefinition {
  id: string;
  name: string;
  category: string;
  symbol: string; // Symbol key in ArchSymbolRegistry or custom SVG data URI
  color: string;
  shape: ComponentShape;
  isContainer?: boolean;
  defaultTech?: string;
  defaultProps?: Record<string, string>;
  description?: string;
}

export interface ComponentLibrary {
  version: string;
  categories: ComponentCategory[];
  components: ComponentDefinition[];
}

// ============================================================================
// Diagramme de Boîtes Connectées (arch-box)
// ============================================================================

export interface ArchBoxNode {
  id: string;
  componentRef: string;
  label: string;
  subtitle?: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  parentId?: string;
  props?: Record<string, string>;
}

export type ArchEdgeStyle = 'solid' | 'dashed' | 'dotted';

/** Côté d'une boîte sur lequel une arête s'accroche. */
export type ArchHandleSide = 'left' | 'right' | 'top' | 'bottom';

export interface ArchBoxEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  protocol?: string;
  style?: ArchEdgeStyle;
  bidirectional?: boolean;
  animated?: boolean;
  /** Côté de la boîte source (droite par défaut). */
  sourceHandle?: ArchHandleSide;
  /** Côté de la boîte cible (gauche par défaut). */
  targetHandle?: ArchHandleSide;
}

export interface ArchBoxDiagram {
  title?: string;
  description?: string;
  nodes: ArchBoxNode[];
  edges: ArchBoxEdge[];
}

// ============================================================================
// Diagramme de Séquence (arch-seq)
// ============================================================================

export interface ArchSeqParticipant {
  id: string;
  label: string;
  componentRef?: string;
  subtitle?: string;
}

export type ArchSeqMessageKind = 'sync' | 'async' | 'reply' | 'self';
export type ArchSeqBlockKind = 'alt' | 'opt' | 'loop' | 'par';

export interface ArchSeqItem {
  id: string;
  type: 'message' | 'block' | 'note';
  // For 'message'
  from?: string;
  to?: string;
  label: string;
  protocol?: string;
  kind?: ArchSeqMessageKind;
  // For 'block' (loop, alt, opt, par)
  blockKind?: ArchSeqBlockKind;
  // For 'note'
  participantId?: string;
}

export interface ArchSeqDiagram {
  title?: string;
  description?: string;
  participants: ArchSeqParticipant[];
  items: ArchSeqItem[];
}

// ============================================================================
// Schéma de Base de Données (arch-db) — Entités / Relations (ERD)
// ============================================================================

export interface ArchDbColumn {
  name: string;
  type?: string; // VARCHAR(255), INT, UUID, TIMESTAMP...
  pk?: boolean; // clé primaire
  fk?: boolean; // clé étrangère
  nullable?: boolean;
  unique?: boolean;
  note?: string;
}

export interface ArchDbTable {
  id: string;
  name: string; // nom de la table
  schema?: string; // schéma SQL optionnel (public, dbo...)
  columns: ArchDbColumn[];
  position: { x: number; y: number };
  color?: string; // couleur d'accent de l'en-tête
}

export type ArchDbCardinality =
  | 'one-to-one'
  | 'one-to-many'
  | 'many-to-one'
  | 'many-to-many';

export interface ArchDbRelation {
  id: string;
  source: string; // id de la table source
  target: string; // id de la table cible
  sourceColumn?: string; // colonne source (clé étrangère)
  targetColumn?: string; // colonne cible (clé primaire référencée)
  cardinality?: ArchDbCardinality;
  label?: string;
}

export interface ArchDbDiagram {
  title?: string;
  description?: string;
  tables: ArchDbTable[];
  relations: ArchDbRelation[];
}

// ============================================================================
// Structure d'un Document (.arch.md)
// ============================================================================

export type ArchBlockType = 'markdown' | 'arch-box' | 'arch-seq' | 'arch-db';

export interface ArchDocumentBlock {
  id: string;
  type: ArchBlockType;
  content: string; // Markdown text OR YAML text
  boxDiagram?: ArchBoxDiagram;
  seqDiagram?: ArchSeqDiagram;
  dbDiagram?: ArchDbDiagram;
  parseError?: string;
}

// ============================================================================
// Protocole de communication Extension Host <-> Webview
// ============================================================================

export type ExtensionToWebviewMessage =
  | {
      type: 'init';
      documentText: string;
      fileName: string;
      library: ComponentLibrary;
    }
  | {
      type: 'externalDocumentChange';
      documentText: string;
    }
  | {
      type: 'libraryUpdated';
      library: ComponentLibrary;
    }
  | {
      type: 'triggerPdfExport';
    };

export type WebviewToExtensionMessage =
  | {
      type: 'ready';
    }
  | {
      type: 'updateDocument';
      documentText: string;
    }
  | {
      type: 'openAsText';
    }
  | {
      type: 'initWorkspaceLibrary';
    }
  | {
      type: 'savePdfPayload';
      pdfBase64?: string;
      printableHtml?: string;
      suggestedFileName: string;
    };
