import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DEFAULT_COMPONENT_LIBRARY } from '../shared/defaultLibrary';
import { ArchBoxDiagram } from '../shared/archTypes';
import {
  autoLayoutBoxDiagram,
  validateArchDocument,
  validateBoxDiagram,
  validateSeqDiagram,
} from '../shared/archOps';
import { parseArchDocument } from '../shared/documentParser';
import { buildBlock, loadLibrary, readBlocks, writeBlocks } from '../mcp/documentOps';

const lib = DEFAULT_COMPONENT_LIBRARY;

const nestedDiagram: ArchBoxDiagram = {
  title: 'VPC imbriqué',
  nodes: [
    { id: 'user', componentRef: 'user-actor', label: 'Client', position: { x: 0, y: 0 } },
    { id: 'vpc', componentRef: 'aws-vpc', label: 'VPC', position: { x: 0, y: 0 } },
    { id: 'pub', componentRef: 'aws-subnet', label: 'Public', parentId: 'vpc', position: { x: 0, y: 0 } },
    { id: 'priv', componentRef: 'aws-subnet', label: 'Privé', parentId: 'vpc', position: { x: 0, y: 0 } },
    { id: 'alb', componentRef: 'aws-alb', label: 'ALB', parentId: 'pub', position: { x: 0, y: 0 } },
    { id: 'api', componentRef: 'aws-ecs', label: 'API', parentId: 'priv', position: { x: 0, y: 0 }, props: { a: '1', b: '2' } },
    { id: 'worker', componentRef: 'worker', label: 'Worker', parentId: 'priv', position: { x: 0, y: 0 } },
    { id: 'db', componentRef: 'aws-rds', label: 'DB', parentId: 'priv', position: { x: 0, y: 0 } },
    { id: 'q', componentRef: 'aws-sqs', label: 'Queue', parentId: 'vpc', position: { x: 0, y: 0 } },
    { id: 'kc', componentRef: 'keycloak', label: 'Keycloak', position: { x: 0, y: 0 } },
    { id: 'empty', componentRef: 'zone-group', label: 'Zone vide', position: { x: 0, y: 0 } },
  ],
  edges: [
    { id: 'e1', source: 'user', target: 'alb' },
    { id: 'e2', source: 'alb', target: 'api' },
    { id: 'e3', source: 'api', target: 'db' },
    { id: 'e4', source: 'api', target: 'q' },
    { id: 'e5', source: 'q', target: 'worker' },
    { id: 'e6', source: 'alb', target: 'kc' },
    { id: 'e7', source: 'user', target: 'vpc' },
  ],
};

type Rect = { x: number; y: number; w: number; h: number };

function rects(diagram: ArchBoxDiagram): Map<string, Rect> {
  return new Map(
    diagram.nodes.map((n) => [
      n.id,
      {
        x: n.position.x,
        y: n.position.y,
        w: n.width ?? 250,
        h: n.height ?? 92 + Math.min(Object.keys(n.props || {}).length, 4) * 18,
      },
    ])
  );
}

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const contains = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.w <= outer.x + outer.w &&
  inner.y + inner.h <= outer.y + outer.h;

describe('Archi Editor - Mise en page automatique', () => {
  for (const direction of ['LR', 'TB'] as const) {
    it(`place les enfants dans leurs conteneurs sans chevauchement (${direction})`, () => {
      const laid = autoLayoutBoxDiagram(nestedDiagram, lib, { direction });
      const r = rects(laid);

      for (const n of laid.nodes) {
        if (n.parentId) {
          expect(contains(r.get(n.parentId)!, r.get(n.id)!), `${n.id} dans ${n.parentId}`).toBe(true);
        }
      }
      for (const a of laid.nodes) {
        for (const b of laid.nodes) {
          if (a.id < b.id && a.parentId === b.parentId) {
            expect(overlaps(r.get(a.id)!, r.get(b.id)!), `${a.id} / ${b.id}`).toBe(false);
          }
        }
      }
      // Diagramme raisonnablement compact
      expect(Math.max(...laid.nodes.map((n) => n.position.x))).toBeLessThan(2500);
    });
  }

  it('dimensionne uniquement les conteneurs', () => {
    const laid = autoLayoutBoxDiagram(nestedDiagram, lib);
    expect(laid.nodes.find((n) => n.id === 'vpc')?.width).toBeGreaterThan(500);
    expect(laid.nodes.find((n) => n.id === 'api')?.width).toBeUndefined();
  });
});

describe('Archi Editor - Validation', () => {
  it('détecte références cassées et doublons dans arch-box', () => {
    const issues = validateBoxDiagram(
      {
        nodes: [
          { id: 'a', componentRef: 'postgresql', label: 'A', position: { x: 0, y: 0 } },
          { id: 'a', componentRef: 'inconnu', label: 'A2', position: { x: 0, y: 0 }, parentId: 'zz' },
        ],
        edges: [{ id: 'e', source: 'a', target: 'b' }],
      },
      lib
    );
    const msgs = issues.map((i) => i.message).join('\n');
    expect(msgs).toContain('dupliqué');
    expect(msgs).toContain('componentRef inconnu "inconnu"');
    expect(msgs).toContain('parentId "zz"');
    expect(msgs).toContain('cible "b"');
  });

  it('détecte les participants inconnus dans arch-seq', () => {
    const issues = validateSeqDiagram(
      {
        participants: [{ id: 'p1', label: 'P1' }],
        items: [
          { id: 'm1', type: 'message', from: 'p1', to: 'p2', label: 'x' },
          { id: 'n1', type: 'note', participantId: 'p9', label: 'note' },
        ],
      },
      lib
    );
    expect(issues.filter((i) => i.level === 'error')).toHaveLength(2);
  });

  it('valide sans erreur le document d’exemple', () => {
    const text = fs.readFileSync(path.join(__dirname, '../../examples/architecture-demo.arch.md'), 'utf-8');
    expect(validateArchDocument(text, lib).filter((i) => i.level === 'error')).toEqual([]);
  });
});

describe('Archi Editor - Opérations de document (MCP)', () => {
  it('construit, écrit et relit un document généré', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archi-mcp-'));
    fs.writeFileSync(
      path.join(dir, 'arch-components.yaml'),
      'components:\n  - id: mon-moteur\n    name: Moteur\n    category: custom\n'
    );
    const file = path.join(dir, 'docs', 'gen.arch.md');
    const library = loadLibrary(path.dirname(file));
    expect(library.components.some((c) => c.id === 'mon-moteur')).toBe(true);

    const blocks = [
      buildBlock({ type: 'markdown', content: '# Généré' }, library),
      buildBlock(
        {
          type: 'arch-box',
          diagram: {
            nodes: [
              { id: 'm', componentRef: 'mon-moteur', label: 'Moteur', props: { port: 8080 } },
              { id: 'db', componentRef: 'postgresql', label: 'DB' },
            ],
            edges: [{ source: 'm', target: 'db', protocol: 'TCP/5432' }],
          },
        },
        library
      ),
      buildBlock(
        {
          type: 'arch-seq',
          diagram: {
            participants: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
            items: [{ type: 'message', from: 'a', to: 'b', label: 'ping' }],
          },
        },
        library
      ),
    ];
    const result = writeBlocks(file, blocks, library);
    expect(result.issues).toEqual([]);

    const reread = readBlocks(file);
    expect(reread.map((b) => b.type)).toEqual(['markdown', 'arch-box', 'arch-seq']);
    const box = reread[1].boxDiagram!;
    expect(box.nodes[0].props).toEqual({ port: '8080' });
    expect(box.nodes[0].position.x).not.toBe(box.nodes[1].position.x);
    expect(box.edges[0].id).toBe('edge-1');
    expect(parseArchDocument(fs.readFileSync(file, 'utf-8'))).toHaveLength(3);
  });
});
