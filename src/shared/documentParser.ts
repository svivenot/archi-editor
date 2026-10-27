import YAML from 'yaml';
import {
  ArchBoxDiagram,
  ArchDbColumn,
  ArchDbDiagram,
  ArchDocumentBlock,
  ArchSeqDiagram,
} from './archTypes';

const FENCED_BLOCK_REGEX = /^```(arch-box|arch-seq|arch-db)[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm;

const HANDLE_SIDES = ['left', 'right', 'top', 'bottom'];

export function createDefaultBoxDiagram(title = 'Nouveau Diagramme de Composants'): ArchBoxDiagram {
  return {
    title,
    nodes: [
      {
        id: 'node-traefik',
        componentRef: 'traefik',
        label: 'Traefik Ingress',
        position: { x: 80, y: 120 },
        props: { tech: 'Traefik v3' },
      },
      {
        id: 'node-keycloak',
        componentRef: 'keycloak',
        label: 'Keycloak SSO',
        position: { x: 360, y: 40 },
        props: { realm: 'corp-auth' },
      },
      {
        id: 'node-api',
        componentRef: 'microservice',
        label: 'Order API',
        position: { x: 360, y: 200 },
        props: { tech: 'Node.js / TypeScript' },
      },
      {
        id: 'node-pg',
        componentRef: 'postgresql',
        label: 'PostgreSQL DB',
        position: { x: 660, y: 200 },
        props: { version: '16' },
      },
    ],
    edges: [
      {
        id: 'edge-1',
        source: 'node-traefik',
        target: 'node-keycloak',
        label: 'Verify Token',
        protocol: 'OIDC/HTTPS',
        style: 'solid',
      },
      {
        id: 'edge-2',
        source: 'node-traefik',
        target: 'node-api',
        label: 'Forward Request',
        protocol: 'HTTP/2',
        style: 'solid',
      },
      {
        id: 'edge-3',
        source: 'node-api',
        target: 'node-pg',
        label: 'Read / Write',
        protocol: 'TCP/5432',
        style: 'solid',
      },
    ],
  };
}

export function createDefaultSeqDiagram(title = 'Nouveau Diagramme de Séquence'): ArchSeqDiagram {
  return {
    title,
    participants: [
      { id: 'p-client', label: 'Client Web', componentRef: 'web-app' },
      { id: 'p-traefik', label: 'Traefik Proxy', componentRef: 'traefik' },
      { id: 'p-keycloak', label: 'Keycloak IAM', componentRef: 'keycloak' },
      { id: 'p-rabbit', label: 'RabbitMQ', componentRef: 'rabbitmq' },
      { id: 'p-pg', label: 'PostgreSQL', componentRef: 'postgresql' },
    ],
    items: [
      {
        id: 's1',
        type: 'message',
        from: 'p-client',
        to: 'p-traefik',
        label: 'POST /api/orders (Bearer JWT)',
        protocol: 'HTTPS',
        kind: 'sync',
      },
      {
        id: 's2',
        type: 'message',
        from: 'p-traefik',
        to: 'p-keycloak',
        label: 'Introspect / Validate JWT',
        protocol: 'OIDC',
        kind: 'sync',
      },
      {
        id: 's3',
        type: 'message',
        from: 'p-keycloak',
        to: 'p-traefik',
        label: '200 OK (Claims)',
        kind: 'reply',
      },
      {
        id: 's4',
        type: 'message',
        from: 'p-traefik',
        to: 'p-rabbit',
        label: 'Publish OrderCreatedEvent',
        protocol: 'AMQP',
        kind: 'async',
      },
      {
        id: 's5',
        type: 'message',
        from: 'p-rabbit',
        to: 'p-pg',
        label: 'INSERT INTO orders',
        protocol: 'SQL',
        kind: 'sync',
      },
      {
        id: 's6',
        type: 'message',
        from: 'p-traefik',
        to: 'p-client',
        label: '202 Accepted',
        protocol: 'HTTPS',
        kind: 'reply',
      },
    ],
  };
}

export function createDefaultDbDiagram(title = 'Nouveau Schéma de Base de Données'): ArchDbDiagram {
  return {
    title,
    tables: [
      {
        id: 'tbl-customer',
        name: 'customer',
        schema: 'public',
        position: { x: 80, y: 80 },
        color: '#2563EB',
        columns: [
          { name: 'id', type: 'UUID', pk: true },
          { name: 'email', type: 'VARCHAR(255)', unique: true },
          { name: 'full_name', type: 'VARCHAR(255)' },
          { name: 'created_at', type: 'TIMESTAMP' },
        ],
      },
      {
        id: 'tbl-order',
        name: 'order',
        schema: 'public',
        position: { x: 460, y: 80 },
        color: '#7C3AED',
        columns: [
          { name: 'id', type: 'UUID', pk: true },
          { name: 'customer_id', type: 'UUID', fk: true },
          { name: 'status', type: 'VARCHAR(32)' },
          { name: 'total_amount', type: 'NUMERIC(12,2)' },
          { name: 'created_at', type: 'TIMESTAMP' },
        ],
      },
      {
        id: 'tbl-order-line',
        name: 'order_line',
        schema: 'public',
        position: { x: 840, y: 80 },
        color: '#059669',
        columns: [
          { name: 'id', type: 'UUID', pk: true },
          { name: 'order_id', type: 'UUID', fk: true },
          { name: 'product_sku', type: 'VARCHAR(64)' },
          { name: 'quantity', type: 'INT' },
          { name: 'unit_price', type: 'NUMERIC(12,2)' },
        ],
      },
    ],
    relations: [
      {
        id: 'rel-1',
        source: 'tbl-order',
        target: 'tbl-customer',
        sourceColumn: 'customer_id',
        targetColumn: 'id',
        cardinality: 'many-to-one',
        label: 'passe',
      },
      {
        id: 'rel-2',
        source: 'tbl-order-line',
        target: 'tbl-order',
        sourceColumn: 'order_id',
        targetColumn: 'id',
        cardinality: 'many-to-one',
        label: 'compose',
      },
    ],
  };
}

export function parseBoxYaml(yamlText: string): { diagram: ArchBoxDiagram; error?: string } {
  try {
    const parsed = YAML.parse(yamlText) || {};
    const diagram: ArchBoxDiagram = {
      title: typeof parsed.title === 'string' ? parsed.title : 'Diagramme de Composants',
      description: typeof parsed.description === 'string' ? parsed.description : undefined,
      nodes: Array.isArray(parsed.nodes)
        ? parsed.nodes.map((n: any, idx: number) => ({
            id: String(n.id || `node-${idx + 1}`),
            componentRef: String(n.componentRef || 'microservice'),
            label: String(n.label || n.id || 'Composant'),
            subtitle: n.subtitle ? String(n.subtitle) : undefined,
            position: {
              x: typeof n.position?.x === 'number' ? n.position.x : 100 + (idx % 3) * 260,
              y: typeof n.position?.y === 'number' ? n.position.y : 100 + Math.floor(idx / 3) * 160,
            },
            width: typeof n.width === 'number' ? n.width : undefined,
            height: typeof n.height === 'number' ? n.height : undefined,
            parentId: n.parentId ? String(n.parentId) : undefined,
            props: n.props && typeof n.props === 'object' ? n.props : undefined,
          }))
        : [],
      edges: Array.isArray(parsed.edges)
        ? parsed.edges.map((e: any, idx: number) => ({
            id: String(e.id || `edge-${idx + 1}`),
            source: String(e.source || ''),
            target: String(e.target || ''),
            label: e.label !== undefined ? String(e.label) : undefined,
            protocol: e.protocol !== undefined ? String(e.protocol) : undefined,
            style: e.style === 'dashed' || e.style === 'dotted' ? e.style : 'solid',
            bidirectional: Boolean(e.bidirectional),
            animated: Boolean(e.animated),
            sourceHandle: HANDLE_SIDES.includes(e.sourceHandle) ? e.sourceHandle : undefined,
            targetHandle: HANDLE_SIDES.includes(e.targetHandle) ? e.targetHandle : undefined,
          }))
        : [],
    };
    return { diagram };
  } catch (err: any) {
    return {
      diagram: { title: 'Erreur YAML', nodes: [], edges: [] },
      error: err?.message || 'YAML invalide',
    };
  }
}

export function serializeBoxYaml(diagram: ArchBoxDiagram): string {
  const clean: Record<string, any> = {};
  if (diagram.title) {
    clean.title = diagram.title;
  }
  if (diagram.description) {
    clean.description = diagram.description;
  }
  clean.nodes = diagram.nodes.map((n) => {
    const item: Record<string, any> = {
      id: n.id,
      componentRef: n.componentRef,
      label: n.label,
      position: {
        x: Math.round(n.position.x),
        y: Math.round(n.position.y),
      },
    };
    if (n.subtitle) item.subtitle = n.subtitle;
    if (n.parentId) item.parentId = n.parentId;
    if (n.width) item.width = Math.round(n.width);
    if (n.height) item.height = Math.round(n.height);
    if (n.props && Object.keys(n.props).length > 0) {
      item.props = n.props;
    }
    return item;
  });
  clean.edges = diagram.edges.map((e) => {
    const item: Record<string, any> = {
      id: e.id,
      source: e.source,
      target: e.target,
    };
    if (e.label) item.label = e.label;
    if (e.protocol) item.protocol = e.protocol;
    if (e.style && e.style !== 'solid') item.style = e.style;
    if (e.bidirectional) item.bidirectional = true;
    if (e.animated) item.animated = true;
    if (e.sourceHandle) item.sourceHandle = e.sourceHandle;
    if (e.targetHandle) item.targetHandle = e.targetHandle;
    return item;
  });
  return YAML.stringify(clean, { indent: 2 }).trim();
}

export function parseSeqYaml(yamlText: string): { diagram: ArchSeqDiagram; error?: string } {
  try {
    const parsed = YAML.parse(yamlText) || {};
    const diagram: ArchSeqDiagram = {
      title: typeof parsed.title === 'string' ? parsed.title : 'Diagramme de Séquence',
      description: typeof parsed.description === 'string' ? parsed.description : undefined,
      participants: Array.isArray(parsed.participants)
        ? parsed.participants.map((p: any, idx: number) => ({
            id: String(p.id || `p-${idx + 1}`),
            label: String(p.label || p.id || `Acteur ${idx + 1}`),
            componentRef: p.componentRef ? String(p.componentRef) : undefined,
            subtitle: p.subtitle ? String(p.subtitle) : undefined,
          }))
        : [],
      items: Array.isArray(parsed.items)
        ? parsed.items.map((item: any, idx: number) => ({
            id: String(item.id || `item-${idx + 1}`),
            type:
              item.type === 'block' || item.type === 'note' ? item.type : 'message',
            from: item.from ? String(item.from) : undefined,
            to: item.to ? String(item.to) : undefined,
            label: String(item.label || item.text || ''),
            protocol: item.protocol ? String(item.protocol) : undefined,
            kind:
              item.kind === 'async' || item.kind === 'reply' || item.kind === 'self'
                ? item.kind
                : 'sync',
            blockKind:
              item.blockKind === 'alt' ||
              item.blockKind === 'opt' ||
              item.blockKind === 'loop' ||
              item.blockKind === 'par'
                ? item.blockKind
                : undefined,
            participantId: item.participantId ? String(item.participantId) : undefined,
          }))
        : [],
    };
    return { diagram };
  } catch (err: any) {
    return {
      diagram: { title: 'Erreur YAML', participants: [], items: [] },
      error: err?.message || 'YAML invalide',
    };
  }
}

export function serializeSeqYaml(diagram: ArchSeqDiagram): string {
  const clean: Record<string, any> = {};
  if (diagram.title) clean.title = diagram.title;
  if (diagram.description) clean.description = diagram.description;
  clean.participants = diagram.participants.map((p) => {
    const item: Record<string, any> = {
      id: p.id,
      label: p.label,
    };
    if (p.componentRef) item.componentRef = p.componentRef;
    if (p.subtitle) item.subtitle = p.subtitle;
    return item;
  });
  clean.items = diagram.items.map((it) => {
    if (it.type === 'block') {
      return {
        id: it.id,
        type: 'block',
        blockKind: it.blockKind || 'alt',
        label: it.label,
      };
    }
    if (it.type === 'note') {
      return {
        id: it.id,
        type: 'note',
        participantId: it.participantId,
        label: it.label,
      };
    }
    const msg: Record<string, any> = {
      id: it.id,
      type: 'message',
      from: it.from,
      to: it.to,
      label: it.label,
      kind: it.kind || 'sync',
    };
    if (it.protocol) msg.protocol = it.protocol;
    return msg;
  });
  return YAML.stringify(clean, { indent: 2 }).trim();
}

const CARDINALITIES = ['one-to-one', 'one-to-many', 'many-to-one', 'many-to-many'];

export function parseDbYaml(yamlText: string): { diagram: ArchDbDiagram; error?: string } {
  try {
    const parsed = YAML.parse(yamlText) || {};
    const diagram: ArchDbDiagram = {
      title: typeof parsed.title === 'string' ? parsed.title : 'Schéma de Base de Données',
      description: typeof parsed.description === 'string' ? parsed.description : undefined,
      tables: Array.isArray(parsed.tables)
        ? parsed.tables.map((t: any, idx: number) => ({
            id: String(t.id || `table-${idx + 1}`),
            name: String(t.name || t.id || `table_${idx + 1}`),
            schema: t.schema ? String(t.schema) : undefined,
            color: t.color ? String(t.color) : undefined,
            position: {
              x: typeof t.position?.x === 'number' ? t.position.x : 80 + (idx % 3) * 380,
              y: typeof t.position?.y === 'number' ? t.position.y : 80 + Math.floor(idx / 3) * 320,
            },
            columns: Array.isArray(t.columns)
              ? t.columns.map((c: any, cIdx: number): ArchDbColumn => ({
                  name: String(c?.name || c || `col_${cIdx + 1}`),
                  type: c?.type !== undefined ? String(c.type) : undefined,
                  pk: Boolean(c?.pk),
                  fk: Boolean(c?.fk),
                  nullable: Boolean(c?.nullable),
                  unique: Boolean(c?.unique),
                  note: c?.note !== undefined ? String(c.note) : undefined,
                }))
              : [],
          }))
        : [],
      relations: Array.isArray(parsed.relations)
        ? parsed.relations.map((r: any, idx: number) => ({
            id: String(r.id || `rel-${idx + 1}`),
            source: String(r.source || ''),
            target: String(r.target || ''),
            sourceColumn: r.sourceColumn ? String(r.sourceColumn) : undefined,
            targetColumn: r.targetColumn ? String(r.targetColumn) : undefined,
            cardinality: CARDINALITIES.includes(r.cardinality) ? r.cardinality : 'one-to-many',
            label: r.label !== undefined ? String(r.label) : undefined,
          }))
        : [],
    };
    return { diagram };
  } catch (err: any) {
    return {
      diagram: { title: 'Erreur YAML', tables: [], relations: [] },
      error: err?.message || 'YAML invalide',
    };
  }
}

export function serializeDbYaml(diagram: ArchDbDiagram): string {
  const clean: Record<string, any> = {};
  if (diagram.title) clean.title = diagram.title;
  if (diagram.description) clean.description = diagram.description;
  clean.tables = diagram.tables.map((t) => {
    const item: Record<string, any> = { id: t.id, name: t.name };
    if (t.schema) item.schema = t.schema;
    if (t.color) item.color = t.color;
    item.position = { x: Math.round(t.position.x), y: Math.round(t.position.y) };
    item.columns = t.columns.map((c) => {
      const col: Record<string, any> = { name: c.name };
      if (c.type) col.type = c.type;
      if (c.pk) col.pk = true;
      if (c.fk) col.fk = true;
      if (c.nullable) col.nullable = true;
      if (c.unique) col.unique = true;
      if (c.note) col.note = c.note;
      return col;
    });
    return item;
  });
  clean.relations = diagram.relations.map((r) => {
    const item: Record<string, any> = { id: r.id, source: r.source, target: r.target };
    if (r.sourceColumn) item.sourceColumn = r.sourceColumn;
    if (r.targetColumn) item.targetColumn = r.targetColumn;
    if (r.cardinality && r.cardinality !== 'one-to-many') item.cardinality = r.cardinality;
    if (r.label) item.label = r.label;
    return item;
  });
  return YAML.stringify(clean, { indent: 2 }).trim();
}

/**
 * Découpe un document .arch.md en une liste ordonnée de blocs (Markdown et Diagrammes YAML).
 */
export function parseArchDocument(text: string): ArchDocumentBlock[] {
  const blocks: ArchDocumentBlock[] = [];
  let lastIndex = 0;
  let blockCounter = 1;

  FENCED_BLOCK_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = FENCED_BLOCK_REGEX.exec(text)) !== null) {
    const beforeMd = text.slice(lastIndex, match.index);
    if (beforeMd.trim().length > 0 || blocks.length === 0) {
      blocks.push({
        id: `block-md-${blockCounter++}`,
        type: 'markdown',
        content: beforeMd.replace(/^\r?\n+|\r?\n+$/g, ''),
      });
    }

    const fenceType = match[1] as 'arch-box' | 'arch-seq' | 'arch-db';
    const rawYaml = match[2].trim();

    if (fenceType === 'arch-box') {
      const { diagram, error } = parseBoxYaml(rawYaml);
      blocks.push({
        id: `block-box-${blockCounter++}`,
        type: 'arch-box',
        content: rawYaml,
        boxDiagram: diagram,
        parseError: error,
      });
    } else if (fenceType === 'arch-db') {
      const { diagram, error } = parseDbYaml(rawYaml);
      blocks.push({
        id: `block-db-${blockCounter++}`,
        type: 'arch-db',
        content: rawYaml,
        dbDiagram: diagram,
        parseError: error,
      });
    } else {
      const { diagram, error } = parseSeqYaml(rawYaml);
      blocks.push({
        id: `block-seq-${blockCounter++}`,
        type: 'arch-seq',
        content: rawYaml,
        seqDiagram: diagram,
        parseError: error,
      });
    }

    lastIndex = match.index + match[0].length;
  }

  const remainingMd = text.slice(lastIndex);
  if (remainingMd.trim().length > 0 || blocks.length === 0) {
    blocks.push({
      id: `block-md-${blockCounter++}`,
      type: 'markdown',
      content: remainingMd.replace(/^\r?\n+|\r?\n+$/g, ''),
    });
  }

  return blocks;
}

/**
 * Réassemble les blocs (Markdown et Diagrammes YAML) en un document .arch.md propre.
 */
export function serializeArchDocument(blocks: ArchDocumentBlock[]): string {
  const parts: string[] = [];

  for (const block of blocks) {
    if (block.type === 'markdown') {
      const trimmed = block.content.trim();
      if (trimmed.length > 0) {
        parts.push(trimmed);
      }
    } else if (block.type === 'arch-box') {
      const yamlStr = block.boxDiagram
        ? serializeBoxYaml(block.boxDiagram)
        : block.content.trim();
      parts.push(`\`\`\`arch-box\n${yamlStr}\n\`\`\``);
    } else if (block.type === 'arch-seq') {
      const yamlStr = block.seqDiagram
        ? serializeSeqYaml(block.seqDiagram)
        : block.content.trim();
      parts.push(`\`\`\`arch-seq\n${yamlStr}\n\`\`\``);
    } else if (block.type === 'arch-db') {
      const yamlStr = block.dbDiagram
        ? serializeDbYaml(block.dbDiagram)
        : block.content.trim();
      parts.push(`\`\`\`arch-db\n${yamlStr}\n\`\`\``);
    }
  }

  return parts.join('\n\n') + '\n';
}
