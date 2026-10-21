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

export interface ArchBoxEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  protocol?: string;
  style?: ArchEdgeStyle;
  bidirectional?: boolean;
  animated?: boolean;
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
// Structure d'un Document (.arch.md)
// ============================================================================

export type ArchBlockType = 'markdown' | 'arch-box' | 'arch-seq';

export interface ArchDocumentBlock {
  id: string;
  type: ArchBlockType;
  content: string; // Markdown text OR YAML text
  boxDiagram?: ArchBoxDiagram;
  seqDiagram?: ArchSeqDiagram;
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
