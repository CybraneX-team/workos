import { useEffect, useState } from 'react';
import type { ImplementationTask } from './types';
import { canEditTask, canDeleteTask } from './types';
import { INITIAL_TASKS } from './fixtures';
import { ObjectSpaceHub } from './ObjectSpaceHub';
import { TaskStudio } from './TaskStudio';
import { CreateTaskModal } from './components/CreateTaskModal';
import { EditTaskModal } from './components/EditTaskModal';
import { DeleteTaskModal } from './components/DeleteTaskModal';
import { Sparkles, X } from 'lucide-react';

const STORAGE_KEY = 'workos_object_space_tasks_v6';

export interface ObjectSpaceNavbarContext {
  task: ImplementationTask;
  onBackToHub: () => void;
  onOpenReportModal: () => void;
}

interface ObjectSpaceProps {
  currentUser?: { name: string; email: string };
  onNavbarContextChange?: (ctx: ObjectSpaceNavbarContext | null) => void;
}

export default function ObjectSpace({
  currentUser = { name: 'Ronak', email: 'manager@example.com' },
  onNavbarContextChange,
}: ObjectSpaceProps = {}) {
  const [tasks, setTasks] = useState<ImplementationTask[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: ImplementationTask[] = JSON.parse(stored);
        if (parsed.length >= 10) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
    // Seed initial tasks with clear ownership breakdown
    return INITIAL_TASKS.map((t, idx) => ({
      ...t,
      // Tasks 0-7 created by currentUser (editable & deletable), remainder created by other teammates
      createdBy: idx < 8 ? currentUser.email : 'sarah.connor@acmecorp.com',
      createdByName: idx < 8 ? `${currentUser.name} (You)` : 'Sarah Connor (VP Operations)',
      objectType: t.objectType || (idx % 2 === 0 ? 'CUSTOMER' : 'OPPORTUNITY'),
    }));
  });

  const [activeTask, setActiveTask] = useState<ImplementationTask | null>(null);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: 'good' | 'bad' } | null>(null);

  // CRUD State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState<ImplementationTask | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<ImplementationTask | null>(null);

  // Sync to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch {
      // ignore
    }
  }, [tasks]);

  // Add class to body to hide global demo controls during Object Space session
  useEffect(() => {
    document.body.classList.add('in-object-space');
    return () => {
      document.body.classList.remove('in-object-space');
    };
  }, []);

  // Propagate active task navbar context to PMS shell
  useEffect(() => {
    if (!onNavbarContextChange) return;

    if (activeTask) {
      onNavbarContextChange({
        task: activeTask,
        onBackToHub: () => {
          setActiveTask(null);
          setIsReportOpen(false);
        },
        onOpenReportModal: () => setIsReportOpen(true),
      });
    } else {
      onNavbarContextChange(null);
    }

    return () => {
      onNavbarContextChange(null);
    };
  }, [activeTask, onNavbarContextChange]);

  const showToast = (message: string, tone: 'good' | 'bad' = 'good') => {
    setToast({ message, tone });
    setTimeout(() => setToast(null), 3500);
  };

  // 1. CREATE Task (With full owner permissions)
  const handleCreateTask = (newTask: ImplementationTask) => {
    setTasks((prev) => [newTask, ...prev]);
    setIsCreateOpen(false);
    showToast(`Task "${newTask.title}" created with full owner permissions!`, 'good');
  };

  // 2. UPDATE Task
  const handleUpdateTask = (updatedTask: ImplementationTask) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === updatedTask.id ? updatedTask : t))
    );
    if (activeTask && activeTask.id === updatedTask.id) {
      setActiveTask(updatedTask);
    }
  };

  const handleOpenEdit = (task: ImplementationTask) => {
    if (!canEditTask(task, currentUser.email)) {
      showToast(`Cannot edit: Task was assigned by ${task.createdByName || task.createdBy || 'another manager'}. Read-only access.`, 'bad');
      return;
    }
    setTaskToEdit(task);
    setIsEditOpen(true);
  };

  const handleSaveEdit = (updatedTask: ImplementationTask) => {
    handleUpdateTask(updatedTask);
    setIsEditOpen(false);
    setTaskToEdit(null);
    showToast(`Task "${updatedTask.title}" updated successfully.`, 'good');
  };

  // 3. DELETE Task
  const handlePromptDelete = (task: ImplementationTask) => {
    if (!canDeleteTask(task, currentUser.email)) {
      showToast(`Cannot delete: Task was created by ${task.createdByName || task.createdBy || 'another manager'}.`, 'bad');
      return;
    }
    setTaskToDelete(task);
    setIsDeleteOpen(true);
  };

  const handleConfirmDelete = () => {
    if (!taskToDelete) return;
    const targetId = taskToDelete.id;
    setTasks((prev) => prev.filter((t) => t.id !== targetId));
    if (activeTask && activeTask.id === targetId) {
      setActiveTask(null);
    }
    setIsDeleteOpen(false);
    setTaskToDelete(null);
    showToast(`Task "${taskToDelete.title}" and its 3D satellite node were deleted.`, 'good');
  };

  return (
    <div className="w-full h-full relative overflow-hidden bg-[#05070f] text-slate-100 flex flex-col font-sans">
      <style>{`
        body.in-object-space .demo-controls-bar {
          display: none !important;
        }
        body.modal-open .app-header,
        body.modal-open header.app-header,
        body.modal-open nav.app-tabs {
          display: none !important;
        }
      `}</style>
      
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-20 right-6 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-xl border shadow-2xl text-xs font-semibold backdrop-blur-md animate-slideIn ${
            toast.tone === 'good'
              ? 'bg-[#0c101d]/95 border-emerald-500/40 text-emerald-300'
              : 'bg-[#0c101d]/95 border-rose-500/40 text-rose-300'
          }`}
        >
          <Sparkles size={14} className={toast.tone === 'good' ? 'text-emerald-400' : 'text-rose-400'} />
          <span>{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="ml-2 text-slate-400 hover:text-slate-200"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Toggle between Macro Hub and Micro Task Studio */}
      {activeTask ? (
        <TaskStudio
          task={activeTask}
          currentUser={currentUser}
          onUpdateTask={handleUpdateTask}
          onBackToHub={() => {
            setActiveTask(null);
            setIsReportOpen(false);
          }}
          onToast={showToast}
          onEditTask={handleOpenEdit}
          onDeleteTask={handlePromptDelete}
          isReportOpen={isReportOpen}
          setIsReportOpen={setIsReportOpen}
        />
      ) : (
        <ObjectSpaceHub
          tasks={tasks}
          currentUser={currentUser}
          onOpenTaskStudio={(task) => setActiveTask(task)}
          onOpenCreateModal={() => setIsCreateOpen(true)}
          onEditTask={handleOpenEdit}
          onDeleteTask={handlePromptDelete}
        />
      )}

      {/* 1. Create Task Modal */}
      <CreateTaskModal
        isOpen={isCreateOpen}
        currentUser={currentUser}
        onCreateTask={handleCreateTask}
        onClose={() => setIsCreateOpen(false)}
      />

      {/* 2. Edit Task Modal (Owner Permission Guarded) */}
      <EditTaskModal
        isOpen={isEditOpen}
        task={taskToEdit}
        currentUser={currentUser}
        onUpdateTask={handleSaveEdit}
        onClose={() => {
          setIsEditOpen(false);
          setTaskToEdit(null);
        }}
      />

      {/* 3. Delete Task Confirmation Modal (Owner Permission Guarded) */}
      <DeleteTaskModal
        isOpen={isDeleteOpen}
        task={taskToDelete}
        onConfirm={handleConfirmDelete}
        onClose={() => {
          setIsDeleteOpen(false);
          setTaskToDelete(null);
        }}
      />
    </div>
  );
}
