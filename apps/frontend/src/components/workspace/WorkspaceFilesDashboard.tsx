import { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  FolderOpen,
  Eye,
  X,
  Trash2,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  Search,
  ArrowRight,
  UploadCloud,
  Folder,
} from 'lucide-react';
import { useFounderWorkspace, type WorkspaceFile } from '../../context/FounderWorkspaceContext';

/* ── File Type Icon ────────────────────────────────────────────── */

function FileTypeIcon({ type, size = 16 }: { type: WorkspaceFile['type']; size?: number }) {
  const s = size;
  if (type === 'pdf') return <FileText className="text-rose-400" style={{ width: s, height: s }} />;
  if (type === 'excel') return <FileSpreadsheet className="text-emerald-400" style={{ width: s, height: s }} />;
  if (type === 'image') return <ImageIcon className="text-sky-400" style={{ width: s, height: s }} />;
  if (type === 'text') return <FileText className="text-amber-300" style={{ width: s, height: s }} />;
  return <FileText className="text-slate-400" style={{ width: s, height: s }} />;
}

/* ── File Previewer Modal ─────────────────────────────────────── */

function FilePreviewerModal({ file, onClose }: { file: WorkspaceFile; onClose: () => void }) {
  const [pdfPage, setPdfPage] = useState(0);

  const parsedContent = (() => {
    try { return JSON.parse(file.content); } catch { return null; }
  })();

  const renderContent = () => {
    if (file.type === 'image') {
      const src = file.content.startsWith('data:')
        ? file.content
        : 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=1200';
      return (
        <div className="flex-1 flex items-center justify-center p-8 bg-black/40 overflow-auto">
          <img
            src={src}
            alt={file.name}
            className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
          />
        </div>
      );
    }

    if (file.type === 'pdf' && Array.isArray(parsedContent)) {
      type PDFRow = { section: string; title: string; requirement: string; status: string; owner: string };
      const rows = parsedContent as PDFRow[];
      const currentRow = rows[pdfPage] ?? rows[0];

      const statusColor = (s: string) => {
        if (s === 'Compliant') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
        if (s === 'In Progress') return 'text-amber-300 bg-amber-500/10 border-amber-500/20';
        return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
      };

      return (
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Thumbnail sidebar */}
          <div className="ws-files-pdf-sidebar">
            <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3 px-1">Pages</p>
            {rows.map((row, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setPdfPage(idx)}
                className={`ws-files-pdf-thumb ${idx === pdfPage ? 'active' : ''}`}
              >
                <span className="text-[9px] font-mono font-bold">{row.section}</span>
                <span className="text-[10px] font-medium truncate">{row.title}</span>
              </button>
            ))}
          </div>

          {/* Document content */}
          <div className="flex-1 overflow-y-auto p-8">
            <div className="ws-files-pdf-doc max-w-2xl mx-auto">
              <div className="flex items-center gap-3 mb-8">
                <div className="ws-files-pdf-stamp">SOC2</div>
                <div>
                  <h2 className="text-lg font-bold text-white">{file.name.replace('.pdf', '')}</h2>
                  <p className="text-xs text-white/40">Security &amp; Compliance Framework Audit</p>
                </div>
              </div>

              <div className="space-y-5">
                <div className="ws-files-pdf-section-header">
                  <span className="ws-files-pdf-section-badge">{currentRow.section}</span>
                  <h3 className="text-base font-bold text-white">{currentRow.title}</h3>
                </div>

                <div className="ws-files-pdf-field">
                  <label>Control Requirement</label>
                  <p>{currentRow.requirement}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="ws-files-pdf-field">
                    <label>Control Owner</label>
                    <p className="font-medium text-white/80">{currentRow.owner}</p>
                  </div>
                  <div className="ws-files-pdf-field">
                    <label>Compliance Status</label>
                    <span className={`inline-block mt-1 text-xs font-bold px-2.5 py-1 rounded-lg border ${statusColor(currentRow.status)}`}>
                      {currentRow.status}
                    </span>
                  </div>
                </div>

                <div className="ws-files-pdf-evidence-box">
                  <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest mb-2">Evidence Required</p>
                  <ul className="space-y-1.5 text-sm text-white/60">
                    {[
                      { label: 'Policy documentation reviewed', done: currentRow.status === 'Compliant' },
                      { label: 'Control owner verified', done: currentRow.status !== 'Attention Needed' },
                      { label: 'Internal testing completed', done: false },
                    ].map((item, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] ${item.done ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-white/20'}`}>
                          {item.done ? '✓' : '○'}
                        </span>
                        {item.label}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="flex items-center justify-between mt-8 pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setPdfPage(p => Math.max(0, p - 1))}
                  disabled={pdfPage === 0}
                  className="text-xs px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-white/70"
                >← Previous</button>
                <span className="text-xs text-white/30">{pdfPage + 1} / {rows.length}</span>
                <button
                  type="button"
                  onClick={() => setPdfPage(p => Math.min(rows.length - 1, p + 1))}
                  disabled={pdfPage === rows.length - 1}
                  className="text-xs px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-white/70"
                >Next →</button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (file.type === 'excel' && parsedContent && parsedContent.headers) {
      type ExcelData = { headers: string[]; rows: string[][]; summary?: Record<string, string> };
      const { headers, rows, summary } = parsedContent as ExcelData;
      return (
        <div className="flex-1 overflow-auto p-6">
          <div className="ws-files-excel-toolbar mb-4">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-semibold text-white">{file.name}</span>
            </div>
            <span className="text-xs text-white/30">{rows.length} rows × {headers.length} columns</span>
          </div>
          <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
            <table className="ws-files-excel-grid w-full">
              <thead>
                <tr>
                  <th className="ws-files-excel-row-num"></th>
                  {headers.map((h, i) => (
                    <th key={i} className="ws-files-excel-header">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={ri} className="ws-files-excel-row">
                    <td className="ws-files-excel-row-num">{ri + 1}</td>
                    {row.map((cell, ci) => (
                      <td key={ci} className="ws-files-excel-cell">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {summary && (
            <div className="mt-4 grid grid-cols-3 gap-3">
              {Object.entries(summary).map(([k, v]) => (
                <div key={k} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                  <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1">
                    {k.replace(/([A-Z])/g, ' $1').trim()}
                  </p>
                  <p className="text-sm font-semibold text-white">{v}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (file.type === 'text') {
      return (
        <div className="flex-1 overflow-auto p-6">
          <div className="ws-files-text-reader">
            <pre className="text-[13px] leading-relaxed text-white/70 whitespace-pre-wrap font-mono">{file.content}</pre>
          </div>
        </div>
      );
    }

    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-white/30 text-sm">Preview not available for this file type.</p>
      </div>
    );
  };

  return createPortal(
    <div className="ws-files-previewer-backdrop" onClick={onClose}>
      <div className="ws-files-previewer-modal" onClick={e => e.stopPropagation()}>
        {/* Modal header */}
        <div className="ws-files-previewer-header">
          <div className="flex items-center gap-3 min-w-0">
            <FileTypeIcon type={file.type} size={18} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{file.name}</p>
              <p className="text-[11px] text-white/40">
                {file.size} · Uploaded {new Date(file.uploadedAt).toLocaleDateString()}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] transition-all text-white/40 hover:text-white/70 flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {/* Modal content */}
        {renderContent()}
      </div>
    </div>,
    document.body
  );
}

/* ── Workspace Files Dashboard ────────────────────────────────── */

export function WorkspaceFilesDashboard() {
  const { uploadedFiles, deleteUploadedFile, setActiveSidebarTab } = useFounderWorkspace();
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<WorkspaceFile | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Trigger file picker when the dock "File" or "Table" button is clicked
  useEffect(() => {
    const handler = () => fileInputRef.current?.click();
    window.addEventListener('workspace-dock-file', handler);
    return () => window.removeEventListener('workspace-dock-file', handler);
  }, []);

  const folders = useMemo(() => {
    const map = new Map<string, WorkspaceFile[]>();
    uploadedFiles.forEach(f => {
      if (!map.has(f.chatTitle)) map.set(f.chatTitle, []);
      map.get(f.chatTitle)!.push(f);
    });
    return map;
  }, [uploadedFiles]);

  const folderNames = Array.from(folders.keys());

  const filesInFolder = activeFolder
    ? (folders.get(activeFolder) ?? []).filter(f =>
        !searchQuery || f.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  const filteredFolders = searchQuery
    ? folderNames.filter(name =>
        name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (folders.get(name) ?? []).some(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : folderNames;

  const typeLabel = (t: WorkspaceFile['type']) => {
    if (t === 'pdf') return 'PDF Document';
    if (t === 'excel') return 'Spreadsheet';
    if (t === 'image') return 'Image';
    if (t === 'text') return 'Text File';
    return 'File';
  };

  return (
    <div className="ws-files-dashboard h-full flex flex-col min-h-0 overflow-hidden">
      {previewFile && (
        <FilePreviewerModal file={previewFile} onClose={() => setPreviewFile(null)} />
      )}

      {/* Header */}
      <div className="ws-files-header">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {activeFolder ? (
            <>
              <button
                type="button"
                onClick={() => { setActiveFolder(null); setSearchQuery(''); }}
                className="text-[11px] text-white/40 hover:text-white/70 transition-colors flex-shrink-0"
              >
                All Files
              </button>
              <ArrowRight className="w-3 h-3 text-white/20 flex-shrink-0" />
              <span className="text-[11px] font-semibold text-white/80 truncate">{activeFolder}</span>
            </>
          ) : (
            <h2 className="text-sm font-bold text-white">Files Library</h2>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="ws-files-search-box">
            <Search className="w-3 h-3 text-white/30 flex-shrink-0" />
            <input
              type="text"
              placeholder="Search files..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="ws-files-search-input"
            />
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="ws-files-upload-btn"
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>Upload</span>
          </button>
          <input ref={fileInputRef} type="file" className="hidden" onChange={() => {}} multiple />
        </div>
      </div>

      {/* Stats bar */}
      {!activeFolder && (
        <div className="ws-files-stats-bar">
          <div className="ws-files-stat">
            <span className="ws-files-stat-val">{uploadedFiles.length}</span>
            <span className="ws-files-stat-label">Total Files</span>
          </div>
          <div className="ws-files-stat">
            <span className="ws-files-stat-val">{folderNames.length}</span>
            <span className="ws-files-stat-label">Folders</span>
          </div>
          <div className="ws-files-stat">
            <span className="ws-files-stat-val text-rose-400">{uploadedFiles.filter(f => f.type === 'pdf').length}</span>
            <span className="ws-files-stat-label">PDFs</span>
          </div>
          <div className="ws-files-stat">
            <span className="ws-files-stat-val text-emerald-400">{uploadedFiles.filter(f => f.type === 'excel').length}</span>
            <span className="ws-files-stat-label">Spreadsheets</span>
          </div>
          <div className="ws-files-stat">
            <span className="ws-files-stat-val text-amber-300">{uploadedFiles.filter(f => f.type === 'text').length}</span>
            <span className="ws-files-stat-label">Docs</span>
          </div>
        </div>
      )}

      {/* Divider */}
      <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)', margin: '0 16px 12px' }} />

      {/* Main content area */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 pb-4">
        {!activeFolder ? (
          /* ── Folder Grid ── */
          filteredFolders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-16">
              <Folder className="w-12 h-12 text-white/10" />
              <p className="text-sm text-white/30 max-w-xs">
                No files yet. Upload files via the AI Copilot chat or the Upload button above.
              </p>
              <button
                type="button"
                onClick={() => setActiveSidebarTab('canvas')}
                className="text-xs text-purple-400 hover:text-purple-300 transition-colors underline underline-offset-2"
              >
                Go to AI Copilot →
              </button>
            </div>
          ) : (
            <div className="ws-files-folder-grid">
              {filteredFolders.map(folderName => {
                const files = folders.get(folderName) ?? [];
                const types = [...new Set(files.map(f => f.type))];
                const recentDate = files.reduce((d, f) =>
                  new Date(f.uploadedAt) > d ? new Date(f.uploadedAt) : d, new Date(0));
                return (
                  <button
                    key={folderName}
                    type="button"
                    onClick={() => setActiveFolder(folderName)}
                    className="ws-files-folder-card group"
                  >
                    <div className="ws-files-folder-icon-wrap group-hover:scale-110 transition-transform duration-200">
                      <FolderOpen className="w-6 h-6 text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-[13px] font-semibold text-white/90 truncate leading-tight">{folderName}</p>
                      <p className="text-[11px] text-white/40 mt-0.5">
                        {files.length} {files.length === 1 ? 'file' : 'files'} · {recentDate.toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-1 flex-wrap justify-end mt-1">
                      {types.map(t => (
                        <span key={t} className="ws-files-type-badge">{t.toUpperCase()}</span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          )
        ) : (
          /* ── File List inside Folder ── */
          filesInFolder.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 py-16">
              <FileText className="w-10 h-10 text-white/10" />
              <p className="text-sm text-white/30">No files match your search.</p>
            </div>
          ) : (
            <div className="ws-files-file-list">
              {filesInFolder.map(file => (
                <div key={file.id} className="ws-files-file-row group">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="ws-files-file-icon-wrap">
                      <FileTypeIcon type={file.type} size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-white/90 truncate">{file.name}</p>
                      <p className="text-[11px] text-white/40">
                        {typeLabel(file.type)} · {file.size} · {new Date(file.uploadedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200">
                    <button
                      type="button"
                      onClick={() => setPreviewFile(file)}
                      className="ws-files-action-btn"
                      title="Preview file"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Delete "${file.name}"?`)) {
                          deleteUploadedFile(file.id);
                        }
                      }}
                      className="ws-files-action-btn ws-files-action-btn--danger"
                      title="Delete file"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
