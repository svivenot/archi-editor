import {
  ArchBoxDiagram,
  ArchDbCardinality,
  ArchDbDiagram,
  ArchSeqDiagram,
} from './archTypes';

// ============================================================================
// Rendu SVG headless des diagrammes (pour export PNG côté serveur, sans navigateur)
// ============================================================================

export interface SvgResult {
  svg: string;
  width: number;
  height: number;
}

/** Résout une référence de composant vers sa couleur et son nom affichable. */
export type CompResolver = (ref?: string) => { color: string; name: string };

const FONT = 'DejaVu Sans, Arial, sans-serif';
const FONT_MONO = 'DejaVu Sans Mono, monospace';

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Largeur de texte approximative (DejaVu Sans ≈ 0.55em en moyenne, 0.6em en gras)
function textWidth(s: string, fontSize: number, bold = false): number {
  return s.length * fontSize * (bold ? 0.62 : 0.55);
}

function truncate(s: string, maxWidth: number, fontSize: number, bold = false): string {
  if (textWidth(s, fontSize, bold) <= maxWidth) return s;
  let out = s;
  while (out.length > 1 && textWidth(out + '…', fontSize, bold) > maxWidth) {
    out = out.slice(0, -1);
  }
  return out + '…';
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Flèche pleine dont la pointe est en (x, y), orientée selon `angle` (sens du déplacement)
function arrowHead(x: number, y: number, angle: number, color: string, size = 9): string {
  const a1 = angle + Math.PI - 0.42;
  const a2 = angle + Math.PI + 0.42;
  const p1x = x + size * Math.cos(a1);
  const p1y = y + size * Math.sin(a1);
  const p2x = x + size * Math.cos(a2);
  const p2y = y + size * Math.sin(a2);
  return `<polygon points="${x.toFixed(1)},${y.toFixed(1)} ${p1x.toFixed(1)},${p1y.toFixed(
    1
  )} ${p2x.toFixed(1)},${p2y.toFixed(1)}" fill="${color}"/>`;
}

function labelPill(
  x: number,
  y: number,
  textStr: string,
  fontSize: number,
  color: string
): string {
  const w = textWidth(textStr, fontSize, true) + 12;
  return (
    `<rect x="${(x - w / 2).toFixed(1)}" y="${(y - fontSize / 2 - 4).toFixed(1)}" width="${w.toFixed(
      1
    )}" height="${fontSize + 8}" rx="4" fill="#FFFFFF" fill-opacity="0.95" stroke="#CBD5E1"/>` +
    `<text x="${x.toFixed(1)}" y="${(y + fontSize / 2 - 2).toFixed(
      1
    )}" text-anchor="middle" font-family="${FONT}" font-size="${fontSize}" font-weight="600" fill="${color}">${esc(
      textStr
    )}</text>`
  );
}

function wrapSvg(width: number, height: number, body: string): SvgResult {
  const w = Math.max(40, Math.ceil(width));
  const h = Math.max(40, Math.ceil(height));
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect width="${w}" height="${h}" fill="#FFFFFF"/>` +
    body +
    `</svg>`;
  return { svg, width: w, height: h };
}

interface EdgeGeom {
  d: string;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  labelX: number;
  labelY: number;
  endAngle: number;
  startAngle: number;
}

type Side = 'left' | 'right' | 'top' | 'bottom';

// Décalage des points de contrôle (identique à React Flow getBezierPath)
function controlOffset(distance: number, curvature: number): number {
  return distance >= 0 ? 0.5 * distance : curvature * 25 * Math.sqrt(-distance);
}

// Point d'ancrage du handle sur un côté de la boîte
function anchor(r: Rect, side: Side): { x: number; y: number } {
  switch (side) {
    case 'left':
      return { x: r.x, y: r.y + r.h / 2 };
    case 'right':
      return { x: r.x + r.w, y: r.y + r.h / 2 };
    case 'top':
      return { x: r.x + r.w / 2, y: r.y };
    case 'bottom':
      return { x: r.x + r.w / 2, y: r.y + r.h };
  }
}

// Point de contrôle de Bézier selon le côté du handle (cf. React Flow getBezierPath)
function control(side: Side, x1: number, y1: number, x2: number, y2: number, c: number): [number, number] {
  switch (side) {
    case 'left':
      return [x1 - controlOffset(x1 - x2, c), y1];
    case 'right':
      return [x1 + controlOffset(x2 - x1, c), y1];
    case 'top':
      return [x1, y1 - controlOffset(y1 - y2, c)];
    case 'bottom':
      return [x1, y1 + controlOffset(y2 - y1, c)];
  }
}

// Courbe de Bézier reliant le handle source au handle cible, en respectant les côtés
// choisis (left/right/top/bottom) — reproduit exactement l'arête par défaut de React Flow.
function bezierPath(s: Rect, sSide: Side, t: Rect, tSide: Side, curvature = 0.25): EdgeGeom {
  const sp = anchor(s, sSide);
  const tp = anchor(t, tSide);
  const [scx, scy] = control(sSide, sp.x, sp.y, tp.x, tp.y, curvature);
  const [tcx, tcy] = control(tSide, tp.x, tp.y, sp.x, sp.y, curvature);
  const d = `M ${sp.x.toFixed(1)} ${sp.y.toFixed(1)} C ${scx.toFixed(1)} ${scy.toFixed(1)}, ${tcx.toFixed(
    1
  )} ${tcy.toFixed(1)}, ${tp.x.toFixed(1)} ${tp.y.toFixed(1)}`;
  return {
    d,
    sx: sp.x,
    sy: sp.y,
    tx: tp.x,
    ty: tp.y,
    labelX: (sp.x + 3 * scx + 3 * tcx + tp.x) / 8,
    labelY: (sp.y + 3 * scy + 3 * tcy + tp.y) / 8,
    endAngle: Math.atan2(tp.y - tcy, tp.x - tcx),
    startAngle: Math.atan2(sp.y - scy, sp.x - scx),
  };
}

// Boucle de rappel (relation d'une table/boîte vers elle-même)
function selfLoop(r: Rect): EdgeGeom {
  const x = r.x + r.w;
  const y1 = r.y + r.h / 2 - 12;
  const y2 = r.y + r.h / 2 + 12;
  const ext = 50;
  const d = `M ${x} ${y1} C ${x + ext} ${y1 - 8}, ${x + ext} ${y2 + 8}, ${x} ${y2}`;
  return {
    d,
    sx: x,
    sy: y1,
    tx: x,
    ty: y2,
    labelX: x + ext * 0.72,
    labelY: (y1 + y2) / 2,
    endAngle: Math.atan2(y2 - (y2 + 8), x - (x + ext)),
    startAngle: 0,
  };
}

// ----------------------------------------------------------------------------
// Diagramme de boîtes connectées (arch-box)
// ----------------------------------------------------------------------------

const BOX_LEAF_WIDTH = 230;

function leafHeight(propsCount: number, hasSubtitle: boolean): number {
  return 34 + (hasSubtitle ? 14 : 0) + (propsCount > 0 ? Math.min(propsCount, 4) * 15 + 6 : 0);
}

export function boxDiagramToSvg(diagram: ArchBoxDiagram, resolve: CompResolver): SvgResult {
  const PAD = 30;
  const rects = new Map<string, Rect>();
  for (const n of diagram.nodes) {
    const comp = resolve(n.componentRef);
    const isContainer = Boolean(n.width && n.height);
    if (isContainer) {
      rects.set(n.id, { x: n.position.x, y: n.position.y, w: n.width!, h: n.height! });
    } else {
      rects.set(n.id, {
        x: n.position.x,
        y: n.position.y,
        w: BOX_LEAF_WIDTH,
        h: leafHeight(Object.keys(n.props || {}).length, Boolean(n.subtitle || comp.name)),
      });
    }
  }

  const all = [...rects.values()];
  const minX = all.length ? Math.min(...all.map((r) => r.x)) : 0;
  const minY = all.length ? Math.min(...all.map((r) => r.y)) : 0;
  const maxX = all.length ? Math.max(...all.map((r) => r.x + r.w)) : 100;
  const maxY = all.length ? Math.max(...all.map((r) => r.y + r.h)) : 100;
  const ox = PAD - minX;
  const oy = PAD - minY;
  const shift = (r: Rect): Rect => ({ x: r.x + ox, y: r.y + oy, w: r.w, h: r.h });

  const containers: string[] = [];
  const leaves: string[] = [];

  for (const n of diagram.nodes) {
    const comp = resolve(n.componentRef);
    const r = shift(rects.get(n.id)!);
    const isContainer = Boolean(n.width && n.height);
    if (isContainer) {
      containers.push(
        `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="10" fill="${comp.color}0D" stroke="${comp.color}" stroke-width="1.5" stroke-dasharray="6 4"/>` +
          `<text x="${r.x + 14}" y="${r.y + 22}" font-family="${FONT}" font-size="11" font-weight="700" fill="${comp.color}">${esc(
            truncate(`${comp.name.toUpperCase()} — ${n.label}`, r.w - 28, 11, true)
          )}</text>`
      );
    } else {
      const parts: string[] = [];
      parts.push(
        `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="8" fill="#FFFFFF" stroke="${comp.color}88" stroke-width="1.6"/>`
      );
      parts.push(`<rect x="${r.x}" y="${r.y}" width="4" height="${r.h}" rx="2" fill="${comp.color}"/>`);
      let ty = r.y + 16;
      parts.push(
        `<text x="${r.x + 14}" y="${ty}" font-family="${FONT}" font-size="10" font-weight="700" fill="${comp.color}">${esc(
          truncate(comp.name, r.w - 22, 10, true)
        )}</text>`
      );
      ty += 15;
      parts.push(
        `<text x="${r.x + 14}" y="${ty}" font-family="${FONT}" font-size="13" font-weight="700" fill="#0F172A">${esc(
          truncate(n.label, r.w - 22, 13, true)
        )}</text>`
      );
      if (n.subtitle) {
        ty += 14;
        parts.push(
          `<text x="${r.x + 14}" y="${ty}" font-family="${FONT}" font-size="11" fill="#64748B">${esc(
            truncate(n.subtitle, r.w - 22, 11)
          )}</text>`
        );
      }
      const props = Object.entries(n.props || {}).slice(0, 4);
      for (const [k, v] of props) {
        ty += 15;
        parts.push(
          `<text x="${r.x + 14}" y="${ty}" font-family="${FONT_MONO}" font-size="10.5" fill="#475569">${esc(
            truncate(`${k}: ${v}`, r.w - 22, 10.5)
          )}</text>`
        );
      }
      leaves.push(parts.join(''));
    }
  }

  // Liens : courbes de Bézier (bord droit source -> bord gauche cible), comme en édition
  const edges: string[] = [];
  for (const e of diagram.edges) {
    const sr = rects.get(e.source);
    const tr = rects.get(e.target);
    if (!sr || !tr) continue;
    const s = shift(sr);
    const t = shift(tr);
    const b =
      e.source === e.target
        ? selfLoop(s)
        : bezierPath(s, e.sourceHandle || 'right', t, e.targetHandle || 'left');
    const dash = e.style === 'dashed' ? ' stroke-dasharray="6 4"' : e.style === 'dotted' ? ' stroke-dasharray="2 4"' : '';
    edges.push(
      `<path d="${b.d}" fill="none" stroke="#475569" stroke-width="1.8"${dash}/>` +
        arrowHead(b.tx, b.ty, b.endAngle, '#475569') +
        (e.bidirectional ? arrowHead(b.sx, b.sy, b.startAngle, '#475569') : '')
    );
    const label = [e.label, e.protocol ? `[${e.protocol}]` : ''].filter(Boolean).join(' ');
    if (label) {
      edges.push(labelPill(b.labelX, b.labelY, label, 10.5, '#0F172A'));
    }
  }

  return wrapSvg(
    maxX - minX + PAD * 2,
    maxY - minY + PAD * 2,
    containers.join('') + leaves.join('') + edges.join('')
  );
}

// ----------------------------------------------------------------------------
// Schéma de base de données (arch-db)
// ----------------------------------------------------------------------------

const DB_WIDTH = 240;
const DB_HEADER_H = 34;
const DB_ROW_H = 22;

const CARD_TAG: Record<ArchDbCardinality, string> = {
  'one-to-one': '1 — 1',
  'one-to-many': '1 — N',
  'many-to-one': 'N — 1',
  'many-to-many': 'N — N',
};

function tableRect(t: ArchDbDiagram['tables'][number]): Rect {
  return {
    x: t.position.x,
    y: t.position.y,
    w: DB_WIDTH,
    h: DB_HEADER_H + Math.max(1, t.columns.length) * DB_ROW_H + 6,
  };
}

export function dbDiagramToSvg(diagram: ArchDbDiagram): SvgResult {
  const PAD = 30;
  const rects = new Map<string, Rect>();
  for (const t of diagram.tables) rects.set(t.id, tableRect(t));

  const all = [...rects.values()];
  const minX = all.length ? Math.min(...all.map((r) => r.x)) : 0;
  const minY = all.length ? Math.min(...all.map((r) => r.y)) : 0;
  const maxX = all.length ? Math.max(...all.map((r) => r.x + r.w)) : 100;
  const maxY = all.length ? Math.max(...all.map((r) => r.y + r.h)) : 100;
  const ox = PAD - minX;
  const oy = PAD - minY;
  const shift = (r: Rect): Rect => ({ x: r.x + ox, y: r.y + oy, w: r.w, h: r.h });

  const tables: string[] = [];
  for (const t of diagram.tables) {
    const r = shift(rects.get(t.id)!);
    const color = t.color || '#2563EB';
    const parts: string[] = [];
    parts.push(
      `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="8" fill="#FFFFFF" stroke="${color}88" stroke-width="1.6"/>`
    );
    parts.push(
      `<path d="M ${r.x} ${r.y + 8} q 0 -8 8 -8 h ${r.w - 16} q 8 0 8 8 v ${DB_HEADER_H - 8} h -${r.w} z" fill="${color}"/>`
    );
    parts.push(
      `<text x="${r.x + 12}" y="${r.y + 22}" font-family="${FONT}" font-size="13" font-weight="700" fill="#FFFFFF">${esc(
        truncate((t.schema ? `${t.schema}.` : '') + t.name, r.w - 22, 13, true)
      )}</text>`
    );
    let ry = r.y + DB_HEADER_H;
    const cols = t.columns.length ? t.columns : [{ name: '(aucune colonne)' } as any];
    for (const c of cols) {
      const rowBg = c.pk ? '#FFFBEB' : undefined;
      if (rowBg) {
        parts.push(
          `<rect x="${r.x + 1}" y="${ry}" width="${r.w - 2}" height="${DB_ROW_H}" fill="${rowBg}"/>`
        );
      }
      if (ry > r.y + DB_HEADER_H) {
        parts.push(
          `<line x1="${r.x + 1}" y1="${ry}" x2="${r.x + r.w - 1}" y2="${ry}" stroke="#F1F5F9" stroke-width="1"/>`
        );
      }
      const tag = c.pk ? 'PK' : c.fk ? 'FK' : '';
      if (tag) {
        parts.push(
          `<text x="${r.x + 10}" y="${ry + 15}" font-family="${FONT}" font-size="8.5" font-weight="800" fill="${
            c.pk ? '#CA8A04' : '#2563EB'
          }">${tag}</text>`
        );
      }
      const nameFlags =
        esc(c.name) + (c.unique && !c.pk ? ' ·U' : '') + (c.nullable ? ' ·?' : '');
      parts.push(
        `<text x="${r.x + 32}" y="${ry + 15}" font-family="${FONT}" font-size="11.5" font-weight="${
          c.pk ? '700' : '600'
        }" fill="#0F172A">${esc(truncate(nameFlags, 120, 11.5, true))}</text>`
      );
      if (c.type) {
        parts.push(
          `<text x="${r.x + r.w - 10}" y="${ry + 15}" text-anchor="end" font-family="${FONT_MONO}" font-size="10" fill="#64748B">${esc(
            truncate(c.type, 74, 10)
          )}</text>`
        );
      }
      ry += DB_ROW_H;
    }
    tables.push(parts.join(''));
  }

  const rels: string[] = [];
  for (const rel of diagram.relations) {
    const sr = rects.get(rel.source);
    const tr = rects.get(rel.target);
    if (!sr || !tr) continue;
    const s = shift(sr);
    const t = shift(tr);
    const b = rel.source === rel.target ? selfLoop(s) : bezierPath(s, 'right', t, 'left');
    rels.push(
      `<path d="${b.d}" fill="none" stroke="#64748B" stroke-width="1.8"/>` +
        arrowHead(b.tx, b.ty, b.endAngle, '#64748B')
    );
    const label = [CARD_TAG[rel.cardinality || 'one-to-many'], rel.label].filter(Boolean).join('  ');
    rels.push(labelPill(b.labelX, b.labelY, label, 10.5, '#0F172A'));
  }

  return wrapSvg(maxX - minX + PAD * 2, maxY - minY + PAD * 2, tables.join('') + rels.join(''));
}

// ----------------------------------------------------------------------------
// Diagramme de séquence (arch-seq)
// ----------------------------------------------------------------------------

export function seqDiagramToSvg(diagram: ArchSeqDiagram, resolve: CompResolver): SvgResult {
  const COL_WIDTH = 190;
  const LEFT_PAD = 120;
  const HEADER_Y = 24;
  const HEADER_H = 60;
  const STEP_START_Y = HEADER_Y + HEADER_H + 40;
  const STEP_H = 58;

  const participants = diagram.participants;
  const items = diagram.items;

  const width = Math.max(680, LEFT_PAD * 2 + Math.max(0, participants.length - 1) * COL_WIDTH);
  const height = Math.max(280, STEP_START_Y + items.length * STEP_H + 70);

  const px = (id?: string): number => {
    const idx = participants.findIndex((p) => p.id === id);
    return idx === -1 ? LEFT_PAD : LEFT_PAD + idx * COL_WIDTH;
  };

  const body: string[] = [];

  // Lignes de vie + en-têtes de participants
  participants.forEach((p, idx) => {
    const cx = LEFT_PAD + idx * COL_WIDTH;
    const comp = resolve(p.componentRef);
    body.push(
      `<line x1="${cx}" y1="${HEADER_Y + HEADER_H}" x2="${cx}" y2="${
        height - 44
      }" stroke="#94A3B8" stroke-width="1.5" stroke-dasharray="6 5"/>`
    );
    body.push(
      `<rect x="${cx - 80}" y="${HEADER_Y}" width="160" height="${HEADER_H}" rx="10" fill="#FFFFFF" stroke="${comp.color}" stroke-width="1.8"/>` +
        `<rect x="${cx - 80}" y="${HEADER_Y}" width="160" height="6" rx="3" fill="${comp.color}"/>` +
        `<text x="${cx}" y="${HEADER_Y + 30}" text-anchor="middle" font-family="${FONT}" font-size="12.5" font-weight="700" fill="#0F172A">${esc(
          truncate(p.label, 150, 12.5, true)
        )}</text>` +
        `<text x="${cx}" y="${HEADER_Y + 46}" text-anchor="middle" font-family="${FONT}" font-size="10.5" fill="${comp.color}">${esc(
          truncate(comp.name, 150, 10.5)
        )}</text>`
    );
    // Rappel en pied
    body.push(
      `<rect x="${cx - 60}" y="${height - 44}" width="120" height="26" rx="6" fill="#F8FAFC" stroke="#CBD5E1"/>` +
        `<text x="${cx}" y="${height - 27}" text-anchor="middle" font-family="${FONT}" font-size="11" font-weight="600" fill="#334155">${esc(
          truncate(p.label, 112, 11, true)
        )}</text>`
    );
  });

  // Étapes
  let stepNum = 0;
  items.forEach((item, idx) => {
    const y = STEP_START_Y + idx * STEP_H;

    if (item.type === 'block') {
      const x1 = Math.max(20, LEFT_PAD - 84);
      const x2 = width - 20;
      const tag = (item.blockKind || 'alt').toUpperCase();
      body.push(
        `<rect x="${x1}" y="${y - 20}" width="${x2 - x1}" height="40" rx="6" fill="#EFF6FF" fill-opacity="0.7" stroke="#64748B" stroke-width="1.4" stroke-dasharray="5 3"/>` +
          `<rect x="${x1}" y="${y - 20}" width="52" height="18" rx="4" fill="#1E40AF"/>` +
          `<text x="${x1 + 26}" y="${y - 7}" text-anchor="middle" font-family="${FONT}" font-size="10" font-weight="800" fill="#FFFFFF">${esc(
            tag
          )}</text>` +
          `<text x="${x1 + 62}" y="${y + 4}" font-family="${FONT}" font-size="12" font-weight="600" fill="#1E293B">${esc(
            truncate('[' + item.label + ']', x2 - x1 - 74, 12, true)
          )}</text>`
      );
      return;
    }

    if (item.type === 'note') {
      const cx = px(item.participantId);
      const w = Math.max(120, textWidth(item.label, 11.5, true) + 24);
      body.push(
        `<rect x="${cx - w / 2}" y="${y - 18}" width="${w}" height="36" rx="5" fill="#FEF9C3" stroke="#CA8A04" stroke-width="1.4"/>` +
          `<text x="${cx}" y="${y + 4}" text-anchor="middle" font-family="${FONT}" font-size="11.5" font-weight="600" fill="#713F12">${esc(
            truncate(item.label, w - 16, 11.5, true)
          )}</text>`
      );
      return;
    }

    // Message
    stepNum += 1;
    const xFrom = px(item.from);
    const xTo = px(item.to);
    const isSelf = item.from === item.to || item.kind === 'self';
    const dashed = item.kind === 'reply' || item.kind === 'async';
    const dash = dashed ? ' stroke-dasharray="6 4"' : '';
    const fullText = [item.label, item.protocol ? `(${item.protocol})` : ''].filter(Boolean).join(' ');

    if (isSelf) {
      body.push(
        `<path d="M ${xFrom} ${y - 6} H ${xFrom + 46} V ${y + 16} H ${
          xFrom + 4
        }" fill="none" stroke="#1E293B" stroke-width="1.8"${dash}/>` +
          arrowHead(xFrom + 4, y + 16, Math.PI, '#1E293B', 8) +
          `<circle cx="${xFrom}" cy="${y - 6}" r="9" fill="#334155"/>` +
          `<text x="${xFrom}" y="${y - 2.5}" text-anchor="middle" font-family="${FONT}" font-size="9.5" font-weight="700" fill="#FFFFFF">${stepNum}</text>` +
          `<text x="${xFrom + 54}" y="${y + 8}" font-family="${FONT}" font-size="11.5" font-weight="600" fill="#1E293B">${esc(
            truncate(fullText, width - xFrom - 70, 11.5)
          )}</text>`
      );
      return;
    }

    const angle = xTo >= xFrom ? 0 : Math.PI;
    body.push(
      `<line x1="${xFrom}" y1="${y + 6}" x2="${xTo}" y2="${y + 6}" stroke="#1E293B" stroke-width="1.9"${dash}/>` +
        arrowHead(xTo, y + 6, angle, '#1E293B') +
        labelPill((xFrom + xTo) / 2, y - 6, `${stepNum}. ${fullText}`, 11, '#1E293B')
    );
  });

  return wrapSvg(width, height, body.join(''));
}
