import * as fs from 'fs';
import * as path from 'path';
import { marked } from 'marked';
import { Resvg } from '@resvg/resvg-js';
import { ComponentLibrary } from '../shared/archTypes';
import { parseArchDocument } from '../shared/documentParser';
import {
  CompResolver,
  boxDiagramToSvg,
  dbDiagramToSvg,
  seqDiagramToSvg,
  SvgResult,
} from '../shared/diagramSvg';

export interface ConfluenceImage {
  /** Chemin absolu du PNG écrit sur disque */
  file: string;
  /** Nom de la pièce jointe tel que référencé dans le corps de page */
  filename: string;
  width: number;
  height: number;
}

export interface ConfluenceExportResult {
  title: string;
  /** Corps de page au format storage Confluence (XHTML) */
  body: string;
  /** Chemin du fichier contenant le corps de page */
  bodyPath: string;
  outDir: string;
  images: ConfluenceImage[];
}

function buildResolver(library: ComponentLibrary): CompResolver {
  const map = new Map(library.components.map((c) => [c.id, c]));
  return (ref?: string) => {
    const c = ref ? map.get(ref) : undefined;
    return { color: c?.color || '#3B82F6', name: c?.name || ref || 'Composant' };
  };
}

function rasterize(svg: SvgResult, scale: number): Buffer {
  const resvg = new Resvg(svg.svg, {
    fitTo: { mode: 'zoom', value: scale },
    font: { loadSystemFonts: true, defaultFontFamily: 'DejaVu Sans' },
    background: 'white',
  });
  return resvg.render().asPng();
}

/** Convertit un fragment Markdown en corps compatible format storage Confluence (XHTML). */
async function markdownToStorage(md: string): Promise<string> {
  if (!md.trim()) return '';
  let html = (await marked.parse(md, { gfm: true, breaks: false })) as string;

  // Blocs de code -> macro Confluence "code"
  html = html.replace(
    /<pre><code(?:\s+class="language-([^"]*)")?>([\s\S]*?)<\/code><\/pre>/g,
    (_m, lang: string | undefined, code: string) => {
      const decoded = code
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/\n$/, '');
      const safe = decoded.replace(/]]>/g, ']]]]><![CDATA[>');
      const langParam = lang ? `<ac:parameter ac:name="language">${lang}</ac:parameter>` : '';
      return `<ac:structured-macro ac:name="code">${langParam}<ac:plain-text-body><![CDATA[${safe}]]></ac:plain-text-body></ac:structured-macro>`;
    }
  );

  // Images Markdown externes -> macro image Confluence par URL
  html = html.replace(
    /<img\s+[^>]*src="([^"]+)"[^>]*\/?>/g,
    (_m, src: string) => `<ac:image><ri:url ri:value="${src}"/></ac:image>`
  );

  // Éléments vides en XHTML auto-fermant
  html = html.replace(/<br>/g, '<br/>').replace(/<hr>/g, '<hr/>');

  return html.trim();
}

function imageMacro(filename: string, alt: string): string {
  return `<ac:image ac:alt="${alt.replace(/"/g, '&quot;')}"><ri:attachment ri:filename="${filename}"/></ac:image>`;
}

function extractTitle(markdownBlocks: string[], fallback: string): string {
  for (const md of markdownBlocks) {
    const m = md.match(/^\s*#\s+(.+?)\s*$/m);
    if (m) return m[1].trim();
  }
  return fallback;
}

export interface ExportOptions {
  absPath: string;
  library: ComponentLibrary;
  outDir?: string;
  scale?: number;
  title?: string;
}

export async function exportConfluence(opts: ExportOptions): Promise<ConfluenceExportResult> {
  const { absPath, library } = opts;
  const scale = opts.scale && opts.scale > 0 ? opts.scale : 2;
  const text = fs.readFileSync(absPath, 'utf-8');
  const blocks = parseArchDocument(text);
  const resolve = buildResolver(library);

  const base = path.basename(absPath).replace(/\.arch\.md$/, '').replace(/\.arch$/, '');
  const outDir = opts.outDir
    ? path.resolve(path.dirname(absPath), opts.outDir)
    : path.join(path.dirname(absPath), `${base}.confluence`);
  fs.mkdirSync(outDir, { recursive: true });

  const markdownBlocks = blocks.filter((b) => b.type === 'markdown').map((b) => b.content);
  const title = opts.title || extractTitle(markdownBlocks, base);

  const bodyParts: string[] = [];
  const images: ConfluenceImage[] = [];
  let diagramSeq = 0;

  for (const block of blocks) {
    if (block.type === 'markdown') {
      const storage = await markdownToStorage(block.content);
      if (storage) bodyParts.push(storage);
      continue;
    }

    let svg: SvgResult | undefined;
    let diagTitle = '';
    if (block.type === 'arch-box' && block.boxDiagram) {
      svg = boxDiagramToSvg(block.boxDiagram, resolve);
      diagTitle = block.boxDiagram.title || 'Diagramme de composants';
    } else if (block.type === 'arch-seq' && block.seqDiagram) {
      svg = seqDiagramToSvg(block.seqDiagram, resolve);
      diagTitle = block.seqDiagram.title || 'Diagramme de séquence';
    } else if (block.type === 'arch-db' && block.dbDiagram) {
      svg = dbDiagramToSvg(block.dbDiagram);
      diagTitle = block.dbDiagram.title || 'Schéma de base de données';
    }
    if (!svg) continue;

    diagramSeq += 1;
    const filename = `${base}-diagramme-${String(diagramSeq).padStart(2, '0')}.png`;
    const file = path.join(outDir, filename);
    const png = rasterize(svg, scale);
    fs.writeFileSync(file, png);
    images.push({ file, filename, width: svg.width * scale, height: svg.height * scale });
    bodyParts.push(imageMacro(filename, diagTitle));
  }

  const body = bodyParts.join('\n');
  const bodyPath = path.join(outDir, `${base}.storage.xml`);
  fs.writeFileSync(bodyPath, body, 'utf-8');

  return { title, body, bodyPath, outDir, images };
}
