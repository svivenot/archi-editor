import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DEFAULT_COMPONENT_LIBRARY } from '../shared/defaultLibrary';
import { mergeComponentLibraries } from '../ComponentLibraryService';
import {
  parseArchDocument,
  serializeArchDocument,
} from '../shared/documentParser';
import { exportDocumentToPdfFile } from '../PdfExportService';

describe('Archi Editor - Bibliothèque de Composants & Symboles', () => {
  it('contient les symboles requis : MS SQL Server, Oracle, PostgreSQL, RabbitMQ, Traefik, Keycloak', () => {
    const ids = new Set(DEFAULT_COMPONENT_LIBRARY.components.map((c) => c.id));
    expect(ids.has('mssql')).toBe(true);
    expect(ids.has('oracle')).toBe(true);
    expect(ids.has('postgresql')).toBe(true);
    expect(ids.has('rabbitmq')).toBe(true);
    expect(ids.has('traefik')).toBe(true);
    expect(ids.has('keycloak')).toBe(true);
    expect(ids.has('spiffworkflow')).toBe(true);
    expect(ids.has('worker')).toBe(true);
    expect(ids.has('web-service')).toBe(true);
  });

  it('contient les catalogues AWS et Microsoft Azure complets', () => {
    const awsComponents = DEFAULT_COMPONENT_LIBRARY.components.filter(
      (c) => c.category === 'aws'
    );
    const azureComponents = DEFAULT_COMPONENT_LIBRARY.components.filter(
      (c) => c.category === 'azure'
    );
    expect(awsComponents.length).toBeGreaterThanOrEqual(15);
    expect(azureComponents.length).toBeGreaterThanOrEqual(15);
  });

  it('fusionne correctement un fichier arch-components.yaml personnalisé', () => {
    const customYaml = `
version: "1.0"
categories:
  - id: custom
    label: Métier
components:
  - id: mon-service
    name: Service Facturation
    category: custom
    symbol: mssql
    color: "#123456"
`;
    const merged = mergeComponentLibraries(
      DEFAULT_COMPONENT_LIBRARY,
      customYaml
    );
    expect(merged.categories.some((c) => c.id === 'custom')).toBe(true);
    const customComp = merged.components.find((c) => c.id === 'mon-service');
    expect(customComp).toBeDefined();
    expect(customComp?.name).toBe('Service Facturation');
    expect(customComp?.color).toBe('#123456');
  });
});

describe('Archi Editor - Parseur et Sérialiseur .arch.md (Markdown + YAML)', () => {
  it('découpe et réassemble fidèlement Markdown, arch-box et arch-seq', () => {
    const sample = `# Titre Architecture

Introduction en Markdown.

\`\`\`arch-box
title: Schéma Boîtes
nodes:
  - id: n1
    componentRef: traefik
    label: Traefik Ingress
    position:
      x: 100
      y: 120
  - id: n2
    componentRef: keycloak
    label: Keycloak SSO
    position:
      x: 350
      y: 120
edges:
  - id: e1
    source: n1
    target: n2
    label: Auth OIDC
    protocol: HTTPS
\`\`\`

## Section Séquence

\`\`\`arch-seq
title: Flux OIDC
participants:
  - id: p1
    label: Traefik
    componentRef: traefik
  - id: p2
    label: Keycloak
    componentRef: keycloak
items:
  - id: m1
    type: message
    from: p1
    to: p2
    label: Validate Token
    kind: sync
\`\`\`
`;

    const blocks = parseArchDocument(sample);
    expect(blocks).toHaveLength(4);
    expect(blocks[0].type).toBe('markdown');
    expect(blocks[1].type).toBe('arch-box');
    expect(blocks[1].boxDiagram?.nodes).toHaveLength(2);
    expect(blocks[1].boxDiagram?.nodes[0].componentRef).toBe('traefik');
    expect(blocks[2].type).toBe('markdown');
    expect(blocks[3].type).toBe('arch-seq');
    expect(blocks[3].seqDiagram?.participants).toHaveLength(2);

    const roundTrip = serializeArchDocument(blocks);
    const reparsed = parseArchDocument(roundTrip);
    expect(reparsed).toHaveLength(4);
    expect(reparsed[1].boxDiagram?.edges[0].protocol).toBe('HTTPS');
    expect(reparsed[3].seqDiagram?.items[0].label).toBe('Validate Token');
  });
});

describe('Archi Editor - Export PDF', () => {
  it('écrit un fichier PDF valide à partir du payload base64 de la Webview', async () => {
    const tmpPdf = path.join(os.tmpdir(), `test-arch-${Date.now()}.pdf`);
    const fakePdfHeader = Buffer.from('%PDF-1.4\n' + 'A'.repeat(200), 'utf-8').toString('base64');

    const res = await exportDocumentToPdfFile({
      targetPdfPath: tmpPdf,
      pdfBase64: `data:application/pdf;base64,${fakePdfHeader}`,
    });

    expect(res.method).toBe('webview-pdf');
    expect(fs.existsSync(tmpPdf)).toBe(true);
    const stat = fs.statSync(tmpPdf);
    expect(stat.size).toBeGreaterThan(100);
    fs.unlinkSync(tmpPdf);
  });
});
