import React, { useMemo } from 'react';
import { marked } from 'marked';
import { ArchDocumentBlock, ComponentLibrary } from '@shared/archTypes';
import {
  CompResolver,
  boxDiagramToSvg,
  dbDiagramToSvg,
  seqDiagramToSvg,
} from '@shared/diagramSvg';

/** Résout une référence de composant vers sa couleur et son nom (même logique que l'export). */
function buildResolver(library: ComponentLibrary): CompResolver {
  const map = new Map(library.components.map((c) => [c.id, c]));
  return (ref) => {
    const c = ref ? map.get(ref) : undefined;
    return { color: c?.color || '#3B82F6', name: c?.name || ref || 'Composant' };
  };
}

const DiagramFigure: React.FC<{ svg: string; title?: string }> = ({ svg, title }) => (
  <figure className="arch-view-figure">
    <div className="arch-view-svg" dangerouslySetInnerHTML={{ __html: svg }} />
    {title && <figcaption className="arch-view-caption">{title}</figcaption>}
  </figure>
);

/**
 * Rendu en lecture seule d'un bloc de document : Markdown mis en forme, schémas intégrés
 * directement en SVG (aucun outil d'édition).
 */
export const BlockView: React.FC<{
  block: ArchDocumentBlock;
  library: ComponentLibrary;
}> = ({ block, library }) => {
  const resolve = useMemo(() => buildResolver(library), [library]);

  if (block.type === 'markdown') {
    const html = marked.parse(block.content || '', { async: false }) as string;
    return (
      <div
        className="arch-md-content arch-view-md"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  if (block.type === 'arch-box' && block.boxDiagram) {
    const { svg } = boxDiagramToSvg(block.boxDiagram, resolve);
    return <DiagramFigure svg={svg} title={block.boxDiagram.title} />;
  }

  if (block.type === 'arch-seq' && block.seqDiagram) {
    const { svg } = seqDiagramToSvg(block.seqDiagram, resolve);
    return <DiagramFigure svg={svg} title={block.seqDiagram.title} />;
  }

  if (block.type === 'arch-db' && block.dbDiagram) {
    const { svg } = dbDiagramToSvg(block.dbDiagram);
    return <DiagramFigure svg={svg} title={block.dbDiagram.title} />;
  }

  return null;
};
