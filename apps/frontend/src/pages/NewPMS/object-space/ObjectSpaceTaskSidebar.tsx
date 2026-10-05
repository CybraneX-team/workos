import React, { useMemo, useState, useEffect } from 'react';
import { Search, X, ChevronDown, ChevronUp, ArrowUpRight, Plus, Edit2, Trash2, Lock } from 'lucide-react';
import type { ImplementationTask } from './types';
import { canEditTask, canDeleteTask } from './types';

interface ObjectSpaceTaskSidebarProps {
  tasks: ImplementationTask[];
  selectedTaskId: string | null;
  filterStatus: string;
  currentPage: number;
  totalPages: number;
  currentUser?: { name: string; email: string };
  onPageChange: (page: number) => void;
  onFilterChange: (status: string) => void;
  onSelectAndZoomTask: (task: ImplementationTask) => void;
  onOpenTaskCockpit: (task: ImplementationTask) => void;
  onOpenCreateModal?: () => void;
  onEditTask?: (task: ImplementationTask) => void;
  onDeleteTask?: (task: ImplementationTask) => void;
}

export const ObjectSpaceTaskSidebar: React.FC<ObjectSpaceTaskSidebarProps> = ({
  tasks,
  selectedTaskId,
  filterStatus,
  currentPage,
  totalPages,
  currentUser = { name: 'Ronak', email: 'manager@example.com' },
  onPageChange,
  onFilterChange,
  onSelectAndZoomTask,
  onOpenTaskCockpit,
  onOpenCreateModal,
  onEditTask,
  onDeleteTask,
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Keyboard shortcut ⌘K / Ctrl+K to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen(true);
        const searchInput = document.getElementById('object-space-search-input');
        searchInput?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const filteredTasks = useMemo(() => {
    let list = tasks;
    if (filterStatus !== 'all') {
      list = list.filter((t) => t.status === filterStatus);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.goal.toLowerCase().includes(q) ||
          t.status.toLowerCase().includes(q) ||
          (t.objectType && t.objectType.toLowerCase().includes(q)) ||
          t.steps.some((s) => s.title.toLowerCase().includes(q))
      );
    }
    return list;
  }, [tasks, filterStatus, searchQuery]);

  return (
    <div className="absolute bottom-6 right-6 z-40 flex flex-col items-end pointer-events-auto font-sans">
      {/* Collapsed Compact Floating Button */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="p-2.5 rounded-2xl bg-white/95 border border-slate-200 text-slate-700 shadow-xl backdrop-blur-md hover:bg-slate-50 hover:text-violet-600 transition-all active:scale-95 group flex items-center gap-2"
          title="Open Task Search (⌘K)"
        >
          <Search size={14} className="text-slate-500 group-hover:text-violet-600" />
          <span className="text-xs font-semibold text-slate-700">Tasks ({tasks.length})</span>
          <ChevronUp size={13} className="text-slate-400 group-hover:-translate-y-0.5 transition-transform" />
        </button>
      )}

      {/* Dynamic Height Floating Card at Bottom-Right */}
      {isOpen && (
        <aside className="w-64 sm:w-72 flex flex-col bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl shadow-xl overflow-hidden transition-all duration-200 ease-out">
          
          {/* Top Header with + Create Task button */}
          <div className="p-2.5 border-b border-slate-100 bg-white/60 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Tasks & Workflows
              </span>
              <div className="flex items-center gap-1.5">
                {onOpenCreateModal && (
                  <button
                    type="button"
                    onClick={onOpenCreateModal}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-[10px] font-bold shadow-xs active:scale-95 transition-all"
                    title="Create new task with real-time 3D preview"
                  >
                    <Plus size={11} />
                    <span>New Task</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-0.5 rounded-md hover:bg-slate-100 transition-colors"
                  title="Collapse"
                >
                  <ChevronDown size={13} />
                </button>
              </div>
            </div>

            <div className="relative flex items-center bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 focus-within:border-violet-500 focus-within:bg-white focus-within:ring-1 focus-within:ring-violet-200 transition-all">
              <Search size={13} className="text-slate-400 shrink-0 mr-1.5" />
              <input
                id="object-space-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search universe..."
                className="w-full bg-transparent text-[11px] text-slate-900 placeholder-slate-400 focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X size={11} />
                </button>
              )}
            </div>

            {/* Micro Filter Tabs */}
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 text-[10px] font-medium">
              {[
                { id: 'all', label: 'All' },
                { id: 'active', label: 'Active' },
                { id: 'in_progress', label: 'In Progress' },
                { id: 'completed', label: 'Done' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onFilterChange(tab.id)}
                  className={`flex-1 py-0.5 rounded transition-all text-center ${
                    filterStatus === tab.id
                      ? 'bg-white text-purple-700 shadow-2xs font-bold'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Dynamic Height Task List with Permission Controls */}
          <div className="overflow-y-auto p-1.5 space-y-1 max-h-[260px] custom-scrollbar">
            {filteredTasks.map((task) => {
              const isSelected = selectedTaskId === task.id;
              const isOwner = canEditTask(task, currentUser.email);
              const isDeletable = canDeleteTask(task, currentUser.email);

              const statusDotColor =
                task.status === 'active'
                  ? 'bg-purple-600'
                  : task.status === 'in_progress'
                  ? 'bg-blue-600'
                  : 'bg-emerald-600';

              return (
                <div
                  key={task.id}
                  onClick={() => onSelectAndZoomTask(task)}
                  className={`group relative flex items-center justify-between p-2 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-violet-50/95 border-violet-300 shadow-2xs ring-1 ring-violet-200'
                      : 'bg-white/70 border-transparent hover:bg-slate-50 hover:border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 pr-1.5 flex-1">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${statusDotColor}`} />
                    {/* Title & Metadata */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-[11px] font-bold truncate leading-tight transition-colors ${
                            isSelected ? 'text-violet-950' : 'text-slate-800 group-hover:text-slate-900'
                          }`}
                        >
                          {task.title}
                        </span>
                        {!isOwner && (
                          <span
                            className="text-slate-400 hover:text-slate-600 shrink-0"
                            title={`Created by ${task.createdByName || task.createdBy || 'another user'} (Read & execute only)`}
                          >
                            <Lock size={10} />
                          </span>
                        )}
                      </div>
                      <div className="text-[9px] text-slate-400 truncate leading-normal flex items-center gap-1.5">
                        <span>{task.steps.length} steps</span>
                        <span>•</span>
                        <span>{task.assignee.name}</span>
                        {isOwner && (
                          <>
                            <span>•</span>
                            <span className="text-emerald-600 font-semibold">Owner</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Task Actions (Edit/Delete for Owner, Launch for All) */}
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Owner Edit Action */}
                    {isOwner && onEditTask && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditTask(task);
                        }}
                        className="p-1 rounded-md text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-slate-200 hover:text-slate-700 transition-all"
                        title="Edit Task Details (Owner)"
                      >
                        <Edit2 size={11} />
                      </button>
                    )}

                    {/* Owner Delete Action */}
                    {isDeletable && onDeleteTask && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteTask(task);
                        }}
                        className="p-1 rounded-md text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-rose-100 hover:text-rose-600 transition-all"
                        title="Delete Task (Owner)"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}

                    {/* Launch into Cockpit */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenTaskCockpit(task);
                      }}
                      className="p-1 rounded-md text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-violet-100 hover:text-violet-700 transition-all"
                      title="Open Task Cockpit"
                    >
                      <ArrowUpRight size={12} />
                    </button>
                  </div>
                </div>
              );
            })}

            {filteredTasks.length === 0 && (
              <div className="py-5 px-3 text-center text-[11px] text-slate-400">
                No matching tasks
              </div>
            )}
          </div>

          {/* Pagination Footer Controls */}
          {totalPages > 1 && (
            <div className="p-2 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between text-[10px] font-semibold text-slate-600">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => onPageChange(currentPage - 1)}
                className={`px-2 py-0.5 rounded-md border transition-all ${
                  currentPage <= 1
                    ? 'opacity-40 cursor-not-allowed bg-slate-100 border-slate-200 text-slate-400'
                    : 'bg-white hover:bg-violet-50 hover:text-violet-700 border-slate-200'
                }`}
              >
                Prev
              </button>

              <span className="font-mono text-[10px] text-slate-500">
                Page {currentPage} of {totalPages}
              </span>

              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => onPageChange(currentPage + 1)}
                className={`px-2 py-0.5 rounded-md border transition-all ${
                  currentPage >= totalPages
                    ? 'opacity-40 cursor-not-allowed bg-slate-100 border-slate-200 text-slate-400'
                    : 'bg-white hover:bg-violet-50 hover:text-violet-700 border-slate-200'
                }`}
              >
                Next
              </button>
            </div>
          )}
        </aside>
      )}
    </div>
  );
};
