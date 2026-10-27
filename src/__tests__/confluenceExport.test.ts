import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DEFAULT_COMPONENT_LIBRARY } from '../shared/defaultLibrary';
import { buildBlock, writeBlocks } from '../mcp/documentOps';
import { exportConfluence } from '../mcp/confluenceExport';

const lib = DEFAULT_COMPONENT_LIBRARY;

function isPng(file: string): boolean {
  const b = fs.readFileSync(file);
  return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
}

describe('Archi Editor - Export Confluence (storage + PNG)', () => {
  it('produit un corps storage et un PNG par diagramme (box, seq, db)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archi-confl-'));
    const file = path.join(dir, 'doc.arch.md');

    const blocks = [
      buildBlock({ type: 'markdown', content: '# Mon Dossier\n\nUne **intro** avec du `code`.' }, lib),
      buildBlock(
        {
          type: 'arch-box',
          diagram: {
            nodes: [
              { id: 'api', componentRef: 'microservice', label: 'API' },
              { id: 'db', componentRef: 'postgresql', label: 'DB' },
            ],
            edges: [{ source: 'api', target: 'db', protocol: 'TCP/5432' }],
          },
        },
        lib
      ),
      buildBlock(
        {
          type: 'arch-seq',
          diagram: {
            participants: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
            items: [{ type: 'message', from: 'a', to: 'b', label: 'ping' }],
          },
        },
        lib
      ),
      buildBlock(
        {
          type: 'arch-db',
          diagram: {
            tables: [
              { id: 'c', name: 'customer', columns: [{ name: 'id', type: 'UUID', pk: true }] },
              { id: 'o', name: 'order', columns: [{ name: 'customer_id', type: 'UUID', fk: true }] },
            ],
            relations: [{ source: 'o', target: 'c', sourceColumn: 'customer_id', targetColumn: 'id' }],
          },
        },
        lib
      ),
    ];
    writeBlocks(file, blocks, lib);

    const result = await exportConfluence({ absPath: file, library: lib });

    // Titre extrait du premier H1
    expect(result.title).toBe('Mon Dossier');
    // Trois diagrammes -> trois images PNG valides
    expect(result.images).toHaveLength(3);
    for (const im of result.images) {
      expect(fs.existsSync(im.file)).toBe(true);
      expect(isPng(im.file)).toBe(true);
    }
    // Corps storage : macros image + prose convertie + macro code
    expect(result.body).toContain('<ac:image');
    expect(result.body).toContain(result.images[0].filename);
    expect(result.body).toContain('<strong>intro</strong>');
    expect(result.body).toContain('<h1>Mon Dossier</h1>');
    // Fichier de corps écrit sur disque
    expect(fs.existsSync(result.bodyPath)).toBe(true);
  });
});
