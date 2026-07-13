import { useEffect, useRef } from 'react';
import { UniverseController, type NavPathEntry, type ZoomLevel, type HoverTarget } from './UniverseController';
import type { UniverseData } from '../data/universeGraph';

interface UniverseCanvasProps {
  data: UniverseData;
  onNavigate?: (path: NavPathEntry[], level: ZoomLevel) => void;
  onHover?: (target: HoverTarget | null) => void;
  onCreateCompany?: (industry: any, subdomain: any) => void;
  onEnterBH?: () => void;
  onExitBH?: () => void;
  onEnterCompanyPolytope?: (company: any) => void;
  onEnterCompanyInterior?: (company: any) => void;
  onInteriorLevelChange?: (depth: number, path: string[]) => void;
  onExitCompanyPolytope?: () => void;
  onCompanyAwaitingRole?: (ctx: { company: any; industry: any; subdomain: any }) => void;
  onEnterCompanyPlanetRoots?: (company: any) => void;
  onPlanetLevelChange?: (depth: number, path: string[]) => void;
  controllerRef?: React.MutableRefObject<UniverseController | null>;
  voiceIntensityRef?: React.MutableRefObject<number>;
  onIndustryCoreVoiceToggle?: (industry: any, active: boolean) => void;
}

export default function UniverseCanvas({
  data, onNavigate, onHover, onCreateCompany, onEnterBH, onExitBH,
  onEnterCompanyPolytope, onEnterCompanyInterior, onInteriorLevelChange, onExitCompanyPolytope,
  onCompanyAwaitingRole, onEnterCompanyPlanetRoots, onPlanetLevelChange,
  controllerRef, voiceIntensityRef, onIndustryCoreVoiceToggle,
}: UniverseCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ctrlRef = useRef<UniverseController | null>(null);

  const stableOnNavigate = useRef(onNavigate);
  stableOnNavigate.current = onNavigate;
  const stableOnHover = useRef(onHover);
  stableOnHover.current = onHover;
  const stableOnCreateCompany = useRef(onCreateCompany);
  stableOnCreateCompany.current = onCreateCompany;
  const stableOnEnterBH = useRef(onEnterBH);
  stableOnEnterBH.current = onEnterBH;
  const stableOnExitBH = useRef(onExitBH);
  stableOnExitBH.current = onExitBH;
  const stableOnEnterCompanyPolytope = useRef(onEnterCompanyPolytope);
  stableOnEnterCompanyPolytope.current = onEnterCompanyPolytope;
  const stableOnEnterCompanyInterior = useRef(onEnterCompanyInterior);
  stableOnEnterCompanyInterior.current = onEnterCompanyInterior;
  const stableOnInteriorLevelChange = useRef(onInteriorLevelChange);
  stableOnInteriorLevelChange.current = onInteriorLevelChange;
  const stableOnExitCompanyPolytope = useRef(onExitCompanyPolytope);
  stableOnExitCompanyPolytope.current = onExitCompanyPolytope;
  const stableOnCompanyAwaitingRole = useRef(onCompanyAwaitingRole);
  stableOnCompanyAwaitingRole.current = onCompanyAwaitingRole;
  const stableOnEnterCompanyPlanetRoots = useRef(onEnterCompanyPlanetRoots);
  stableOnEnterCompanyPlanetRoots.current = onEnterCompanyPlanetRoots;
  const stableOnPlanetLevelChange = useRef(onPlanetLevelChange);
  stableOnPlanetLevelChange.current = onPlanetLevelChange;
  const stableOnIndustryCoreVoiceToggle = useRef(onIndustryCoreVoiceToggle);
  stableOnIndustryCoreVoiceToggle.current = onIndustryCoreVoiceToggle;

  useEffect(() => {
    if (!containerRef.current) return;

    const ctrl = new UniverseController(
      containerRef.current,
      data,
      {
        onNavigate: (path, level) => stableOnNavigate.current?.(path, level),
        onHover: (target) => stableOnHover.current?.(target),
        onCreateCompany: (industry, subdomain) => stableOnCreateCompany.current?.(industry, subdomain),
        onEnterBH: () => stableOnEnterBH.current?.(),
        onExitBH: () => stableOnExitBH.current?.(),
        onEnterCompanyPolytope: (company) => stableOnEnterCompanyPolytope.current?.(company),
        onEnterCompanyInterior: (company) => stableOnEnterCompanyInterior.current?.(company),
        onInteriorLevelChange: (depth, path) => stableOnInteriorLevelChange.current?.(depth, path),
        onExitCompanyPolytope: () => stableOnExitCompanyPolytope.current?.(),
        onCompanyAwaitingRole: (ctx) => stableOnCompanyAwaitingRole.current?.(ctx),
        onEnterCompanyPlanetRoots: (company) => stableOnEnterCompanyPlanetRoots.current?.(company),
        onPlanetLevelChange: (depth, path) => stableOnPlanetLevelChange.current?.(depth, path),
        onIndustryCoreVoiceToggle: (industry: any, active: boolean) => stableOnIndustryCoreVoiceToggle.current?.(industry, active),
      },
    );
    ctrlRef.current = ctrl;
    if (controllerRef) controllerRef.current = ctrl;
    if (voiceIntensityRef) ctrl.setVoiceIntensityRef(voiceIntensityRef);

    // Force resize after first paint — catches any layout-timing issues where
    // clientHeight was read before the browser finalised the fixed/absolute layout.
    const rafId = requestAnimationFrame(() => ctrl.resize());

    return () => {
      cancelAnimationFrame(rafId);
      ctrl.dispose();
      ctrlRef.current = null;
      if (controllerRef) controllerRef.current = null;
    };
  }, []); // mount once — data passed at construction time

  useEffect(() => {
    if (ctrlRef.current && data) {
      ctrlRef.current.updateData(data);
    }
  }, [data]);

  useEffect(() => {
    if (ctrlRef.current && voiceIntensityRef) {
      ctrlRef.current.setVoiceIntensityRef(voiceIntensityRef);
    }
  }, [voiceIntensityRef]);

  return <div ref={containerRef} className="absolute inset-0 w-full h-full overflow-hidden" />;
}
