import { ArchDocumentBlock } from './archTypes';

// ============================================================================
// Pages d'un document .arch.md
// ----------------------------------------------------------------------------
// Une page est délimitée dans le Markdown par un marqueur structurel :
//
//   <!-- arch:page title="Vue d'ensemble" -->
//
// Principes :
//  - Un fichier sans aucun marqueur = une seule page (format historique inchangé).
//  - Le marqueur est de la *structure*, pas du contenu : au découpage il est retiré du
//    Markdown et devient le titre de la page ; à la reconstruction il est réinjecté.
//  - À la reconstruction, aucun marqueur n'est émis s'il n'y a qu'une seule page, pour
//    que les documents mono-page restent octet-pour-octet identiques.
// ============================================================================

export interface ArchPage {
  id: string;
  title: string;
  blocks: ArchDocumentBlock[];
}

/** Reconnaît une ligne-marqueur de page et capture le titre optionnel. */
const PAGE_MARKER_REGEX = /^<!--\s*arch:page(?:\s+title="([^"]*)")?\s*-->\s*$/;

let pageSeq = 0;
let pageBlockSeq = 0;

/** Vrai si la ligne est un marqueur de page. */
export function isPageMarkerLine(line: string): boolean {
  return PAGE_MARKER_REGEX.test(line.trim());
}

/** Construit la ligne-marqueur Markdown pour une page (titre échappé des guillemets). */
export function makePageMarker(title: string): string {
  const clean = (title || '').replace(/"/g, '').trim();
  return clean ? `<!-- arch:page title="${clean}" -->` : '<!-- arch:page -->';
}

/** Déduit un titre de page : premier titre Markdown (# ou ##) rencontré, sinon « Page N ». */
export function derivePageTitle(page: ArchPage, index: number): string {
  for (const block of page.blocks) {
    if (block.type !== 'markdown') continue;
    for (const rawLine of block.content.split(/\r?\n/)) {
      const m = rawLine.match(/^#{1,6}\s+(.*\S)\s*$/);
      if (m) return m[1].trim();
    }
  }
  return `Page ${index + 1}`;
}

function trimBlankEdges(text: string): string {
  return text.replace(/^\s*\n+|\n+\s*$/g, '');
}

/**
 * Découpe une liste de blocs à plat en pages, en scannant le contenu des blocs Markdown
 * ligne par ligne pour repérer les marqueurs — robuste même si un aller-retour
 * serialize → parse a fusionné un marqueur au milieu d'un bloc Markdown.
 */
export function splitBlocksIntoPages(blocks: ArchDocumentBlock[]): ArchPage[] {
  const pages: ArchPage[] = [];
  let current: ArchPage | null = null;

  const openPage = (title: string): void => {
    current = { id: `page-${++pageSeq}`, title, blocks: [] };
    pages.push(current);
  };

  for (const block of blocks) {
    if (block.type !== 'markdown') {
      if (!current) openPage('');
      current!.blocks.push(block);
      continue;
    }

    // Découpe le contenu Markdown sur les lignes-marqueur.
    const lines = block.content.split(/\r?\n/);
    let buffer: string[] = [];

    const flushBuffer = (): void => {
      const text = trimBlankEdges(buffer.join('\n'));
      buffer = [];
      if (text.length === 0) return;
      if (!current) openPage('');
      current!.blocks.push({
        id: `block-md-p-${++pageBlockSeq}`,
        type: 'markdown',
        content: text,
      });
    };

    for (const line of lines) {
      const marker = line.trim().match(PAGE_MARKER_REGEX);
      if (marker) {
        flushBuffer();
        openPage(marker[1] || '');
      } else {
        buffer.push(line);
      }
    }
    flushBuffer();
  }

  if (pages.length === 0) openPage('');

  for (let i = 0; i < pages.length; i++) {
    if (!pages[i].title) {
      pages[i].title = derivePageTitle(pages[i], i);
    }
  }

  return pages;
}

/**
 * Reconstruit la liste de blocs à plat à partir des pages. Un marqueur de page n'est émis
 * que s'il y a au moins deux pages (les documents mono-page restent sans marqueur).
 */
export function flattenPagesToBlocks(pages: ArchPage[]): ArchDocumentBlock[] {
  if (pages.length === 0) return [];
  if (pages.length === 1) return [...pages[0].blocks];

  const out: ArchDocumentBlock[] = [];
  pages.forEach((page, i) => {
    out.push({
      id: `block-md-marker-${i + 1}`,
      type: 'markdown',
      content: makePageMarker(page.title || `Page ${i + 1}`),
    });
    out.push(...page.blocks);
  });
  return out;
}

/** Nombre total de blocs de contenu (toutes pages confondues, hors marqueurs). */
export function countContentBlocks(pages: ArchPage[]): number {
  return pages.reduce((sum, p) => sum + p.blocks.length, 0);
}

/**
 * Traduit un index de bloc global (dans la concaténation des blocs de contenu de toutes les
 * pages) en coordonnées (page, bloc local). Lève une erreur si l'index est hors limites.
 */
export function locateBlock(
  pages: ArchPage[],
  globalIndex: number
): { pageIndex: number; localIndex: number } {
  if (!Number.isInteger(globalIndex) || globalIndex < 0) {
    throw new Error(`Index de bloc ${globalIndex} invalide`);
  }
  let offset = globalIndex;
  for (let p = 0; p < pages.length; p++) {
    if (offset < pages[p].blocks.length) {
      return { pageIndex: p, localIndex: offset };
    }
    offset -= pages[p].blocks.length;
  }
  const total = countContentBlocks(pages);
  throw new Error(`Index de bloc ${globalIndex} hors limites (0..${total - 1})`);
}
