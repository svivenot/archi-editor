import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  useNodesState,
  NodeProps,
  ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ArchDbCardinality,
  ArchDbColumn,
  ArchDbDiagram,
  ArchDbRelation,
  ArchDbTable,
} from '@shared/archTypes';
import { parseDbYaml, serializeDbYaml } from '@shared/documentParser';
import { autoLayoutDbDiagram } from '@shared/archOps';
import { useFullscreen, FullscreenButton } from '../fullscreen';
import {
  Plus,
  LayoutGrid,
  Code2,
  Trash2,
  Table2,
  KeyRound,
  Link2,
  SlidersHorizontal,
} from 'lucide-react';

const DEFAULT_TABLE_COLOR = '#2563EB';

// Étiquettes courtes de cardinalité affichées sur les relations
const CARDINALITY_TAG: Record<ArchDbCardinality, string> = {
  'one-to-one': '1 — 1',
  'one-to-many': '1 — N',
  'many-to-one': 'N — 1',
  'many-to-many': 'N — N',
};

interface ArchDbTableData extends Record<string, unknown> {
  table: ArchDbTable;
  highlightColumns: Set<string>;
}

const ArchDbTableNodeView: React.FC<NodeProps<Node<ArchDbTableData>>> = ({
  data,
  selected,
}) => {
  const { table, highlightColumns } = data;
  const color = table.color || DEFAULT_TABLE_COLOR;

  return (
    <div
      className={`arch-db-node ${selected ? 'selected' : ''}`}
      style={{
        borderColor: selected ? color : `${color}88`,
        boxShadow: selected
          ? `0 0 0 2px ${color}, 0 10px 24px -6px rgba(0,0,0,0.22)`
          : undefined,
      }}
    >
      <Handle type="target" position={Position.Left} className="arch-rf-handle" />
      <Handle type="source" position={Position.Right} className="arch-rf-handle" />

      <div className="arch-db-node-header" style={{ backgroundColor: color }}>
        <Table2 size={15} />
        <span className="arch-db-node-title">
          {table.schema ? `${table.schema}.` : ''}
          {table.name}
        </span>
      </div>

      <div className="arch-db-node-cols">
        {table.columns.length === 0 && (
          <div className="arch-db-col arch-db-col-empty">(aucune colonne)</div>
        )}
        {table.columns.map((col) => (
          <div
            key={col.name}
            className={`arch-db-col ${col.pk ? 'is-pk' : ''} ${
              highlightColumns.has(col.name) ? 'is-linked' : ''
            }`}
          >
            <span className="arch-db-col-key">
              {col.pk ? (
                <KeyRound size={12} className="arch-db-icon-pk" />
              ) : col.fk ? (
                <Link2 size={12} className="arch-db-icon-fk" />
              ) : (
                <span className="arch-db-col-key-spacer" />
              )}
            </span>
            <span className="arch-db-col-name">
              {col.name}
              {col.unique && !col.pk ? <sup className="arch-db-col-flag">U</sup> : null}
              {col.nullable ? <sup className="arch-db-col-flag muted">?</sup> : null}
            </span>
            <span className="arch-db-col-type">{col.type || ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const nodeTypes = {
  archDbTable: ArchDbTableNodeView,
};

interface ArchDbEditorProps {
  diagram: ArchDbDiagram;
  onChange: (updated: ArchDbDiagram) => void;
  onDeleteBlock: () => void;
}

export const ArchDbEditor: React.FC<ArchDbEditorProps> = ({
  diagram,
  onChange,
  onDeleteBlock,
}) => {
  const [fullscreen, setFullscreen] = useFullscreen();
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [selectedRelationId, setSelectedRelationId] = useState<string | null>(null);
  const [yamlMode, setYamlMode] = useState(false);
  const [rawYamlText, setRawYamlText] = useState(() => serializeDbYaml(diagram));
  const [yamlError, setYamlError] = useState<string | undefined>();

  const rfInstanceRef = useRef<ReactFlowInstance<Node<ArchDbTableData>, Edge> | null>(
    null
  );

  const fitViewOptions = useMemo(
    () => ({ padding: 0.2, minZoom: 0.1, maxZoom: 1.5, duration: 300 }),
    []
  );

  useEffect(() => {
    setRawYamlText(serializeDbYaml(diagram));
  }, [diagram]);

  // Colonnes impliquées dans une relation, par table (pour les mettre en évidence)
  const linkedColumnsByTable = useMemo(() => {
    const map = new Map<string, Set<string>>();
    const add = (tableId: string, col?: string) => {
      if (!col) return;
      const set = map.get(tableId) || new Set<string>();
      set.add(col);
      map.set(tableId, set);
    };
    for (const r of diagram.relations) {
      add(r.source, r.sourceColumn);
      add(r.target, r.targetColumn);
    }
    return map;
  }, [diagram.relations]);

  // Nœuds « souhaités » dérivés du diagramme (source de vérité).
  const desiredNodes: Node<ArchDbTableData>[] = useMemo(() => {
    return diagram.tables.map((t) => ({
      id: t.id,
      type: 'archDbTable',
      position: { x: t.position.x, y: t.position.y },
      selected: t.id === selectedTableId,
      data: {
        table: t,
        highlightColumns: linkedColumnsByTable.get(t.id) || new Set<string>(),
      },
    }));
  }, [diagram.tables, selectedTableId, linkedColumnsByTable]);

  // État géré par React Flow (conserve les dimensions mesurées : évite que les tables se
  // « désinitialisent » et que les relations disparaissent pendant un déplacement).
  const [rfNodes, setRfNodes, onRfNodesChange] =
    useNodesState<Node<ArchDbTableData>>(desiredNodes);

  useEffect(() => {
    setRfNodes((prev) => {
      const prevById = new Map(prev.map((n) => [n.id, n]));
      return desiredNodes.map((d) => {
        const p = prevById.get(d.id);
        if (!p) return d;
        return { ...p, position: d.position, selected: d.selected, data: d.data };
      });
    });
  }, [desiredNodes, setRfNodes]);

  const rfEdges: Edge[] = useMemo(() => {
    return diagram.relations.map((r) => {
      const isSelected = r.id === selectedRelationId;
      const tag = CARDINALITY_TAG[r.cardinality || 'one-to-many'];
      const label = [tag, r.label].filter(Boolean).join('  ');
      return {
        id: r.id,
        source: r.source,
        target: r.target,
        label,
        selected: isSelected,
        style: {
          stroke: isSelected ? '#2563EB' : '#64748B',
          strokeWidth: isSelected ? 2.6 : 1.8,
        },
        labelStyle: { fill: '#0F172A', fontWeight: 600, fontSize: 11 },
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
          color: isSelected ? '#2563EB' : '#64748B',
        },
      };
    });
  }, [diagram.relations, selectedRelationId]);

  const nodeIdsKey = useMemo(
    () => diagram.tables.map((t) => t.id).join(','),
    [diagram.tables]
  );

  useEffect(() => {
    if (yamlMode) return;
    const inst = rfInstanceRef.current;
    if (!inst) return;
    const raf = requestAnimationFrame(() => inst.fitView(fitViewOptions));
    return () => cancelAnimationFrame(raf);
  }, [nodeIdsKey, yamlMode, fitViewOptions]);

  const handleNodesChange = useCallback(
    (changes: NodeChange<Node<ArchDbTableData>>[]) => {
      // React Flow applique tous les changements sur son propre état (drag fluide, mesures).
      onRfNodesChange(changes);

      // On ne remonte au document qu'en fin de déplacement.
      const positionCommit = changes.some(
        (c) => c.type === 'position' && c.dragging !== true
      );
      if (!positionCommit) return;

      const updatedRf = applyNodeChanges(changes, rfNodes);
      const posMap = new Map<string, { x: number; y: number }>();
      for (const item of updatedRf) {
        posMap.set(item.id, item.position);
      }
      let moved = false;
      const nextTables = diagram.tables.map((t) => {
        const nextPos = posMap.get(t.id);
        if (
          nextPos &&
          (Math.round(nextPos.x) !== Math.round(t.position.x) ||
            Math.round(nextPos.y) !== Math.round(t.position.y))
        ) {
          moved = true;
          return { ...t, position: { x: Math.round(nextPos.x), y: Math.round(nextPos.y) } };
        }
        return t;
      });
      if (moved) {
        onChange({ ...diagram, tables: nextTables });
      }
    },
    [onRfNodesChange, rfNodes, diagram, onChange]
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const srcTable = diagram.tables.find((t) => t.id === connection.source);
      // Devine la colonne FK la plus probable côté source
      const fkCol =
        srcTable?.columns.find((c) => c.fk)?.name ||
        srcTable?.columns.find((c) => c.name.endsWith('_id') && !c.pk)?.name;
      const tgtTable = diagram.tables.find((t) => t.id === connection.target);
      const pkCol = tgtTable?.columns.find((c) => c.pk)?.name;
      const newRel: ArchDbRelation = {
        id: `rel-${Date.now().toString().slice(-5)}`,
        source: connection.source,
        target: connection.target,
        sourceColumn: fkCol,
        targetColumn: pkCol,
        cardinality: 'many-to-one',
      };
      onChange({ ...diagram, relations: [...diagram.relations, newRel] });
      setSelectedRelationId(newRel.id);
      setSelectedTableId(null);
    },
    [diagram, onChange]
  );

  const addTable = useCallback(() => {
    const count = diagram.tables.length;
    const newTable: ArchDbTable = {
      id: `table-${Date.now().toString().slice(-5)}`,
      name: `nouvelle_table_${count + 1}`,
      schema: 'public',
      color: DEFAULT_TABLE_COLOR,
      position: { x: 80 + (count % 3) * 320, y: 80 + Math.floor(count / 3) * 300 },
      columns: [{ name: 'id', type: 'UUID', pk: true }],
    };
    onChange({ ...diagram, tables: [...diagram.tables, newTable] });
    setSelectedTableId(newTable.id);
    setSelectedRelationId(null);
  }, [diagram, onChange]);

  const handleAutoLayout = useCallback(() => {
    onChange(autoLayoutDbDiagram(diagram, { direction: 'LR' }));
  }, [diagram, onChange]);

  const selectedTable = useMemo(
    () => diagram.tables.find((t) => t.id === selectedTableId) || null,
    [diagram.tables, selectedTableId]
  );

  const selectedRelation = useMemo(
    () => diagram.relations.find((r) => r.id === selectedRelationId) || null,
    [diagram.relations, selectedRelationId]
  );

  const updateSelectedTable = (patch: Partial<ArchDbTable>) => {
    if (!selectedTable) return;
    onChange({
      ...diagram,
      tables: diagram.tables.map((t) =>
        t.id === selectedTable.id ? { ...t, ...patch } : t
      ),
    });
  };

  const updateColumn = (index: number, patch: Partial<ArchDbColumn>) => {
    if (!selectedTable) return;
    const cols = selectedTable.columns.map((c, i) => (i === index ? { ...c, ...patch } : c));
    updateSelectedTable({ columns: cols });
  };

  const addColumn = () => {
    if (!selectedTable) return;
    updateSelectedTable({
      columns: [...selectedTable.columns, { name: `colonne_${selectedTable.columns.length + 1}` }],
    });
  };

  const removeColumn = (index: number) => {
    if (!selectedTable) return;
    updateSelectedTable({ columns: selectedTable.columns.filter((_, i) => i !== index) });
  };

  const moveColumn = (index: number, dir: -1 | 1) => {
    if (!selectedTable) return;
    const target = index + dir;
    if (target < 0 || target >= selectedTable.columns.length) return;
    const cols = [...selectedTable.columns];
    const [removed] = cols.splice(index, 1);
    cols.splice(target, 0, removed);
    updateSelectedTable({ columns: cols });
  };

  const updateSelectedRelation = (patch: Partial<ArchDbRelation>) => {
    if (!selectedRelation) return;
    onChange({
      ...diagram,
      relations: diagram.relations.map((r) =>
        r.id === selectedRelation.id ? { ...r, ...patch } : r
      ),
    });
  };

  const deleteSelected = () => {
    if (selectedTableId) {
      onChange({
        ...diagram,
        tables: diagram.tables.filter((t) => t.id !== selectedTableId),
        relations: diagram.relations.filter(
          (r) => r.source !== selectedTableId && r.target !== selectedTableId
        ),
      });
      setSelectedTableId(null);
    } else if (selectedRelationId) {
      onChange({
        ...diagram,
        relations: diagram.relations.filter((r) => r.id !== selectedRelationId),
      });
      setSelectedRelationId(null);
    }
  };

  const targetTableForRelation = selectedRelation
    ? diagram.tables.find((t) => t.id === selectedRelation.target)
    : null;
  const sourceTableForRelation = selectedRelation
    ? diagram.tables.find((t) => t.id === selectedRelation.source)
    : null;

  return (
    <div className={`arch-diagram-card${fullscreen ? ' fullscreen' : ''}`}>
      <div className="arch-diagram-header">
        <div className="arch-diagram-header-left">
          <span className="arch-diagram-type-badge db">SCHÉMA DE BASE DE DONNÉES</span>
          <input
            type="text"
            className="arch-diagram-title-input"
            value={diagram.title || ''}
            onChange={(e) => onChange({ ...diagram, title: e.target.value })}
            placeholder="Titre du schéma de base de données..."
          />
        </div>

        <div className="arch-diagram-header-actions no-print">
          <button type="button" className="arch-btn-secondary" onClick={addTable}>
            <Plus size={14} />
            <span>Table</span>
          </button>
          <button
            type="button"
            className="arch-btn-secondary"
            onClick={handleAutoLayout}
            title="Réorganiser automatiquement les tables (Dagre Auto-Layout)"
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
          <FullscreenButton
            fullscreen={fullscreen}
            onToggle={() => setFullscreen((v) => !v)}
          />
          <button
            type="button"
            className="arch-btn-icon danger"
            onClick={onDeleteBlock}
            title="Supprimer ce schéma du document"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {yamlMode ? (
        <div className="arch-yaml-editor-pane no-print">
          <textarea
            className="arch-yaml-textarea"
            value={rawYamlText}
            onChange={(e) => {
              const nextYaml = e.target.value;
              setRawYamlText(nextYaml);
              const { diagram: parsed, error } = parseDbYaml(nextYaml);
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
          <div className="arch-rf-canvas-wrapper">
            <ReactFlow
              nodes={rfNodes}
              edges={rfEdges}
              nodeTypes={nodeTypes}
              onInit={(inst) => {
                rfInstanceRef.current = inst;
                inst.fitView(fitViewOptions);
              }}
              onNodesChange={handleNodesChange}
              onConnect={handleConnect}
              onNodeClick={(_e, node) => {
                setSelectedTableId(node.id);
                setSelectedRelationId(null);
              }}
              onEdgeClick={(_e, edge) => {
                setSelectedRelationId(edge.id);
                setSelectedTableId(null);
              }}
              onPaneClick={() => {
                setSelectedTableId(null);
                setSelectedRelationId(null);
              }}
              fitView
              fitViewOptions={fitViewOptions}
              minZoom={0.1}
              maxZoom={2}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={18} size={1} color="#CBD5E1" />
              <Controls className="no-print" />
              <MiniMap
                className="no-print"
                nodeColor={(n) => {
                  const data = n.data as ArchDbTableData | undefined;
                  return data?.table?.color || DEFAULT_TABLE_COLOR;
                }}
              />
            </ReactFlow>
          </div>

          {(selectedTable || selectedRelation) && (
            <aside className="arch-inspector-sidebar no-print">
              <div className="arch-inspector-header">
                <div className="arch-inspector-title">
                  <SlidersHorizontal size={14} />
                  <span>{selectedTable ? 'Table' : 'Relation'}</span>
                </div>
                <button
                  type="button"
                  className="arch-btn-icon danger"
                  onClick={deleteSelected}
                  title="Supprimer l'élément sélectionné"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {selectedTable && (
                <div className="arch-inspector-body">
                  <div className="arch-field-row">
                    <div>
                      <label className="arch-field-label">Schéma</label>
                      <input
                        type="text"
                        className="arch-field-input"
                        placeholder="public"
                        value={selectedTable.schema || ''}
                        onChange={(e) =>
                          updateSelectedTable({ schema: e.target.value || undefined })
                        }
                      />
                    </div>
                    <div>
                      <label className="arch-field-label">Couleur</label>
                      <input
                        type="color"
                        className="arch-field-input arch-field-color"
                        value={selectedTable.color || DEFAULT_TABLE_COLOR}
                        onChange={(e) => updateSelectedTable({ color: e.target.value })}
                      />
                    </div>
                  </div>

                  <label className="arch-field-label">Nom de la table</label>
                  <input
                    type="text"
                    className="arch-field-input"
                    value={selectedTable.name}
                    onChange={(e) => updateSelectedTable({ name: e.target.value })}
                  />

                  <div className="arch-inspector-section-title">Colonnes</div>
                  <div className="arch-db-cols-editor">
                    {selectedTable.columns.map((col, idx) => (
                      <div key={idx} className="arch-db-col-editor">
                        <div className="arch-db-col-editor-row">
                          <input
                            type="text"
                            className="arch-field-input"
                            placeholder="nom"
                            value={col.name}
                            onChange={(e) => updateColumn(idx, { name: e.target.value })}
                          />
                          <input
                            type="text"
                            className="arch-field-input"
                            placeholder="type (UUID, INT...)"
                            value={col.type || ''}
                            onChange={(e) =>
                              updateColumn(idx, { type: e.target.value || undefined })
                            }
                          />
                          <button
                            type="button"
                            className="arch-btn-icon"
                            onClick={() => moveColumn(idx, -1)}
                            title="Monter"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="arch-btn-icon"
                            onClick={() => moveColumn(idx, 1)}
                            title="Descendre"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="arch-btn-icon danger"
                            onClick={() => removeColumn(idx)}
                            title="Supprimer la colonne"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                        <div className="arch-db-col-flags">
                          <label>
                            <input
                              type="checkbox"
                              checked={Boolean(col.pk)}
                              onChange={(e) => updateColumn(idx, { pk: e.target.checked })}
                            />
                            PK
                          </label>
                          <label>
                            <input
                              type="checkbox"
                              checked={Boolean(col.fk)}
                              onChange={(e) => updateColumn(idx, { fk: e.target.checked })}
                            />
                            FK
                          </label>
                          <label>
                            <input
                              type="checkbox"
                              checked={Boolean(col.unique)}
                              onChange={(e) => updateColumn(idx, { unique: e.target.checked })}
                            />
                            Unique
                          </label>
                          <label>
                            <input
                              type="checkbox"
                              checked={Boolean(col.nullable)}
                              onChange={(e) =>
                                updateColumn(idx, { nullable: e.target.checked })
                              }
                            />
                            Null
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button type="button" className="arch-btn-primary-sm" onClick={addColumn}>
                    + Colonne
                  </button>
                </div>
              )}

              {selectedRelation && (
                <div className="arch-inspector-body">
                  <label className="arch-field-label">
                    Table source (porte la clé étrangère)
                  </label>
                  <select
                    className="arch-field-input"
                    value={selectedRelation.source}
                    onChange={(e) => updateSelectedRelation({ source: e.target.value })}
                  >
                    {diagram.tables.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>

                  <label className="arch-field-label">Colonne source (FK)</label>
                  <select
                    className="arch-field-input"
                    value={selectedRelation.sourceColumn || ''}
                    onChange={(e) =>
                      updateSelectedRelation({ sourceColumn: e.target.value || undefined })
                    }
                  >
                    <option value="">(non précisée)</option>
                    {sourceTableForRelation?.columns.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>

                  <label className="arch-field-label">Table cible (référencée)</label>
                  <select
                    className="arch-field-input"
                    value={selectedRelation.target}
                    onChange={(e) => updateSelectedRelation({ target: e.target.value })}
                  >
                    {diagram.tables.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>

                  <label className="arch-field-label">Colonne cible (PK)</label>
                  <select
                    className="arch-field-input"
                    value={selectedRelation.targetColumn || ''}
                    onChange={(e) =>
                      updateSelectedRelation({ targetColumn: e.target.value || undefined })
                    }
                  >
                    <option value="">(non précisée)</option>
                    {targetTableForRelation?.columns.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>

                  <label className="arch-field-label">Cardinalité</label>
                  <select
                    className="arch-field-input"
                    value={selectedRelation.cardinality || 'one-to-many'}
                    onChange={(e) =>
                      updateSelectedRelation({
                        cardinality: e.target.value as ArchDbCardinality,
                      })
                    }
                  >
                    <option value="one-to-one">Un à un (1 — 1)</option>
                    <option value="one-to-many">Un à plusieurs (1 — N)</option>
                    <option value="many-to-one">Plusieurs à un (N — 1)</option>
                    <option value="many-to-many">Plusieurs à plusieurs (N — N)</option>
                  </select>

                  <label className="arch-field-label">Libellé</label>
                  <input
                    type="text"
                    className="arch-field-input"
                    placeholder="Ex: passe, contient..."
                    value={selectedRelation.label || ''}
                    onChange={(e) =>
                      updateSelectedRelation({ label: e.target.value || undefined })
                    }
                  />
                </div>
              )}
            </aside>
          )}
        </div>
      )}
    </div>
  );
};
