import { Canvas } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import type { UExternalNode } from '../../lib/universalPolytopeData';
import { RootInternalNodeScene } from './RootInternalNodeScene';

export interface PlanetRootNodeViewProps {
  root: UExternalNode;
  selectedInternalPath: string[];
  onInternalPathChange: (path: string[]) => void;
  requestBackStep?: number;
  rootSwitchKey?: number;
  onBack?: () => void;
}

/** BDT department drill-in node layout only — no convex polytope hull. */
export default function PlanetRootNodeView({
  root,
  selectedInternalPath,
  onInternalPathChange,
  requestBackStep = 0,
  rootSwitchKey = 0,
  onBack,
}: PlanetRootNodeViewProps) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Canvas
        camera={{ position: [0, 0, 9.5], fov: 45, near: 0.1, far: 300 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true }}
        frameloop="always"
        style={{ background: 'transparent' }}
      >
        <Stars radius={80} depth={40} count={3500} factor={3} saturation={0.5} fade speed={0.4} />
        <RootInternalNodeScene
          root={root}
          selectedInternalPath={selectedInternalPath}
          onPathChange={onInternalPathChange}
          requestBackStep={requestBackStep}
          rootSwitchKey={rootSwitchKey}
          onBack={onBack}
        />
      </Canvas>
    </div>
  );
}
