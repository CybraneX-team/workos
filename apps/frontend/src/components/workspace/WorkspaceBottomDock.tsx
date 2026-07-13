import type { ComponentType } from 'react';
import {
  ChartSquare,
  Code,
  DocumentText,
  Link1,
  MagicStar,
  Note,
  TableDocument,
  TaskSquare,
  type IconProps,
} from 'iconsax-reactjs';
import { WORKSPACE_TOOLBAR_ITEMS } from '../../lib/workspaceLayoutData';
import { useFounderWorkspace } from '../../context/FounderWorkspaceContext';

type ToolbarItem = (typeof WORKSPACE_TOOLBAR_ITEMS)[number];

const TOOLBAR_ICONS: Record<ToolbarItem, ComponentType<IconProps>> = {
  Note,
  Task: TaskSquare,
  File: DocumentText,
  Link: Link1,
  Table: TableDocument,
  Chart: ChartSquare,
  Code,
  'AI Assistant': MagicStar,
};

/* Which sidebar tab each dock button navigates to */
const DOCK_TAB: Partial<Record<ToolbarItem, string>> = {
  Note:  'notes',
  Task:  'tasks',
  File:  'files',
  Link:  'notes',
  Table: 'files',
  Chart: 'goals',
  Code:  'notes',
};

/* Custom event fired after tab navigation so sub-components can react */
const DOCK_EVENT: Partial<Record<ToolbarItem, string>> = {
  Note:  'workspace-dock-note',
  Task:  'workspace-dock-task',
  File:  'workspace-dock-file',
  Link:  'workspace-dock-note',
  Table: 'workspace-dock-file',
  Code:  'workspace-dock-note',
};

const ICON_SIZE = 14;

export function WorkspaceBottomDock() {
  const { setActiveSidebarTab, setWorkspaceMode } = useFounderWorkspace();

  const handleClick = (label: ToolbarItem) => {
    if (label === 'AI Assistant') {
      setWorkspaceMode('agent');
      setActiveSidebarTab('canvas');
      // Give React a tick to mount the canvas view, then switch to overview
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent('workspace-set-canvas-view', { detail: { view: 'overview' } })
        );
      }, 50);
      return;
    }

    const tab = DOCK_TAB[label];
    if (tab) {
      setActiveSidebarTab(tab);
      const evt = DOCK_EVENT[label];
      if (evt) {
        // Delay slightly so the new tab finishes mounting before the event fires
        setTimeout(() => window.dispatchEvent(new CustomEvent(evt)), 60);
      }
    }
  };

  return (
    <div className="ws-bottom-dock shrink-0 flex items-end justify-between gap-4 px-1 pb-1 pointer-events-none">
      <div className="pointer-events-auto w-[228px]" />

      <div className="pointer-events-auto flex-1 flex justify-center">
        <div className="ws-toolbar ws-glass-strong flex items-center gap-0.5 px-2 py-1.5 rounded-2xl">
          {WORKSPACE_TOOLBAR_ITEMS.map(label => {
            const Icon = TOOLBAR_ICONS[label];
            const isAi = label === 'AI Assistant';

            return (
              <button
                key={label}
                type="button"
                onClick={() => handleClick(label)}
                className={
                  isAi
                    ? 'ws-toolbar-ai flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-semibold cursor-pointer'
                    : 'ws-toolbar-btn flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-medium text-white/55 cursor-pointer'
                }
              >
                <Icon
                  size={ICON_SIZE}
                  variant={isAi ? 'Bold' : 'Linear'}
                  color="currentColor"
                />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="pointer-events-auto w-[268px]" />
    </div>
  );
}
