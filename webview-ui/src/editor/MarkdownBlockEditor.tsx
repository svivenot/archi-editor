import React, { useEffect, useMemo, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import { marked } from 'marked';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import {
  Bold,
  Italic,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Table as TableIcon,
  Network,
  GitCommitHorizontal,
  Trash2,
} from 'lucide-react';

interface MarkdownBlockEditorProps {
  markdown: string;
  onChange: (newMarkdown: string) => void;
  onInsertBoxBelow: () => void;
  onInsertSeqBelow: () => void;
  onDeleteBlock?: () => void;
  canDelete?: boolean;
}

export const MarkdownBlockEditor: React.FC<MarkdownBlockEditorProps> = ({
  markdown,
  onChange,
  onInsertBoxBelow,
  onInsertSeqBelow,
  onDeleteBlock,
  canDelete = false,
}) => {
  const turndown = useMemo(() => {
    const td = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
    });
    td.use(gfm);
    return td;
  }, []);

  const lastEmittedMarkdownRef = useRef<string>(markdown);

  const initialHtml = useMemo(() => {
    if (!markdown.trim()) {
      return '<p></p>';
    }
    return marked.parse(markdown, { async: false }) as string;
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
      }),
      Placeholder.configure({
        placeholder:
          'Rédigez votre documentation d’architecture en Markdown WYSIWYG...',
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: initialHtml,
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      const md = turndown.turndown(html).trim();
      lastEmittedMarkdownRef.current = md;
      onChange(md);
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (markdown.trim() !== lastEmittedMarkdownRef.current.trim()) {
      lastEmittedMarkdownRef.current = markdown;
      const nextHtml = markdown.trim()
        ? (marked.parse(markdown, { async: false }) as string)
        : '<p></p>';
      editor.commands.setContent(nextHtml, false);
    }
  }, [markdown, editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className="arch-md-section">
      <div className="arch-md-toolbar no-print">
        <div className="arch-md-toolbar-group">
          <button
            type="button"
            className={`arch-tb-btn ${
              editor.isActive('heading', { level: 1 }) ? 'active' : ''
            }`}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 1 }).run()
            }
            title="Titre 1"
          >
            <Heading1 size={15} />
          </button>
          <button
            type="button"
            className={`arch-tb-btn ${
              editor.isActive('heading', { level: 2 }) ? 'active' : ''
            }`}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
            title="Titre 2"
          >
            <Heading2 size={15} />
          </button>
          <button
            type="button"
            className={`arch-tb-btn ${
              editor.isActive('heading', { level: 3 }) ? 'active' : ''
            }`}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 3 }).run()
            }
            title="Titre 3"
          >
            <Heading3 size={15} />
          </button>
          <span className="arch-tb-sep" />
          <button
            type="button"
            className={`arch-tb-btn ${editor.isActive('bold') ? 'active' : ''}`}
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="Gras"
          >
            <Bold size={15} />
          </button>
          <button
            type="button"
            className={`arch-tb-btn ${
              editor.isActive('italic') ? 'active' : ''
            }`}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="Italique"
          >
            <Italic size={15} />
          </button>
          <button
            type="button"
            className={`arch-tb-btn ${editor.isActive('code') ? 'active' : ''}`}
            onClick={() => editor.chain().focus().toggleCode().run()}
            title="Code inline"
          >
            <Code size={15} />
          </button>
          <span className="arch-tb-sep" />
          <button
            type="button"
            className={`arch-tb-btn ${
              editor.isActive('bulletList') ? 'active' : ''
            }`}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title="Liste à puces"
          >
            <List size={15} />
          </button>
          <button
            type="button"
            className={`arch-tb-btn ${
              editor.isActive('orderedList') ? 'active' : ''
            }`}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            title="Liste numérotée"
          >
            <ListOrdered size={15} />
          </button>
          <button
            type="button"
            className={`arch-tb-btn ${
              editor.isActive('blockquote') ? 'active' : ''
            }`}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            title="Note / Citation"
          >
            <Quote size={15} />
          </button>
          <button
            type="button"
            className="arch-tb-btn"
            onClick={() =>
              editor
                .chain()
                .focus()
                .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                .run()
            }
            title="Insérer un tableau"
          >
            <TableIcon size={15} />
          </button>
        </div>

        <div className="arch-md-toolbar-actions">
          <button
            type="button"
            className="arch-tb-insert-btn"
            onClick={onInsertBoxBelow}
            title="Insérer un diagramme de boîtes connectées en dessous"
          >
            <Network size={14} />
            <span>+ Boîtes Connectées</span>
          </button>
          <button
            type="button"
            className="arch-tb-insert-btn"
            onClick={onInsertSeqBelow}
            title="Insérer un diagramme de séquence en dessous"
          >
            <GitCommitHorizontal size={14} />
            <span>+ Séquence</span>
          </button>
          {canDelete && onDeleteBlock && (
            <button
              type="button"
              className="arch-tb-btn danger"
              onClick={onDeleteBlock}
              title="Supprimer cette section Markdown"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="arch-md-content">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};
