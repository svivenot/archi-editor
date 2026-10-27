import React, { useEffect, useMemo, useState } from 'react';
import {
  ArchSeqBlockKind,
  ArchSeqDiagram,
  ArchSeqItem,
  ArchSeqMessageKind,
  ArchSeqParticipant,
  ComponentDefinition,
  ComponentLibrary,
} from '@shared/archTypes';
import { parseSeqYaml, serializeSeqYaml } from '@shared/documentParser';
import { ArchSymbol } from '../../symbols/ArchSymbolRegistry';
import { useFullscreen, FullscreenButton } from '../fullscreen';
import {
  Plus,
  Code2,
  Trash2,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  MessageSquarePlus,
  UserPlus,
  Layers,
  StickyNote,
} from 'lucide-react';

interface ArchSeqEditorProps {
  diagram: ArchSeqDiagram;
  library: ComponentLibrary;
  onChange: (updated: ArchSeqDiagram) => void;
  onDeleteBlock: () => void;
}

export const ArchSeqEditor: React.FC<ArchSeqEditorProps> = ({
  diagram,
  library,
  onChange,
  onDeleteBlock,
}) => {
  const [fullscreen, setFullscreen] = useFullscreen();
  const [selectedParticipantId, setSelectedParticipantId] = useState<
    string | null
  >(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [yamlMode, setYamlMode] = useState(false);
  const [rawYamlText, setRawYamlText] = useState(() =>
    serializeSeqYaml(diagram)
  );
  const [yamlError, setYamlError] = useState<string | undefined>();

  useEffect(() => {
    setRawYamlText(serializeSeqYaml(diagram));
  }, [diagram]);

  const componentMap = useMemo(() => {
    const map = new Map<string, ComponentDefinition>();
    for (const c of library.components) {
      map.set(c.id, c);
    }
    return map;
  }, [library]);

  const resolveComp = (ref?: string): ComponentDefinition => {
    if (ref && componentMap.has(ref)) {
      return componentMap.get(ref)!;
    }
    return {
      id: ref || 'microservice',
      name: ref || 'Service',
      category: 'generic',
      symbol: ref || 'microservice',
      color: '#3B82F6',
      shape: 'rounded-rect',
    };
  };

  // Layout geometry constants
  const COL_WIDTH = 175;
  const LEFT_PAD = 110;
  const HEADER_Y = 24;
  const HEADER_H = 74;
  const STEP_START_Y = HEADER_Y + HEADER_H + 38;
  const STEP_H = 58;

  const participants = diagram.participants;
  const items = diagram.items;

  const svgWidth = Math.max(
    680,
    LEFT_PAD * 2 + Math.max(0, participants.length - 1) * COL_WIDTH
  );
  const svgHeight = Math.max(
    280,
    STEP_START_Y + items.length * STEP_H + 80
  );

  const getParticipantX = (id?: string): number => {
    const idx = participants.findIndex((p) => p.id === id);
    if (idx === -1) return LEFT_PAD;
    return LEFT_PAD + idx * COL_WIDTH;
  };

  // Actions sur les participants
  const handleAddParticipant = () => {
    const idx = participants.length + 1;
    const nextP: ArchSeqParticipant = {
      id: `actor-${Date.now().toString().slice(-4)}`,
      label: `Service ${idx}`,
      componentRef: 'microservice',
    };
    onChange({
      ...diagram,
      participants: [...participants, nextP],
    });
    setSelectedParticipantId(nextP.id);
    setSelectedItemId(null);
  };

  const handleMoveParticipant = (id: string, dir: -1 | 1) => {
    const idx = participants.findIndex((p) => p.id === id);
    if (idx === -1) return;
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= participants.length) return;
    const next = [...participants];
    const [removed] = next.splice(idx, 1);
    next.splice(targetIdx, 0, removed);
    onChange({ ...diagram, participants: next });
  };

  const handleDeleteParticipant = (id: string) => {
    onChange({
      ...diagram,
      participants: participants.filter((p) => p.id !== id),
      items: items.filter(
        (it) =>
          it.from !== id && it.to !== id && it.participantId !== id
      ),
    });
    setSelectedParticipantId(null);
  };

  // Actions sur les étapes (messages, blocs, notes)
  const handleAddMessage = () => {
    const fromId = participants[0]?.id || 'a1';
    const toId = participants[1]?.id || fromId;
    const nextMsg: ArchSeqItem = {
      id: `msg-${Date.now().toString().slice(-4)}`,
      type: 'message',
      from: fromId,
      to: toId,
      label: 'Nouvel appel',
      protocol: 'HTTPS',
      kind: 'sync',
    };
    onChange({
      ...diagram,
      items: [...items, nextMsg],
    });
    setSelectedItemId(nextMsg.id);
    setSelectedParticipantId(null);
  };

  const handleAddBlock = () => {
    const nextBlock: ArchSeqItem = {
      id: `blk-${Date.now().toString().slice(-4)}`,
      type: 'block',
      blockKind: 'alt',
      label: 'Condition / Cas nominal',
    };
    onChange({
      ...diagram,
      items: [...items, nextBlock],
    });
    setSelectedItemId(nextBlock.id);
    setSelectedParticipantId(null);
  };

  const handleAddNote = () => {
    const pId = participants[0]?.id;
    const nextNote: ArchSeqItem = {
      id: `note-${Date.now().toString().slice(-4)}`,
      type: 'note',
      participantId: pId,
      label: 'Note architecturale',
    };
    onChange({
      ...diagram,
      items: [...items, nextNote],
    });
    setSelectedItemId(nextNote.id);
    setSelectedParticipantId(null);
  };

  const handleMoveItem = (id: string, dir: -1 | 1) => {
    const idx = items.findIndex((i) => i.id === id);
    if (idx === -1) return;
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= items.length) return;
    const next = [...items];
    const [removed] = next.splice(idx, 1);
    next.splice(targetIdx, 0, removed);
    onChange({ ...diagram, items: next });
  };

  const handleDeleteItem = (id: string) => {
    onChange({
      ...diagram,
      items: items.filter((i) => i.id !== id),
    });
    setSelectedItemId(null);
  };

  const selectedParticipant = useMemo(
    () => participants.find((p) => p.id === selectedParticipantId) || null,
    [participants, selectedParticipantId]
  );

  const selectedItem = useMemo(
    () => items.find((i) => i.id === selectedItemId) || null,
    [items, selectedItemId]
  );

  const updateSelectedParticipant = (patch: Partial<ArchSeqParticipant>) => {
    if (!selectedParticipant) return;
    onChange({
      ...diagram,
      participants: participants.map((p) =>
        p.id === selectedParticipant.id ? { ...p, ...patch } : p
      ),
    });
  };

  const updateSelectedItem = (patch: Partial<ArchSeqItem>) => {
    if (!selectedItem) return;
    onChange({
      ...diagram,
      items: items.map((i) =>
        i.id === selectedItem.id ? { ...i, ...patch } : i
      ),
    });
  };

  let msgStepCounter = 0;

  return (
    <div className={`arch-diagram-card${fullscreen ? ' fullscreen' : ''}`}>
      {/* Barre d'en-tête */}
      <div className="arch-diagram-header">
        <div className="arch-diagram-header-left">
          <span className="arch-diagram-type-badge seq">
            DIAGRAMME DE SÉQUENCE
          </span>
          <input
            type="text"
            className="arch-diagram-title-input"
            value={diagram.title || ''}
            onChange={(e) => onChange({ ...diagram, title: e.target.value })}
            placeholder="Titre du diagramme de séquence..."
          />
        </div>

        <div className="arch-diagram-header-actions no-print">
          <button
            type="button"
            className="arch-btn-secondary"
            onClick={handleAddParticipant}
          >
            <UserPlus size={14} />
            <span>+ Participant</span>
          </button>
          <button
            type="button"
            className="arch-btn-secondary"
            onClick={handleAddMessage}
            disabled={participants.length === 0}
          >
            <MessageSquarePlus size={14} />
            <span>+ Message</span>
          </button>
          <button
            type="button"
            className="arch-btn-secondary"
            onClick={handleAddBlock}
          >
            <Layers size={14} />
            <span>+ Bloc (alt/loop/par)</span>
          </button>
          <button
            type="button"
            className="arch-btn-secondary"
            onClick={handleAddNote}
            disabled={participants.length === 0}
          >
            <StickyNote size={14} />
            <span>+ Note</span>
          </button>
          <button
            type="button"
            className={`arch-btn-secondary ${yamlMode ? 'active' : ''}`}
            onClick={() => setYamlMode((v) => !v)}
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
            title="Supprimer ce diagramme de séquence"
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
              const next = e.target.value;
              setRawYamlText(next);
              const { diagram: parsed, error } = parseSeqYaml(next);
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
        <div className="arch-seq-workspace">
          {/* Canevas SVG du diagramme de séquence */}
          <div className="arch-seq-canvas-scroll">
            <svg
              width={svgWidth}
              height={svgHeight}
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="arch-seq-svg"
            >
              <defs>
                <marker
                  id="seq-arrow-sync"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#1E293B" />
                </marker>
                <marker
                  id="seq-arrow-selected"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#2563EB" />
                </marker>
                <marker
                  id="seq-arrow-open"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path
                    d="M 1 1 L 9 5 L 1 9"
                    fill="none"
                    stroke="#334155"
                    strokeWidth="1.8"
                  />
                </marker>
              </defs>

              {/* Lignes de vie verticales (Lifelines) */}
              {participants.map((p, idx) => {
                const cx = LEFT_PAD + idx * COL_WIDTH;
                const comp = resolveComp(p.componentRef);
                const isSel = p.id === selectedParticipantId;

                return (
                  <g key={p.id}>
                    <line
                      x1={cx}
                      y1={HEADER_Y + HEADER_H}
                      x2={cx}
                      y2={svgHeight - 44}
                      stroke={isSel ? '#2563EB' : '#94A3B8'}
                      strokeWidth={isSel ? 2 : 1.5}
                      strokeDasharray="6 5"
                    />
                    {/* Boîte d'en-tête du participant */}
                    <g
                      className="arch-seq-participant-node"
                      onClick={() => {
                        setSelectedParticipantId(p.id);
                        setSelectedItemId(null);
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <rect
                        x={cx - 72}
                        y={HEADER_Y}
                        width={144}
                        height={HEADER_H}
                        rx={10}
                        fill="#FFFFFF"
                        stroke={isSel ? '#2563EB' : comp.color}
                        strokeWidth={isSel ? 2.5 : 1.8}
                      />
                      <rect
                        x={cx - 72}
                        y={HEADER_Y}
                        width={144}
                        height={6}
                        rx={3}
                        fill={comp.color}
                      />
                      <foreignObject
                        x={cx - 68}
                        y={HEADER_Y + 10}
                        width={136}
                        height={HEADER_H - 14}
                      >
                        <div className="arch-seq-p-card-inner">
                          <ArchSymbol
                            symbol={comp.symbol}
                            color={comp.color}
                            size={24}
                          />
                          <div className="arch-seq-p-texts">
                            <div className="arch-seq-p-label">{p.label}</div>
                            <div
                              className="arch-seq-p-type"
                              style={{ color: comp.color }}
                            >
                              {comp.name}
                            </div>
                          </div>
                        </div>
                      </foreignObject>
                    </g>

                    {/* Répétition compacte en pied de ligne de vie */}
                    <rect
                      x={cx - 56}
                      y={svgHeight - 44}
                      width={112}
                      height={26}
                      rx={6}
                      fill="#F8FAFC"
                      stroke="#CBD5E1"
                      strokeWidth={1.2}
                    />
                    <text
                      x={cx}
                      y={svgHeight - 27}
                      textAnchor="middle"
                      fill="#334155"
                      fontSize="11"
                      fontWeight="600"
                    >
                      {p.label}
                    </text>
                  </g>
                );
              })}

              {/* Étapes (Messages, Blocs logiques, Notes) */}
              {items.map((item, idx) => {
                const y = STEP_START_Y + idx * STEP_H;
                const isSelected = item.id === selectedItemId;

                if (item.type === 'block') {
                  const x1 = Math.max(24, LEFT_PAD - 76);
                  const x2 = svgWidth - 24;
                  const bw = x2 - x1;
                  const kindTag = (item.blockKind || 'alt').toUpperCase();
                  return (
                    <g
                      key={item.id}
                      onClick={() => {
                        setSelectedItemId(item.id);
                        setSelectedParticipantId(null);
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <rect
                        x={x1}
                        y={y - 20}
                        width={bw}
                        height={42}
                        rx={6}
                        fill="#EFF6FF"
                        fillOpacity="0.65"
                        stroke={isSelected ? '#2563EB' : '#64748B'}
                        strokeWidth={isSelected ? 2 : 1.4}
                        strokeDasharray="5 3"
                      />
                      <polygon
                        points={`${x1},${y - 20} ${x1 + 52},${y - 20} ${
                          x1 + 52
                        },${y - 4} ${x1 + 42},${y + 2} ${x1},${y + 2}`}
                        fill="#1E40AF"
                      />
                      <text
                        x={x1 + 24}
                        y={y - 6}
                        textAnchor="middle"
                        fill="#FFFFFF"
                        fontSize="10"
                        fontWeight="bold"
                      >
                        {kindTag}
                      </text>
                      <text
                        x={x1 + 66}
                        y={y + 4}
                        fill="#1E293B"
                        fontSize="12"
                        fontWeight="600"
                      >
                        [{item.label}]
                      </text>
                    </g>
                  );
                }

                if (item.type === 'note') {
                  const cx = getParticipantX(item.participantId);
                  return (
                    <g
                      key={item.id}
                      onClick={() => {
                        setSelectedItemId(item.id);
                        setSelectedParticipantId(null);
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <rect
                        x={cx - 85}
                        y={y - 18}
                        width={170}
                        height={36}
                        rx={5}
                        fill="#FEF9C3"
                        stroke={isSelected ? '#2563EB' : '#CA8A04'}
                        strokeWidth={isSelected ? 2.2 : 1.4}
                      />
                      <text
                        x={cx}
                        y={y + 4}
                        textAnchor="middle"
                        fill="#713F12"
                        fontSize="11.5"
                        fontWeight="600"
                      >
                        {item.label}
                      </text>
                    </g>
                  );
                }

                // Message
                msgStepCounter += 1;
                const stepNum = msgStepCounter;
                const xFrom = getParticipantX(item.from);
                const xTo = getParticipantX(item.to);
                const isSelf = item.from === item.to || item.kind === 'self';
                const isDashed =
                  item.kind === 'reply' || item.kind === 'async';
                const strokeColor = isSelected ? '#2563EB' : '#1E293B';
                const markerEnd = isSelected
                  ? 'url(#seq-arrow-selected)'
                  : item.kind === 'reply' || item.kind === 'async'
                  ? 'url(#seq-arrow-open)'
                  : 'url(#seq-arrow-sync)';

                const fullText = [
                  item.label,
                  item.protocol ? `(${item.protocol})` : '',
                ]
                  .filter(Boolean)
                  .join(' ');

                if (isSelf) {
                  return (
                    <g
                      key={item.id}
                      onClick={() => {
                        setSelectedItemId(item.id);
                        setSelectedParticipantId(null);
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <path
                        d={`M ${xFrom} ${y - 6} H ${xFrom + 46} V ${
                          y + 16
                        } H ${xFrom + 4}`}
                        fill="none"
                        stroke={strokeColor}
                        strokeWidth={isSelected ? 2.4 : 1.8}
                        strokeDasharray={isDashed ? '5 3' : undefined}
                        markerEnd={markerEnd}
                      />
                      <circle
                        cx={xFrom}
                        cy={y - 6}
                        r={9}
                        fill={isSelected ? '#2563EB' : '#334155'}
                      />
                      <text
                        x={xFrom}
                        y={y - 2.5}
                        textAnchor="middle"
                        fill="#FFFFFF"
                        fontSize="9.5"
                        fontWeight="bold"
                      >
                        {stepNum}
                      </text>
                      <text
                        x={xFrom + 54}
                        y={y + 8}
                        fill={strokeColor}
                        fontSize="11.5"
                        fontWeight="600"
                      >
                        {fullText}
                      </text>
                    </g>
                  );
                }

                const midX = (xFrom + xTo) / 2;

                return (
                  <g
                    key={item.id}
                    onClick={() => {
                      setSelectedItemId(item.id);
                      setSelectedParticipantId(null);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    {/* Zone de clic élargie */}
                    <line
                      x1={xFrom}
                      y1={y + 6}
                      x2={xTo}
                      y2={y + 6}
                      stroke="transparent"
                      strokeWidth={18}
                    />
                    <line
                      x1={xFrom}
                      y1={y + 6}
                      x2={xTo}
                      y2={y + 6}
                      stroke={strokeColor}
                      strokeWidth={isSelected ? 2.5 : 1.9}
                      strokeDasharray={isDashed ? '6 4' : undefined}
                      markerEnd={markerEnd}
                    />
                    {/* Fond du label */}
                    <rect
                      x={midX - Math.min(130, fullText.length * 3.6 + 18)}
                      y={y - 16}
                      width={Math.min(260, fullText.length * 7.2 + 36)}
                      height={18}
                      rx={4}
                      fill="#FFFFFF"
                      fillOpacity="0.92"
                    />
                    <text
                      x={midX}
                      y={y - 3}
                      textAnchor="middle"
                      fill={strokeColor}
                      fontSize="11.5"
                      fontWeight="600"
                    >
                      {stepNum}. {fullText}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Panneau d'inspection / édition de l'élément sélectionné */}
          {(selectedParticipant || selectedItem) && (
            <aside className="arch-inspector-sidebar no-print">
              {selectedParticipant && (
                <>
                  <div className="arch-inspector-header">
                    <span className="arch-inspector-title">
                      Participant : {selectedParticipant.label}
                    </span>
                    <div className="arch-inspector-btn-group">
                      <button
                        type="button"
                        className="arch-btn-icon"
                        onClick={() =>
                          handleMoveParticipant(selectedParticipant.id, -1)
                        }
                        title="Déplacer à gauche"
                      >
                        <ArrowLeft size={14} />
                      </button>
                      <button
                        type="button"
                        className="arch-btn-icon"
                        onClick={() =>
                          handleMoveParticipant(selectedParticipant.id, 1)
                        }
                        title="Déplacer à droite"
                      >
                        <ArrowRight size={14} />
                      </button>
                      <button
                        type="button"
                        className="arch-btn-icon danger"
                        onClick={() =>
                          handleDeleteParticipant(selectedParticipant.id)
                        }
                        title="Supprimer ce participant"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="arch-inspector-body">
                    <label className="arch-field-label">Nom du participant</label>
                    <input
                      type="text"
                      className="arch-field-input"
                      value={selectedParticipant.label}
                      onChange={(e) =>
                        updateSelectedParticipant({ label: e.target.value })
                      }
                    />
                    <label className="arch-field-label">
                      Symbole (Bibliothèque de composants)
                    </label>
                    <select
                      className="arch-field-input"
                      value={selectedParticipant.componentRef || 'microservice'}
                      onChange={(e) =>
                        updateSelectedParticipant({
                          componentRef: e.target.value,
                        })
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
                  </div>
                </>
              )}

              {selectedItem && (
                <>
                  <div className="arch-inspector-header">
                    <span className="arch-inspector-title">
                      Étape :{' '}
                      {selectedItem.type === 'message'
                        ? 'Message'
                        : selectedItem.type === 'block'
                        ? 'Bloc Logique'
                        : 'Note'}
                    </span>
                    <div className="arch-inspector-btn-group">
                      <button
                        type="button"
                        className="arch-btn-icon"
                        onClick={() => handleMoveItem(selectedItem.id, -1)}
                        title="Monter l'étape"
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        type="button"
                        className="arch-btn-icon"
                        onClick={() => handleMoveItem(selectedItem.id, 1)}
                        title="Descendre l'étape"
                      >
                        <ArrowDown size={14} />
                      </button>
                      <button
                        type="button"
                        className="arch-btn-icon danger"
                        onClick={() => handleDeleteItem(selectedItem.id)}
                        title="Supprimer cette étape"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="arch-inspector-body">
                    {selectedItem.type === 'message' && (
                      <>
                        <label className="arch-field-label">Émetteur (De)</label>
                        <select
                          className="arch-field-input"
                          value={selectedItem.from || ''}
                          onChange={(e) =>
                            updateSelectedItem({ from: e.target.value })
                          }
                        >
                          {participants.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.label}
                            </option>
                          ))}
                        </select>

                        <label className="arch-field-label">
                          Destinataire (Vers)
                        </label>
                        <select
                          className="arch-field-input"
                          value={selectedItem.to || ''}
                          onChange={(e) =>
                            updateSelectedItem({ to: e.target.value })
                          }
                        >
                          {participants.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.label}
                            </option>
                          ))}
                        </select>

                        <label className="arch-field-label">
                          Message / Action
                        </label>
                        <input
                          type="text"
                          className="arch-field-input"
                          value={selectedItem.label}
                          onChange={(e) =>
                            updateSelectedItem({ label: e.target.value })
                          }
                        />

                        <label className="arch-field-label">Protocole</label>
                        <input
                          type="text"
                          className="arch-field-input"
                          placeholder="HTTPS, OIDC, AMQP, SQL..."
                          value={selectedItem.protocol || ''}
                          onChange={(e) =>
                            updateSelectedItem({
                              protocol: e.target.value || undefined,
                            })
                          }
                        />

                        <label className="arch-field-label">
                          Type de flèche
                        </label>
                        <select
                          className="arch-field-input"
                          value={selectedItem.kind || 'sync'}
                          onChange={(e) =>
                            updateSelectedItem({
                              kind: e.target.value as ArchSeqMessageKind,
                            })
                          }
                        >
                          <option value="sync">Appel Synchrone (Continu)</option>
                          <option value="async">
                            Message Asynchrone / Event (Pointillé)
                          </option>
                          <option value="reply">Réponse / Retour</option>
                          <option value="self">Auto-appel (Self-Call)</option>
                        </select>
                      </>
                    )}

                    {selectedItem.type === 'block' && (
                      <>
                        <label className="arch-field-label">
                          Type de fragment UML
                        </label>
                        <select
                          className="arch-field-input"
                          value={selectedItem.blockKind || 'alt'}
                          onChange={(e) =>
                            updateSelectedItem({
                              blockKind: e.target.value as ArchSeqBlockKind,
                            })
                          }
                        >
                          <option value="alt">ALT (Alternative / Condition)</option>
                          <option value="opt">OPT (Optionnel)</option>
                          <option value="loop">LOOP (Boucle)</option>
                          <option value="par">PAR (Parallèle)</option>
                        </select>

                        <label className="arch-field-label">
                          Condition / Description
                        </label>
                        <input
                          type="text"
                          className="arch-field-input"
                          value={selectedItem.label}
                          onChange={(e) =>
                            updateSelectedItem({ label: e.target.value })
                          }
                        />
                      </>
                    )}

                    {selectedItem.type === 'note' && (
                      <>
                        <label className="arch-field-label">
                          Participant associé
                        </label>
                        <select
                          className="arch-field-input"
                          value={selectedItem.participantId || ''}
                          onChange={(e) =>
                            updateSelectedItem({
                              participantId: e.target.value,
                            })
                          }
                        >
                          {participants.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.label}
                            </option>
                          ))}
                        </select>

                        <label className="arch-field-label">
                          Texte de la note
                        </label>
                        <input
                          type="text"
                          className="arch-field-input"
                          value={selectedItem.label}
                          onChange={(e) =>
                            updateSelectedItem({ label: e.target.value })
                          }
                        />
                      </>
                    )}
                  </div>
                </>
              )}
            </aside>
          )}
        </div>
      )}
    </div>
  );
};
