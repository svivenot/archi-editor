import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  Node,
  Edge,
  Connection,
  NodeChange,
  applyNodeChanges,
  NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';
import {
  ArchBoxDiagram,
  ArchBoxEdge,
  ArchBoxNode,
  ArchEdgeStyle,
  ComponentDefinition,
  ComponentLibrary,
} from '@shared/archTypes';
import { parseBoxYaml, serializeBoxYaml } from '@shared/documentParser';
import { ArchSymbol } from '../../symbols/ArchSymbolRegistry';
import {
  Search,
  Plus,
  LayoutGrid,
  Code2,
  Trash2,
  Link2,
  PanelLeftClose,
  PanelLeftOpen,
  SlidersHorizontal,
} from 'lucide-react';

interface ArchNodeData extends Record<string, unknown> {
  archNode: ArchBoxNode;
  compDef: ComponentDefinition;
}

const ArchComponentNodeView: React.FC<NodeProps<Node<ArchNodeData>>> = ({
  data,
  selected,
}) => {
  const { archNode, compDef } = data;
  const isContainer = Boolean(compDef.isContainer || compDef.shape === 'container');
  const propEntries = Object.entries(archNode.props || {});

  if (isContainer) {
    return (
      <div
        className={`arch-rf-container-node ${selected ? 'selected' : ''}`}
        style={{
          width: archNode.width || 720,
          height: archNode.height || 380,
          borderColor: compDef.color,
          backgroundColor: `${compDef.color}0D`,
        }}
      >
        <Handle type="target" position={Position.Left} className="arch-rf-handle" />
        <div
          className="arch-rf-container-header"
          style={{ borderBottomColor: `${compDef.color}40` }}
        >
          <ArchSymbol symbol={compDef.symbol} color={compDef.color} size={22} />
          <div className="arch-rf-container-title-wrap">
            <span className="arch-rf-container-badge" style={{ color: compDef.color }}>
              {compDef.name}
            </span>
            <span className="arch-rf-container-label">{archNode.label}</span>
          </div>
          {propEntries.length > 0 && (
            <div className="arch-rf-container-props">
              {propEntries.map(([k, v]) => (
                <span key={k} className="arch-rf-prop-pill">
                  {k}: {v}
                </span>
              ))}
            </div>
          )}
        </div>
        <Handle type="source" position={Position.Right} className="arch-rf-handle" />
      </div>
    );
  }

  return (
    <div
      className={`arch-rf-node shape-${compDef.shape} ${selected ? 'selected' : ''}`}
      style={{
        borderColor: selected ? compDef.color : `${compDef.color}88`,
        boxShadow: selected
          ? `0 0 0 2px ${compDef.color}, 0 8px 20px -4px rgba(0,0,0,0.18)`
          : undefined,
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="t-left"
        className="arch-rf-handle"
      />
      <Handle
        type="target"
        position={Position.Top}
        id="t-top"
        className="arch-rf-handle"
      />

      {compDef.shape === 'cylinder' && (
        <div
          className="arch-rf-cylinder-cap"
          style={{
            backgroundColor: `${compDef.color}22`,
            borderColor: `${compDef.color}88`,
          }}
        />
      )}

      <div
        className="arch-rf-node-accent"
        style={{ backgroundColor: compDef.color }}
      />

      <div className="arch-rf-node-body">
        <div className="arch-rf-node-main">
          <div className="arch-rf-node-icon">
            <ArchSymbol symbol={compDef.symbol} color={compDef.color} size={32} />
          </div>
          <div className="arch-rf-node-texts">
            <div className="arch-rf-node-type" style={{ color: compDef.color }}>
              {compDef.name}
            </div>
            <div className="arch-rf-node-label">{archNode.label}</div>
            {(archNode.subtitle || compDef.defaultTech) && (
              <div className="arch-rf-node-subtitle">
                {archNode.subtitle || compDef.defaultTech}
              </div>
            )}
          </div>
        </div>

        {propEntries.length > 0 && (
          <div className="arch-rf-node-props">
            {propEntries.map(([k, v]) => (
              <span key={k} className="arch-rf-prop-tag">
                <strong>{k}:</strong> {v}
              </span>
            ))}
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="s-right"
        className="arch-rf-handle"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="s-bottom"
        className="arch-rf-handle"
      />
    </div>
  );
};

const nodeTypes = {
  archComponent: ArchComponentNodeView,
};

interface ArchBoxEditorProps {
  diagram: ArchBoxDiagram;
  library: ComponentLibrary;
  onChange: (updated: ArchBoxDiagram) => void;
  onDeleteBlock: () => void;
}

export const ArchBoxEditor: React.FC<ArchBoxEditorProps> = ({
  diagram,
  library,
  onChange,
  onDeleteBlock,
}) => {
  const [showPalette, setShowPalette] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [yamlMode, setYamlMode] = useState(false);
  const [rawYamlText, setRawYamlText] = useState(() => serializeBoxYaml(diagram));
  const [yamlError, setYamlError] = useState<string | undefined>();

  // Quick link creation state
  const [quickSource, setQuickSource] = useState<string>('');
  const [quickTarget, setQuickTarget] = useState<string>('');
  const [quickLabel, setQuickLabel] = useState<string>('');
  const [quickProtocol, setQuickProtocol] = useState<string>('HTTPS');

  // New property input state
  const [newPropKey, setNewPropKey] = useState('');
  const [newPropVal, setNewPropVal] = useState('');

  useEffect(() => {
    setRawYamlText(serializeBoxYaml(diagram));
  }, [diagram]);

  const componentMap = useMemo(() => {
    const map = new Map<string, ComponentDefinition>();
    for (const c of library.components) {
      map.set(c.id, c);
    }
    return map;
  }, [library]);

  const resolveComponent = useCallback(
    (ref: string): ComponentDefinition => {
      return (
        componentMap.get(ref) || {
          id: ref,
          name: ref,
          category: 'generic',
          symbol: ref,
          color: '#3B82F6',
          shape: 'rounded-rect',
        }
      );
    },
    [componentMap]
  );

  // Convert ArchBoxDiagram nodes to ReactFlow nodes (containers first so they render behind)
  const rfNodes: Node<ArchNodeData>[] = useMemo(() => {
    const sorted = [...diagram.nodes].sort((a, b) => {
      const aCont = resolveComponent(a.componentRef).isContainer ? 0 : 1;
      const bCont = resolveComponent(b.componentRef).isContainer ? 0 : 1;
      return aCont - bCont;
    });

    return sorted.map((n) => {
      const compDef = resolveComponent(n.componentRef);
      const isContainer = Boolean(compDef.isContainer);
      return {
        id: n.id,
        type: 'archComponent',
        position: { x: n.position.x, y: n.position.y },
        zIndex: isContainer ? -1 : 10,
        selected: n.id === selectedNodeId,
        data: {
          archNode: n,
          compDef,
        },
      };
    });
  }, [diagram.nodes, resolveComponent, selectedNodeId]);

  const rfEdges: Edge[] = useMemo(() => {
    return diagram.edges.map((e) => {
      const fullLabel = [e.label, e.protocol ? `[${e.protocol}]` : '']
        .filter(Boolean)
        .join(' ');
      const strokeDasharray =
        e.style === 'dashed'
          ? '6 4'
          : e.style === 'dotted'
          ? '2 4'
          : undefined;
      const isSelected = e.id === selectedEdgeId;

      return {
        id: e.id,
        source: e.source,
        target: e.target,
        label: fullLabel || undefined,
        animated: Boolean(e.animated),
        selected: isSelected,
        style: {
          stroke: isSelected ? '#2563EB' : '#475569',
          strokeWidth: isSelected ? 2.6 : 2,
          strokeDasharray,
        },
        labelStyle: {
          fill: '#0F172A',
          fontWeight: 600,
          fontSize: 11,
        },
        labelBgStyle: {
          fill: '#F8FAFC',
          stroke: '#CBD5E1',
          strokeWidth: 1,
          rx: 4,
          ry: 4,
        },
        labelBgPadding: [6, 4] as [number, number],
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isSelected ? '#2563EB' : '#475569',
        },
        markerStart: e.bidirectional
          ? {
              type: MarkerType.ArrowClosed,
              color: isSelected ? '#2563EB' : '#475569',
            }
          : undefined,
      };
    });
  }, [diagram.edges, selectedEdgeId]);

  const handleNodesChange = useCallback(
    (changes: NodeChange<Node<ArchNodeData>>[]) => {
      const updatedRf = applyNodeChanges(changes, rfNodes);
      const posMap = new Map<string, { x: number; y: number }>();
      for (const item of updatedRf) {
        posMap.set(item.id, item.position);
      }
      let moved = false;
      const nextNodes = diagram.nodes.map((n) => {
        const nextPos = posMap.get(n.id);
        if (
          nextPos &&
          (Math.round(nextPos.x) !== Math.round(n.position.x) ||
            Math.round(nextPos.y) !== Math.round(n.position.y))
        ) {
          moved = true;
          return {
            ...n,
            position: { x: Math.round(nextPos.x), y: Math.round(nextPos.y) },
          };
        }
        return n;
      });

      if (moved) {
        onChange({ ...diagram, nodes: nextNodes });
      }
    },
    [rfNodes, diagram, onChange]
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const newEdge: ArchBoxEdge = {
        id: `edge-${Date.now()}`,
        source: connection.source,
        target: connection.target,
        label: 'Flux',
        protocol: 'HTTPS',
        style: 'solid',
      };
      onChange({
        ...diagram,
        edges: [...diagram.edges, newEdge],
      });
      setSelectedEdgeId(newEdge.id);
      setSelectedNodeId(null);
    },
    [diagram, onChange]
  );

  const addComponentToCanvas = useCallback(
    (comp: ComponentDefinition, pos?: { x: number; y: number }) => {
      const count = diagram.nodes.length;
      const defaultPos = pos || {
        x: 100 + (count % 3) * 250,
        y: 90 + Math.floor(count / 3) * 150,
      };
      const newNode: ArchBoxNode = {
        id: `${comp.id}-${Date.now().toString().slice(-4)}`,
        componentRef: comp.id,
        label: comp.name,
        position: defaultPos,
        width: comp.isContainer ? 700 : undefined,
        height: comp.isContainer ? 360 : undefined,
        props: comp.defaultProps ? { ...comp.defaultProps } : undefined,
      };
      onChange({
        ...diagram,
        nodes: [...diagram.nodes, newNode],
      });
      setSelectedNodeId(newNode.id);
      setSelectedEdgeId(null);
    },
    [diagram, onChange]
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const compId = event.dataTransfer.getData('application/arch-component');
      if (!compId) return;
      const comp = resolveComponent(compId);
      const bounds = event.currentTarget.getBoundingClientRect();
      const x = Math.max(20, Math.round(event.clientX - bounds.left - 90));
      const y = Math.max(20, Math.round(event.clientY - bounds.top - 40));
      addComponentToCanvas(comp, { x, y });
    },
    [resolveComponent, addComponentToCanvas]
  );

  const handleAutoLayout = useCallback(() => {
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'LR', nodesep: 70, ranksep: 130, marginx: 60, marginy: 60 });
    g.setDefaultEdgeLabel(() => ({}));

    const nonContainers = diagram.nodes.filter(
      (n) => !resolveComponent(n.componentRef).isContainer
    );
    for (const n of nonContainers) {
      g.setNode(n.id, { width: 220, height: 100 });
    }
    for (const e of diagram.edges) {
      if (g.hasNode(e.source) && g.hasNode(e.target)) {
        g.setEdge(e.source, e.target);
      }
    }
    dagre.layout(g);

    const nextNodes = diagram.nodes.map((n) => {
      const laidOut = g.node(n.id);
      if (!laidOut) return n;
      return {
        ...n,
        position: {
          x: Math.round(laidOut.x - 110),
          y: Math.round(laidOut.y - 50),
        },
      };
    });
    onChange({ ...diagram, nodes: nextNodes });
  }, [diagram, resolveComponent, onChange]);

  const filteredComponents = useMemo(() => {
    return library.components.filter((c) => {
      const matchesCat =
        selectedCategory === 'all' || c.category === selectedCategory;
      const q = searchQuery.trim().toLowerCase();
      const matchesQuery =
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        (c.defaultTech && c.defaultTech.toLowerCase().includes(q)) ||
        (c.description && c.description.toLowerCase().includes(q));
      return matchesCat && matchesQuery;
    });
  }, [library.components, selectedCategory, searchQuery]);

  const selectedNode = useMemo(
    () => diagram.nodes.find((n) => n.id === selectedNodeId) || null,
    [diagram.nodes, selectedNodeId]
  );

  const selectedEdge = useMemo(
    () => diagram.edges.find((e) => e.id === selectedEdgeId) || null,
    [diagram.edges, selectedEdgeId]
  );

  const updateSelectedNode = (patch: Partial<ArchBoxNode>) => {
    if (!selectedNode) return;
    onChange({
      ...diagram,
      nodes: diagram.nodes.map((n) =>
        n.id === selectedNode.id ? { ...n, ...patch } : n
      ),
    });
  };

  const updateSelectedEdge = (patch: Partial<ArchBoxEdge>) => {
    if (!selectedEdge) return;
    onChange({
      ...diagram,
      edges: diagram.edges.map((e) =>
        e.id === selectedEdge.id ? { ...e, ...patch } : e
      ),
    });
  };

  const deleteSelectedElement = () => {
    if (selectedNodeId) {
      onChange({
        ...diagram,
        nodes: diagram.nodes.filter((n) => n.id !== selectedNodeId),
        edges: diagram.edges.filter(
          (e) => e.source !== selectedNodeId && e.target !== selectedNodeId
        ),
      });
      setSelectedNodeId(null);
    } else if (selectedEdgeId) {
      onChange({
        ...diagram,
        edges: diagram.edges.filter((e) => e.id !== selectedEdgeId),
      });
      setSelectedEdgeId(null);
    }
  };

  const handleCreateQuickEdge = () => {
    if (!quickSource || !quickTarget || quickSource === quickTarget) return;
    const edge: ArchBoxEdge = {
      id: `edge-${Date.now()}`,
      source: quickSource,
      target: quickTarget,
      label: quickLabel || 'Appel',
      protocol: quickProtocol || undefined,
      style: 'solid',
    };
    onChange({
      ...diagram,
      edges: [...diagram.edges, edge],
    });
    setQuickLabel('');
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(null);
  };

  return (
    <div className="arch-diagram-card">
      {/* Barre d'en-tête du diagramme de boîtes */}
      <div className="arch-diagram-header">
        <div className="arch-diagram-header-left">
          <span className="arch-diagram-type-badge box">BOÎTES CONNECTÉES</span>
          <input
            type="text"
            className="arch-diagram-title-input"
            value={diagram.title || ''}
            onChange={(e) => onChange({ ...diagram, title: e.target.value })}
            placeholder="Titre du diagramme d'architecture..."
          />
        </div>

        <div className="arch-diagram-header-actions no-print">
          <button
            type="button"
            className="arch-btn-secondary"
            onClick={() => setShowPalette((v) => !v)}
            title="Afficher/Masquer la bibliothèque de composants"
          >
            {showPalette ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
            <span>Bibliothèque ({library.components.length})</span>
          </button>
          <button
            type="button"
            className="arch-btn-secondary"
            onClick={handleAutoLayout}
            title="Réorganiser automatiquement les boîtes (Dagre Auto-Layout)"
          >
            <LayoutGrid size={14} />
            <span>Auto-Layout</span>
          </button>
          <button
            type="button"
            className={`arch-btn-secondary ${yamlMode ? 'active' : ''}`}
            onClick={() => setYamlMode((v) => !v)}
            title="Inspecter ou modifier le YAML source de ce schéma"
          >
            <Code2 size={14} />
            <span>YAML</span>
          </button>
          <button
            type="button"
            className="arch-btn-icon danger"
            onClick={onDeleteBlock}
            title="Supprimer ce diagramme du document"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Barre d'ajout rapide de connexion */}
      {!yamlMode && (
        <div className="arch-quick-connect-bar no-print">
          <div className="arch-quick-connect-group">
            <Link2 size={14} className="text-muted" />
            <span className="arch-quick-connect-label">Relier :</span>
            <select
              value={quickSource}
              onChange={(e) => setQuickSource(e.target.value)}
              className="arch-select-sm"
            >
              <option value="">Source...</option>
              {diagram.nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label}
                </option>
              ))}
            </select>
            <span>→</span>
            <select
              value={quickTarget}
              onChange={(e) => setQuickTarget(e.target.value)}
              className="arch-select-sm"
            >
              <option value="">Cible...</option>
              {diagram.nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Action / Flux (ex: Auth OIDC)"
              value={quickLabel}
              onChange={(e) => setQuickLabel(e.target.value)}
              className="arch-input-sm"
            />
            <input
              type="text"
              placeholder="Protocole (ex: HTTPS, AMQP)"
              value={quickProtocol}
              onChange={(e) => setQuickProtocol(e.target.value)}
              className="arch-input-sm protocol"
            />
            <button
              type="button"
              className="arch-btn-primary-sm"
              onClick={handleCreateQuickEdge}
              disabled={!quickSource || !quickTarget || quickSource === quickTarget}
            >
              + Créer Lien
            </button>
          </div>
          <div className="arch-quick-hint">
            Astuce : Glissez un composant depuis la bibliothèque ou tirez un lien depuis les poignées d'une boîte.
          </div>
        </div>
      )}

      {yamlMode ? (
        <div className="arch-yaml-editor-pane no-print">
          <textarea
            className="arch-yaml-textarea"
            value={rawYamlText}
            onChange={(e) => {
              const nextYaml = e.target.value;
              setRawYamlText(nextYaml);
              const { diagram: parsed, error } = parseBoxYaml(nextYaml);
              setYamlError(error);
              if (!error) {
                onChange(parsed);
              }
            }}
            rows={16}
          />
          {yamlError && <div className="arch-yaml-error">{yamlError}</div>}
        </div>
      ) : (
        <div className="arch-box-workspace">
          {/* Palette de composants (AWS, Azure, SQL Server, Oracle, PostgreSQL, RabbitMQ, Traefik, Keycloak) */}
          {showPalette && (
            <aside className="arch-palette-sidebar no-print">
              <div className="arch-palette-search">
                <Search size={14} />
                <input
                  type="text"
                  placeholder="Filtrer (aws, azure, sql, traefik...)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="arch-palette-categories">
                <button
                  type="button"
                  className={`arch-cat-pill ${
                    selectedCategory === 'all' ? 'active' : ''
                  }`}
                  onClick={() => setSelectedCategory('all')}
                >
                  Tous
                </button>
                {library.categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    className={`arch-cat-pill ${
                      selectedCategory === cat.id ? 'active' : ''
                    }`}
                    onClick={() => setSelectedCategory(cat.id)}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <div className="arch-palette-list">
                {filteredComponents.map((comp) => (
                  <div
                    key={comp.id}
                    className="arch-palette-item"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        'application/arch-component',
                        comp.id
                      );
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onClick={() => addComponentToCanvas(comp)}
                    title={comp.description || comp.name}
                  >
                    <ArchSymbol
                      symbol={comp.symbol}
                      color={comp.color}
                      size={26}
                    />
                    <div className="arch-palette-item-info">
                      <div className="arch-palette-item-name">{comp.name}</div>
                      <div className="arch-palette-item-tech">
                        {comp.defaultTech || comp.category.toUpperCase()}
                      </div>
                    </div>
                    <Plus size={14} className="arch-palette-item-add" />
                  </div>
                ))}
              </div>
            </aside>
          )}

          {/* Canevas interactif React Flow */}
          <div
            className="arch-rf-canvas-wrapper"
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
            }}
            onDrop={handleDrop}
          >
            <ReactFlow
              nodes={rfNodes}
              edges={rfEdges}
              nodeTypes={nodeTypes}
              onNodesChange={handleNodesChange}
              onConnect={handleConnect}
              onNodeClick={(_e, node) => {
                setSelectedNodeId(node.id);
                setSelectedEdgeId(null);
              }}
              onEdgeClick={(_e, edge) => {
                setSelectedEdgeId(edge.id);
                setSelectedNodeId(null);
              }}
              onPaneClick={() => {
                setSelectedNodeId(null);
                setSelectedEdgeId(null);
              }}
              fitView
              fitViewOptions={{ padding: 0.16 }}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={18} size={1} color="#CBD5E1" />
              <Controls className="no-print" />
              <MiniMap
                className="no-print"
                nodeColor={(n) => {
                  const data = n.data as ArchNodeData | undefined;
                  return data?.compDef?.color || '#3B82F6';
                }}
              />
            </ReactFlow>
          </div>

          {/* Inspecteur de propriétés (Boîte ou Lien sélectionné) */}
          {(selectedNode || selectedEdge) && (
            <aside className="arch-inspector-sidebar no-print">
              <div className="arch-inspector-header">
                <div className="arch-inspector-title">
                  <SlidersHorizontal size={14} />
                  <span>
                    {selectedNode ? 'Propriétés du Composant' : 'Propriétés du Lien'}
                  </span>
                </div>
                <button
                  type="button"
                  className="arch-btn-icon danger"
                  onClick={deleteSelectedElement}
                  title="Supprimer l'élément sélectionné"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {selectedNode && (
                <div className="arch-inspector-body">
                  <label className="arch-field-label">Nom affiché</label>
                  <input
                    type="text"
                    className="arch-field-input"
                    value={selectedNode.label}
                    onChange={(e) =>
                      updateSelectedNode({ label: e.target.value })
                    }
                  />

                  <label className="arch-field-label">
                    Type de composant (Bibliothèque)
                  </label>
                  <select
                    className="arch-field-input"
                    value={selectedNode.componentRef}
                    onChange={(e) =>
                      updateSelectedNode({ componentRef: e.target.value })
                    }
                  >
                    {library.categories.map((cat) => (
                      <optgroup key={cat.id} label={cat.label}>
                        {library.components
                          .filter((c) => c.category === cat.id)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </select>

                  <label className="arch-field-label">
                    Sous-titre / Technologie
                  </label>
                  <input
                    type="text"
                    className="arch-field-input"
                    placeholder={
                      resolveComponent(selectedNode.componentRef).defaultTech ||
                      'Ex: PostgreSQL 16, Kong, AKS...'
                    }
                    value={selectedNode.subtitle || ''}
                    onChange={(e) =>
                      updateSelectedNode({
                        subtitle: e.target.value || undefined,
                      })
                    }
                  />

                  {resolveComponent(selectedNode.componentRef).isContainer && (
                    <div className="arch-field-row">
                      <div>
                        <label className="arch-field-label">Largeur (px)</label>
                        <input
                          type="number"
                          className="arch-field-input"
                          value={selectedNode.width || 720}
                          onChange={(e) =>
                            updateSelectedNode({
                              width: Number(e.target.value) || 720,
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className="arch-field-label">Hauteur (px)</label>
                        <input
                          type="number"
                          className="arch-field-input"
                          value={selectedNode.height || 380}
                          onChange={(e) =>
                            updateSelectedNode({
                              height: Number(e.target.value) || 380,
                            })
                          }
                        />
                      </div>
                    </div>
                  )}

                  <div className="arch-inspector-section-title">
                    Métadonnées (Props YAML)
                  </div>
                  <div className="arch-props-list">
                    {Object.entries(selectedNode.props || {}).map(([k, v]) => (
                      <div key={k} className="arch-prop-edit-row">
                        <span className="arch-prop-key">{k}</span>
                        <input
                          type="text"
                          className="arch-field-input"
                          value={v}
                          onChange={(e) => {
                            const nextProps = {
                              ...(selectedNode.props || {}),
                              [k]: e.target.value,
                            };
                            updateSelectedNode({ props: nextProps });
                          }}
                        />
                        <button
                          type="button"
                          className="arch-btn-icon"
                          onClick={() => {
                            const nextProps = { ...(selectedNode.props || {}) };
                            delete nextProps[k];
                            updateSelectedNode({ props: nextProps });
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="arch-prop-add-row">
                    <input
                      type="text"
                      placeholder="Clé (ex: port)"
                      className="arch-field-input"
                      value={newPropKey}
                      onChange={(e) => setNewPropKey(e.target.value)}
                    />
                    <input
                      type="text"
                      placeholder="Valeur (ex: 5432)"
                      className="arch-field-input"
                      value={newPropVal}
                      onChange={(e) => setNewPropVal(e.target.value)}
                    />
                    <button
                      type="button"
                      className="arch-btn-primary-sm"
                      onClick={() => {
                        if (!newPropKey.trim()) return;
                        updateSelectedNode({
                          props: {
                            ...(selectedNode.props || {}),
                            [newPropKey.trim()]: newPropVal,
                          },
                        });
                        setNewPropKey('');
                        setNewPropVal('');
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>
              )}

              {selectedEdge && (
                <div className="arch-inspector-body">
                  <label className="arch-field-label">Description du flux</label>
                  <input
                    type="text"
                    className="arch-field-input"
                    value={selectedEdge.label || ''}
                    onChange={(e) =>
                      updateSelectedEdge({ label: e.target.value })
                    }
                  />

                  <label className="arch-field-label">Protocole</label>
                  <input
                    type="text"
                    className="arch-field-input"
                    placeholder="HTTPS, gRPC, AMQP, SQL..."
                    value={selectedEdge.protocol || ''}
                    onChange={(e) =>
                      updateSelectedEdge({ protocol: e.target.value })
                    }
                  />

                  <label className="arch-field-label">Style de trait</label>
                  <select
                    className="arch-field-input"
                    value={selectedEdge.style || 'solid'}
                    onChange={(e) =>
                      updateSelectedEdge({
                        style: e.target.value as ArchEdgeStyle,
                      })
                    }
                  >
                    <option value="solid">Continu (Synchrone)</option>
                    <option value="dashed">Pointillé (Asynchrone / Event)</option>
                    <option value="dotted">Pointillé fin</option>
                  </select>

                  <label className="arch-checkbox-row">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedEdge.animated)}
                      onChange={(e) =>
                        updateSelectedEdge({ animated: e.target.checked })
                      }
                    />
                    <span>Flux animé</span>
                  </label>

                  <label className="arch-checkbox-row">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedEdge.bidirectional)}
                      onChange={(e) =>
                        updateSelectedEdge({ bidirectional: e.target.checked })
                      }
                    />
                    <span>Flèche bidirectionnelle</span>
                  </label>
                </div>
              )}
            </aside>
          )}
        </div>
      )}
    </div>
  );
};
