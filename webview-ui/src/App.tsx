import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArchBoxDiagram,
  ArchDbDiagram,
  ArchDocumentBlock,
  ArchSeqDiagram,
  ComponentLibrary,
  ExtensionToWebviewMessage,
} from '@shared/archTypes';
import { DEFAULT_COMPONENT_LIBRARY } from '@shared/defaultLibrary';
import {
  createDefaultBoxDiagram,
  createDefaultDbDiagram,
  createDefaultSeqDiagram,
  parseArchDocument,
  serializeArchDocument,
  serializeBoxYaml,
  serializeDbYaml,
  serializeSeqYaml,
} from '@shared/documentParser';
import {
  ArchPage,
  derivePageTitle,
  flattenPagesToBlocks,
  splitBlocksIntoPages,
} from '@shared/archPages';
import { vscodeBridge } from './vscodeApi';
import { MarkdownBlockEditor } from './editor/MarkdownBlockEditor';
import { BlockView } from './view/BlockView';
import { ArchBoxEditor } from './diagrams/box/ArchBoxEditor';
import { ArchSeqEditor } from './diagrams/sequence/ArchSeqEditor';
import { ArchDbEditor } from './diagrams/db/ArchDbEditor';
import { generateAndExportPdf } from './export/pdfGenerator';
import { ArchSymbol } from './symbols/ArchSymbolRegistry';
import {
  FileDown,
  FileCode2,
  Network,
  GitCommitHorizontal,
  FileText,
  BookOpen,
  Database,
  X,
  Plus,
  Eye,
  Pencil,
} from 'lucide-react';

const STANDALONE_DEMO_DOC = `# Dossier d'Architecture : Plateforme Hybride Cloud & Middleware

Ce document d'architecture illustre l'intégration entre nos briques d'infrastructure (**Traefik**, **Keycloak**, **RabbitMQ**, **PostgreSQL**, **MS SQL Server**, **Oracle**) et les services managés **AWS** et **Microsoft Azure**.

## 1. Architecture des Composants et Flux Réseau

Le diagramme de boîtes connectées ci-dessous présente le découpage réseau et les interconnexions entre la passerelle d'entrée, le serveur d'identité SSO, le bus de messages et les bases de données :

\`\`\`arch-box
title: Vue Composants - Ingress Traefik, IAM Keycloak, RabbitMQ & Bases Polyglottes
nodes:
  - id: vpc-prod
    componentRef: aws-vpc
    label: AWS VPC Production (eu-west-1)
    position:
      x: 30
      y: 30
    width: 820
    height: 430
    props:
      cidr: 10.20.0.0/16
  - id: gw-traefik
    componentRef: traefik
    label: Traefik Ingress Proxy
    position:
      x: 65
      y: 185
    props:
      tls: mTLS / Let's Encrypt
      port: "443"
  - id: sso-keycloak
    componentRef: keycloak
    label: Keycloak IAM / OIDC
    position:
      x: 335
      y: 65
    props:
      realm: enterprise-sso
  - id: svc-orders
    componentRef: aws-eks
    label: Order Microservice (EKS)
    position:
      x: 335
      y: 195
    props:
      k8s: "1.30"
  - id: bus-rabbit
    componentRef: rabbitmq
    label: RabbitMQ Broker
    position:
      x: 335
      y: 330
    props:
      vhost: /orders
  - id: db-pg
    componentRef: postgresql
    label: PostgreSQL Orders
    position:
      x: 615
      y: 145
    props:
      version: "16"
      port: "5432"
  - id: db-mssql
    componentRef: mssql
    label: MS SQL Server Billing
    position:
      x: 890
      y: 110
    props:
      edition: Enterprise
      port: "1433"
  - id: db-oracle
    componentRef: oracle
    label: Oracle ERP Core
    position:
      x: 890
      y: 280
    props:
      service: ORCLPROD
      port: "1521"
edges:
  - id: e1
    source: gw-traefik
    target: sso-keycloak
    label: ForwardAuth JWT
    protocol: OIDC/HTTPS
  - id: e2
    source: gw-traefik
    target: svc-orders
    label: Route /api/orders
    protocol: HTTP/2
  - id: e3
    source: svc-orders
    target: db-pg
    label: Read / Write Orders
    protocol: TCP/5432
  - id: e4
    source: svc-orders
    target: bus-rabbit
    label: Publish OrderPlaced
    protocol: AMQP
    style: dashed
    animated: true
  - id: e5
    source: bus-rabbit
    target: db-mssql
    label: Sync Facturation
    protocol: TDS/1433
    style: dashed
  - id: e6
    source: bus-rabbit
    target: db-oracle
    label: Mouvement Stock ERP
    protocol: SQL*Net/1521
    style: dashed
\`\`\`

<!-- arch:page title="Séquence d'Authentification" -->

## 2. Séquence d'Authentification et de Traitement de Commande

Le diagramme de séquence ci-dessous détaille la chronologie des appels lors de la validation d'une commande par un utilisateur :

\`\`\`arch-seq
title: Séquence de Validation de Commande (Traefik -> Keycloak -> EKS -> PostgreSQL & RabbitMQ)
participants:
  - id: client
    label: Portail Web
    componentRef: web-app
  - id: traefik
    label: Traefik Proxy
    componentRef: traefik
  - id: keycloak
    label: Keycloak IAM
    componentRef: keycloak
  - id: eks
    label: Service Commandes
    componentRef: aws-eks
  - id: pg
    label: PostgreSQL
    componentRef: postgresql
  - id: rmq
    label: RabbitMQ
    componentRef: rabbitmq
  - id: oracle
    label: Oracle ERP
    componentRef: oracle
items:
  - id: m1
    type: message
    from: client
    to: traefik
    label: POST /api/orders (Bearer JWT)
    protocol: HTTPS
    kind: sync
  - id: m2
    type: message
    from: traefik
    to: keycloak
    label: Introspection du jeton OIDC
    protocol: HTTPS
    kind: sync
  - id: m3
    type: message
    from: keycloak
    to: traefik
    label: 200 OK (Token valide + Rôles)
    kind: reply
  - id: m4
    type: message
    from: traefik
    to: eks
    label: Transmission requête authentifiée
    protocol: gRPC
    kind: sync
  - id: m5
    type: message
    from: eks
    to: pg
    label: INSERT INTO orders
    protocol: SQL/5432
    kind: sync
  - id: b1
    type: block
    blockKind: par
    label: Propagation asynchrone vers RabbitMQ et Oracle ERP
  - id: m6
    type: message
    from: eks
    to: rmq
    label: Publish OrderCreatedEvent
    protocol: AMQP
    kind: async
  - id: m7
    type: message
    from: rmq
    to: oracle
    label: Mise à jour stock ERP
    protocol: SQL*Net
    kind: async
  - id: m8
    type: message
    from: eks
    to: client
    label: 201 Created (Order Confirmation)
    protocol: HTTPS
    kind: reply
\`\`\`
`;

export const App: React.FC = () => {
  const [fileName, setFileName] = useState<string>('architecture-demo.arch.md');
  const [library, setLibrary] = useState<ComponentLibrary>(
    DEFAULT_COMPONENT_LIBRARY
  );
  const [pages, setPages] = useState<ArchPage[]>(() =>
    splitBlocksIntoPages(parseArchDocument(STANDALONE_DEMO_DOC))
  );
  const [viewMode, setViewMode] = useState<'edit' | 'view'>('edit');
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [editingPageIndex, setEditingPageIndex] = useState<number | null>(null);
  const [dragPageIndex, setDragPageIndex] = useState<number | null>(null);
  const [exportAllPages, setExportAllPages] = useState(false);
  const [showRawDocumentModal, setShowRawDocumentModal] = useState(false);
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const printableRef = useRef<HTMLDivElement | null>(null);
  const lastSerializedRef = useRef<string>(STANDALONE_DEMO_DOC);

  const clampIndex = (i: number, len: number) =>
    Math.max(0, Math.min(i, Math.max(0, len - 1)));

  const activePage = pages[activePageIndex] ?? pages[0];
  const activeBlocks = activePage ? activePage.blocks : [];

  const syncPagesToExtension = useCallback((nextPages: ArchPage[]) => {
    const safe =
      nextPages.length > 0
        ? nextPages
        : [{ id: `page-${Date.now()}`, title: 'Page 1', blocks: [] }];
    setPages(safe);
    const serialized = serializeArchDocument(flattenPagesToBlocks(safe));
    lastSerializedRef.current = serialized;
    vscodeBridge.postMessage({
      type: 'updateDocument',
      documentText: serialized,
    });
  }, []);

  // Met à jour les blocs de la page active, puis synchronise l'ensemble du document.
  const setActivePageBlocks = (nextBlocks: ArchDocumentBlock[]) => {
    const next = pages.map((p, i) =>
      i === activePageIndex ? { ...p, blocks: nextBlocks } : p
    );
    syncPagesToExtension(next);
  };

  const handleExportPdf = useCallback(async () => {
    if (!printableRef.current || isExportingPdf) return;
    setIsExportingPdf(true);
    setExportAllPages(true);
    try {
      // Laisse React rendre toutes les pages dans le conteneur imprimable avant la capture.
      await new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r()))
      );
      if (printableRef.current) {
        await generateAndExportPdf(printableRef.current, fileName);
      }
    } finally {
      setExportAllPages(false);
      setIsExportingPdf(false);
    }
  }, [fileName, isExportingPdf]);

  useEffect(() => {
    const handler = (event: MessageEvent<ExtensionToWebviewMessage>) => {
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;

      switch (msg.type) {
        case 'init': {
          setFileName(msg.fileName);
          setLibrary(msg.library);
          lastSerializedRef.current = msg.documentText;
          const initPages = splitBlocksIntoPages(parseArchDocument(msg.documentText));
          setPages(initPages);
          setActivePageIndex((prev) => clampIndex(prev, initPages.length));
          break;
        }
        case 'externalDocumentChange': {
          if (msg.documentText !== lastSerializedRef.current) {
            lastSerializedRef.current = msg.documentText;
            const extPages = splitBlocksIntoPages(parseArchDocument(msg.documentText));
            setPages(extPages);
            setActivePageIndex((prev) => clampIndex(prev, extPages.length));
          }
          break;
        }
        case 'libraryUpdated': {
          setLibrary(msg.library);
          break;
        }
        case 'triggerPdfExport': {
          handleExportPdf();
          break;
        }
      }
    };

    window.addEventListener('message', handler);
    vscodeBridge.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', handler);
  }, [handleExportPdf]);

  const updateMarkdownBlock = (blockId: string, newMd: string) => {
    setActivePageBlocks(
      activeBlocks.map((b) => (b.id === blockId ? { ...b, content: newMd } : b))
    );
  };

  const updateBoxDiagramBlock = (blockId: string, diagram: ArchBoxDiagram) => {
    setActivePageBlocks(
      activeBlocks.map((b) =>
        b.id === blockId
          ? { ...b, boxDiagram: diagram, content: serializeBoxYaml(diagram) }
          : b
      )
    );
  };

  const updateSeqDiagramBlock = (blockId: string, diagram: ArchSeqDiagram) => {
    setActivePageBlocks(
      activeBlocks.map((b) =>
        b.id === blockId
          ? { ...b, seqDiagram: diagram, content: serializeSeqYaml(diagram) }
          : b
      )
    );
  };

  const updateDbDiagramBlock = (blockId: string, diagram: ArchDbDiagram) => {
    setActivePageBlocks(
      activeBlocks.map((b) =>
        b.id === blockId
          ? { ...b, dbDiagram: diagram, content: serializeDbYaml(diagram) }
          : b
      )
    );
  };

  const insertBlockAt = (index: number, newBlock: ArchDocumentBlock) => {
    const next = [...activeBlocks];
    next.splice(Math.max(0, index), 0, newBlock);
    setActivePageBlocks(next);
  };

  const handleInsertBoxAfter = (index: number) => {
    const diag = createDefaultBoxDiagram();
    insertBlockAt(index + 1, {
      id: `block-box-${Date.now()}`,
      type: 'arch-box',
      content: serializeBoxYaml(diag),
      boxDiagram: diag,
    });
  };

  const handleInsertSeqAfter = (index: number) => {
    const diag = createDefaultSeqDiagram();
    insertBlockAt(index + 1, {
      id: `block-seq-${Date.now()}`,
      type: 'arch-seq',
      content: serializeSeqYaml(diag),
      seqDiagram: diag,
    });
  };

  const handleInsertDbAfter = (index: number) => {
    const diag = createDefaultDbDiagram();
    insertBlockAt(index + 1, {
      id: `block-db-${Date.now()}`,
      type: 'arch-db',
      content: serializeDbYaml(diag),
      dbDiagram: diag,
    });
  };

  const handleAddMarkdownAtEnd = () => {
    insertBlockAt(activeBlocks.length, {
      id: `block-md-${Date.now()}`,
      type: 'markdown',
      content: '## Nouvelle Section\n\nDécrivez votre architecture ici...',
    });
  };

  const handleDeleteBlock = (blockId: string) => {
    const filtered = activeBlocks.filter((b) => b.id !== blockId);
    if (filtered.length === 0) {
      filtered.push({
        id: `block-md-${Date.now()}`,
        type: 'markdown',
        content: '# Titre du Document',
      });
    }
    setActivePageBlocks(filtered);
  };

  // --- Gestion des pages -----------------------------------------------------

  const handleSelectPage = (i: number) => {
    setEditingPageIndex(null);
    setActivePageIndex(clampIndex(i, pages.length));
  };

  const handleAddPage = () => {
    const newPage: ArchPage = {
      id: `page-${Date.now()}`,
      title: `Page ${pages.length + 1}`,
      blocks: [
        {
          id: `block-md-${Date.now()}`,
          type: 'markdown',
          content: '## Nouvelle page\n\nDécrivez cette page ici...',
        },
      ],
    };
    const next = [...pages, newPage];
    syncPagesToExtension(next);
    setActivePageIndex(next.length - 1);
  };

  const handleRenamePage = (i: number, title: string) => {
    const clean = title.trim();
    const next = pages.map((p, idx) =>
      idx === i ? { ...p, title: clean || derivePageTitle(p, idx) } : p
    );
    syncPagesToExtension(next);
    setEditingPageIndex(null);
  };

  const handleDeletePage = (i: number) => {
    if (pages.length <= 1) return;
    const activeId = pages[activePageIndex]?.id;
    const next = pages.filter((_, idx) => idx !== i);
    syncPagesToExtension(next);
    const stillThere = next.findIndex((p) => p.id === activeId);
    setActivePageIndex(stillThere >= 0 ? stillThere : clampIndex(i, next.length));
  };

  const handleReorderPages = (from: number | null, to: number) => {
    setDragPageIndex(null);
    if (from === null || from === to) return;
    const activeId = pages[activePageIndex]?.id;
    const next = [...pages];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    syncPagesToExtension(next);
    const found = next.findIndex((p) => p.id === activeId);
    setActivePageIndex(found >= 0 ? found : clampIndex(activePageIndex, next.length));
  };

  const renderBlocks = (blockList: ArchDocumentBlock[]) =>
    blockList.map((block, index) => {
      if (block.type === 'markdown') {
        return (
          <MarkdownBlockEditor
            key={block.id}
            markdown={block.content}
            onChange={(md) => updateMarkdownBlock(block.id, md)}
            onInsertBoxBelow={() => handleInsertBoxAfter(index)}
            onInsertSeqBelow={() => handleInsertSeqAfter(index)}
            onDeleteBlock={() => handleDeleteBlock(block.id)}
            canDelete={blockList.length > 1}
          />
        );
      }

      if (block.type === 'arch-box' && block.boxDiagram) {
        return (
          <ArchBoxEditor
            key={block.id}
            diagram={block.boxDiagram}
            library={library}
            onChange={(updated) => updateBoxDiagramBlock(block.id, updated)}
            onDeleteBlock={() => handleDeleteBlock(block.id)}
          />
        );
      }

      if (block.type === 'arch-seq' && block.seqDiagram) {
        return (
          <ArchSeqEditor
            key={block.id}
            diagram={block.seqDiagram}
            library={library}
            onChange={(updated) => updateSeqDiagramBlock(block.id, updated)}
            onDeleteBlock={() => handleDeleteBlock(block.id)}
          />
        );
      }

      if (block.type === 'arch-db' && block.dbDiagram) {
        return (
          <ArchDbEditor
            key={block.id}
            diagram={block.dbDiagram}
            onChange={(updated) => updateDbDiagramBlock(block.id, updated)}
            onDeleteBlock={() => handleDeleteBlock(block.id)}
          />
        );
      }

      return null;
    });

  return (
    <div className="arch-app-shell">
      {/* Barre d'outils principale de l'éditeur WYSIWYG */}
      <header className="arch-topbar no-print">
        <div className="arch-topbar-brand">
          <div className="arch-brand-logo">A</div>
          <div>
            <div className="arch-brand-title">Archi WYSIWYG Editor</div>
            <div className="arch-brand-subtitle">{fileName}</div>
          </div>
        </div>

        <div className="arch-topbar-actions">
          <div className="arch-mode-toggle" role="group" aria-label="Mode">
            <button
              type="button"
              className={`arch-mode-btn${viewMode === 'edit' ? ' active' : ''}`}
              onClick={() => setViewMode('edit')}
              title="Mode édition"
            >
              <Pencil size={14} />
              <span>Édition</span>
            </button>
            <button
              type="button"
              className={`arch-mode-btn${viewMode === 'view' ? ' active' : ''}`}
              onClick={() => setViewMode('view')}
              title="Mode visualisation (schémas intégrés, lecture seule)"
            >
              <Eye size={14} />
              <span>Visualisation</span>
            </button>
          </div>

          <span className="arch-topbar-divider" />

          {viewMode === 'edit' && (
            <>
              <button
                type="button"
                className="arch-top-btn"
                onClick={handleAddMarkdownAtEnd}
              >
                <FileText size={15} />
                <span>+ Section Markdown</span>
              </button>
              <button
                type="button"
                className="arch-top-btn"
                onClick={() => handleInsertBoxAfter(activeBlocks.length - 1)}
              >
                <Network size={15} />
                <span>+ Schéma de Boîtes</span>
              </button>
              <button
                type="button"
                className="arch-top-btn"
                onClick={() => handleInsertSeqAfter(activeBlocks.length - 1)}
              >
                <GitCommitHorizontal size={15} />
                <span>+ Schéma de Séquence</span>
              </button>
              <button
                type="button"
                className="arch-top-btn"
                onClick={() => handleInsertDbAfter(activeBlocks.length - 1)}
              >
                <Database size={15} />
                <span>+ Schéma BDD</span>
              </button>

              <span className="arch-topbar-divider" />
            </>
          )}

          <button
            type="button"
            className="arch-top-btn"
            onClick={() => setShowCatalogModal(true)}
            title="Voir le catalogue de composants (AWS, Azure, SQL Server, Oracle, PostgreSQL, RabbitMQ, Traefik, Keycloak)"
          >
            <BookOpen size={15} />
            <span>Catalogue ({library.components.length})</span>
          </button>

          <button
            type="button"
            className="arch-top-btn"
            onClick={() => {
              if (vscodeBridge.isVsCodeEnvironment()) {
                vscodeBridge.postMessage({ type: 'openAsText' });
              } else {
                setShowRawDocumentModal(true);
              }
            }}
            title="Inspecter ou éditer le fichier .arch.md complet (Markdown + YAML)"
          >
            <FileCode2 size={15} />
            <span>Source .arch.md</span>
          </button>

          <button
            type="button"
            className="arch-top-btn primary"
            onClick={handleExportPdf}
            disabled={isExportingPdf}
            title="Générer et exporter le document complet en PDF"
          >
            <FileDown size={15} />
            <span>
              {isExportingPdf ? 'Génération PDF...' : 'Exporter PDF'}
            </span>
          </button>
        </div>
      </header>

      {/* Barre de navigation des pages */}
      <nav className="arch-pagebar no-print">
        <div className="arch-pagebar-tabs">
          {pages.map((page, i) => (
            <div
              key={page.id}
              className={
                'arch-page-tab' +
                (i === activePageIndex ? ' active' : '') +
                (dragPageIndex === i ? ' dragging' : '')
              }
              draggable={viewMode === 'edit' && editingPageIndex !== i}
              onDragStart={() => setDragPageIndex(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleReorderPages(dragPageIndex, i)}
              onDragEnd={() => setDragPageIndex(null)}
              onClick={() => handleSelectPage(i)}
              onDoubleClick={
                viewMode === 'edit' ? () => setEditingPageIndex(i) : undefined
              }
              title={
                viewMode === 'edit'
                  ? `${page.title} — double-clic pour renommer`
                  : page.title
              }
            >
              {editingPageIndex === i ? (
                <input
                  className="arch-page-tab-input"
                  autoFocus
                  defaultValue={page.title}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => handleRenamePage(i, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleRenamePage(i, (e.target as HTMLInputElement).value);
                    } else if (e.key === 'Escape') {
                      setEditingPageIndex(null);
                    }
                  }}
                />
              ) : (
                <>
                  <span className="arch-page-tab-index">{i + 1}</span>
                  <span className="arch-page-tab-label">{page.title}</span>
                  {viewMode === 'edit' && pages.length > 1 && (
                    <button
                      type="button"
                      className="arch-page-tab-close"
                      title="Supprimer la page"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeletePage(i);
                      }}
                    >
                      <X size={12} />
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
        {viewMode === 'edit' && (
          <button
            type="button"
            className="arch-page-add"
            onClick={handleAddPage}
            title="Ajouter une page"
          >
            <Plus size={15} />
            <span>Page</span>
          </button>
        )}
      </nav>

      {/* Conteneur principal du document WYSIWYG (imprimable / exportable en PDF) */}
      <main className="arch-document-scroll">
        <div
          id="arch-document-printable"
          ref={printableRef}
          className="arch-document-page"
        >
          {exportAllPages ? (
            pages.map((page, pi) => (
              <section
                key={page.id}
                className={'arch-print-page' + (pi > 0 ? ' arch-page-break' : '')}
              >
                {renderBlocks(page.blocks)}
              </section>
            ))
          ) : viewMode === 'view' ? (
            <div className="arch-view-stack">
              {activeBlocks.map((block) => (
                <BlockView key={block.id} block={block} library={library} />
              ))}
            </div>
          ) : (
            <>
              {renderBlocks(activeBlocks)}

              {/* Barre d'insertion rapide en bas de page */}
              <div className="arch-bottom-insert-bar no-print">
                <span className="arch-bottom-insert-label">
                  Ajouter à la page « {activePage?.title} » :
                </span>
                <button
                  type="button"
                  className="arch-insert-card-btn"
                  onClick={handleAddMarkdownAtEnd}
                >
                  <FileText size={16} />
                  <span>+ Texte Markdown</span>
                </button>
                <button
                  type="button"
                  className="arch-insert-card-btn box"
                  onClick={() => handleInsertBoxAfter(activeBlocks.length - 1)}
                >
                  <Network size={16} />
                  <span>+ Diagramme de Boîtes Connectées</span>
                </button>
                <button
                  type="button"
                  className="arch-insert-card-btn seq"
                  onClick={() => handleInsertSeqAfter(activeBlocks.length - 1)}
                >
                  <GitCommitHorizontal size={16} />
                  <span>+ Diagramme de Séquence</span>
                </button>
                <button
                  type="button"
                  className="arch-insert-card-btn db"
                  onClick={() => handleInsertDbAfter(activeBlocks.length - 1)}
                >
                  <Database size={16} />
                  <span>+ Schéma de Base de Données</span>
                </button>
              </div>
            </>
          )}
        </div>
      </main>

      {/* Modale du Catalogue de Composants */}
      {showCatalogModal && (
        <div className="arch-modal-backdrop no-print">
          <div className="arch-modal-card">
            <div className="arch-modal-header">
              <h3>
                Bibliothèque de Composants ({library.components.length} symboles
                disponibles)
              </h3>
              <div className="arch-modal-header-actions">
                {vscodeBridge.isVsCodeEnvironment() && (
                  <button
                    type="button"
                    className="arch-btn-secondary"
                    onClick={() =>
                      vscodeBridge.postMessage({ type: 'initWorkspaceLibrary' })
                    }
                  >
                    Personnaliser (arch-components.yaml)
                  </button>
                )}
                <button
                  type="button"
                  className="arch-btn-icon"
                  onClick={() => setShowCatalogModal(false)}
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="arch-modal-body">
              {library.categories.map((cat) => (
                <div key={cat.id} className="arch-catalog-section">
                  <h4>{cat.label}</h4>
                  <div className="arch-catalog-grid">
                    {library.components
                      .filter((c) => c.category === cat.id)
                      .map((c) => (
                        <div key={c.id} className="arch-catalog-card">
                          <ArchSymbol
                            symbol={c.symbol}
                            color={c.color}
                            size={30}
                          />
                          <div>
                            <div className="arch-catalog-name">{c.name}</div>
                            <div className="arch-catalog-id">
                              ref: <code>{c.id}</code>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modale d'inspection/édition du fichier source .arch.md complet */}
      {showRawDocumentModal && (
        <div className="arch-modal-backdrop no-print">
          <div className="arch-modal-card">
            <div className="arch-modal-header">
              <h3>Source complète du fichier ({fileName})</h3>
              <button
                type="button"
                className="arch-btn-icon"
                onClick={() => setShowRawDocumentModal(false)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="arch-modal-body">
              <textarea
                className="arch-yaml-textarea"
                rows={24}
                value={serializeArchDocument(flattenPagesToBlocks(pages))}
                onChange={(e) => {
                  const nextText = e.target.value;
                  lastSerializedRef.current = nextText;
                  const nextPages = splitBlocksIntoPages(parseArchDocument(nextText));
                  setPages(nextPages);
                  setActivePageIndex((prev) => clampIndex(prev, nextPages.length));
                  vscodeBridge.postMessage({
                    type: 'updateDocument',
                    documentText: nextText,
                  });
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
