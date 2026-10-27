import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DEFAULT_COMPONENT_LIBRARY } from '../shared/defaultLibrary';
import { ArchDocumentBlock } from '../shared/archTypes';
import {
  countContentBlocks,
  derivePageTitle,
  flattenPagesToBlocks,
  locateBlock,
  makePageMarker,
  splitBlocksIntoPages,
} from '../shared/archPages';
import { parseArchDocument, serializeArchDocument } from '../shared/documentParser';
import {
  buildBlock,
  buildPage,
  describePageList,
  loadLibrary,
  readPages,
  writePages,
} from '../mcp/documentOps';

const lib = DEFAULT_COMPONENT_LIBRARY;

function md(content: string): ArchDocumentBlock {
  return { id: `md-${content.slice(0, 6)}`, type: 'markdown', content };
}

describe('archPages — découpage / recollage', () => {
  it('un document sans marqueur = une seule page', () => {
    const blocks = parseArchDocument('# Titre\n\nUn peu de texte.');
    const pages = splitBlocksIntoPages(blocks);
    expect(pages).toHaveLength(1);
    expect(pages[0].title).toBe('Titre');
  });

  it('ne réémet aucun marqueur pour un document mono-page (octet-stable)', () => {
    const src = '# Titre\n\nUn peu de texte.\n';
    const roundTrip = serializeArchDocument(
      flattenPagesToBlocks(splitBlocksIntoPages(parseArchDocument(src)))
    );
    expect(roundTrip).toBe(serializeArchDocument(parseArchDocument(src)));
    expect(roundTrip).not.toContain('arch:page');
  });

  it('découpe sur les marqueurs et récupère les titres', () => {
    const src = [
      '# Intro',
      '',
      'Texte page 1.',
      '',
      makePageMarker('Deuxième page'),
      '',
      '## Section 2',
    ].join('\n');
    const pages = splitBlocksIntoPages(parseArchDocument(src));
    expect(pages).toHaveLength(2);
    expect(pages[0].title).toBe('Intro');
    expect(pages[1].title).toBe('Deuxième page');
    // Le marqueur ne doit pas rester dans le contenu
    expect(pages[1].blocks.map((b) => b.content).join('\n')).not.toContain('arch:page');
  });

  it('émet un marqueur par page quand il y a ≥ 2 pages', () => {
    const pages = [
      { id: 'p1', title: 'Un', blocks: [md('# Un\n\nA')] },
      { id: 'p2', title: 'Deux', blocks: [md('# Deux\n\nB')] },
    ];
    const text = serializeArchDocument(flattenPagesToBlocks(pages));
    expect(text).toContain('<!-- arch:page title="Un" -->');
    expect(text).toContain('<!-- arch:page title="Deux" -->');
  });

  it('survit à un aller-retour serialize → parse même avec marqueur fusionné', () => {
    const pages = [
      { id: 'p1', title: 'Vue A', blocks: [md('# Vue A\n\nContenu A.')] },
      { id: 'p2', title: 'Vue B', blocks: [md('## Vue B\n\nContenu B.')] },
      { id: 'p3', title: 'Vue C', blocks: [md('## Vue C\n\nContenu C.')] },
    ];
    const text = serializeArchDocument(flattenPagesToBlocks(pages));
    const reparsed = splitBlocksIntoPages(parseArchDocument(text));
    expect(reparsed.map((p) => p.title)).toEqual(['Vue A', 'Vue B', 'Vue C']);
    expect(countContentBlocks(reparsed)).toBe(3);
  });

  it('préserve les diagrammes dans leur page', () => {
    const box = buildBlock(
      {
        type: 'arch-box',
        diagram: {
          nodes: [
            { id: 'a', componentRef: 'microservice', label: 'A' },
            { id: 'b', componentRef: 'postgresql', label: 'B' },
          ],
          edges: [{ source: 'a', target: 'b' }],
        },
      },
      lib
    );
    const pages = [
      { id: 'p1', title: 'Texte', blocks: [md('# Dossier\n\nIntro.')] },
      { id: 'p2', title: 'Schéma', blocks: [box] },
    ];
    const reparsed = splitBlocksIntoPages(
      parseArchDocument(serializeArchDocument(flattenPagesToBlocks(pages)))
    );
    expect(reparsed).toHaveLength(2);
    expect(reparsed[1].blocks[0].type).toBe('arch-box');
    expect(reparsed[1].blocks[0].boxDiagram!.nodes).toHaveLength(2);
  });

  it('derivePageTitle : premier titre Markdown sinon « Page N »', () => {
    expect(derivePageTitle({ id: 'p', title: '', blocks: [md('## Hello\n\nx')] }, 0)).toBe('Hello');
    expect(derivePageTitle({ id: 'p', title: '', blocks: [md('juste du texte')] }, 2)).toBe('Page 3');
  });

  it('locateBlock : index global → (page, bloc local)', () => {
    const pages = [
      { id: 'p1', title: 'A', blocks: [md('a0'), md('a1')] },
      { id: 'p2', title: 'B', blocks: [md('b0')] },
    ];
    expect(locateBlock(pages, 0)).toEqual({ pageIndex: 0, localIndex: 0 });
    expect(locateBlock(pages, 1)).toEqual({ pageIndex: 0, localIndex: 1 });
    expect(locateBlock(pages, 2)).toEqual({ pageIndex: 1, localIndex: 0 });
    expect(() => locateBlock(pages, 3)).toThrow(/hors limites/);
  });
});

describe('documentOps — pages (MCP)', () => {
  it('écrit et relit un document multi-pages', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archi-pages-'));
    const file = path.join(dir, 'doc.arch.md');
    const library = loadLibrary(dir);

    const pages = [
      buildPage({ title: 'Contexte', blocks: [{ type: 'markdown', content: '# Dossier\n\nContexte.' }] }, 0, library),
      buildPage(
        {
          title: 'Composants',
          blocks: [
            {
              type: 'arch-box',
              diagram: {
                nodes: [
                  { id: 'api', componentRef: 'microservice', label: 'API' },
                  { id: 'db', componentRef: 'postgresql', label: 'DB' },
                ],
                edges: [{ source: 'api', target: 'db' }],
              },
            },
          ],
        },
        1,
        library
      ),
    ];

    const result = writePages(file, pages, library);
    expect(result.pageCount).toBe(2);
    expect(result.blockCount).toBe(2);
    expect(result.issues).toEqual([]);

    const reread = readPages(file);
    expect(reread.map((p) => p.title)).toEqual(['Contexte', 'Composants']);
    expect(reread[1].blocks[0].type).toBe('arch-box');

    const summary = describePageList(reread);
    expect(summary).toContain('Page 0 — « Contexte »');
    expect(summary).toContain('Page 1 — « Composants »');
  });
});
