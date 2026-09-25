import { Canvas, useFrame } from "@react-three/fiber";
import { Billboard, Line, OrbitControls, OrthographicCamera, Text } from "@react-three/drei";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";

type ObjectCategory = "core" | "commercial" | "execution" | "financial" | "support" | "resources" | "governance" | "knowledge";

type SpaceObject = {
  id: string;
  glyph: string;
  label: string;
  subtitle: string;
  category: ObjectCategory;
  position: [number, number, number];
  radius: number;
  color: string;
  facts: Array<[string, string]>;
  related: Array<[string, number]>;
};

const OBJECTS: SpaceObject[] = [
  {
    id: "organisation", glyph: "▦", label: "ORGANISATION", subtitle: "Acme Corp", category: "core",
    position: [0, 0.15, 0], radius: 1.08, color: "#8a5ad8",
    facts: [["Name", "Acme Corp"], ["Type", "Organisation"], ["Industry", "Technology"], ["Status", "Active"], ["Since", "12 Jan 2024"]],
    related: [["Departments", 6], ["Customers", 32], ["Projects", 14], ["People", 48], ["Documents", 126]],
  },
  {
    id: "customer", glyph: "●●", label: "CUSTOMER", subtitle: "Globex Ltd", category: "commercial",
    position: [0, 1.1, -3.55], radius: 0.78, color: "#a16dea",
    facts: [["Name", "Globex Ltd"], ["Type", "Enterprise"], ["Industry", "Manufacturing"], ["Owner", "Sales Team"], ["Status", "Active"]],
    related: [["Opportunities", 3], ["Projects", 2], ["Invoices", 7], ["Contacts", 5], ["Documents", 12]],
  },
  {
    id: "product", glyph: "◇", label: "PRODUCT", subtitle: "WorkOS Platform", category: "core",
    position: [-3.05, 0.75, -2.55], radius: 0.75, color: "#9462df",
    facts: [["Name", "WorkOS Platform"], ["Type", "SaaS"], ["Status", "Live"], ["Owner", "Product Team"], ["Version", "4.2"]],
    related: [["Projects", 8], ["Customers", 32], ["Features", 74], ["Documents", 29]],
  },
  {
    id: "opportunity", glyph: "◎", label: "OPPORTUNITY", subtitle: "Enterprise Deal", category: "commercial",
    position: [3.05, 0.8, -2.35], radius: 0.76, color: "#9b62e6",
    facts: [["Name", "Enterprise Deal"], ["Stage", "Proposal"], ["Value", "$125,000"], ["Owner", "Maya Shah"], ["Close", "18 Sep"]],
    related: [["Contacts", 4], ["Products", 2], ["Proposals", 1], ["Activities", 14]],
  },
  {
    id: "department", glyph: "⌘", label: "DEPARTMENT", subtitle: "Sales", category: "resources",
    position: [-4.4, 0.25, 0], radius: 0.82, color: "#8f5ed8",
    facts: [["Name", "Sales"], ["Lead", "Arun Mehta"], ["People", "12"], ["Region", "Global"], ["Status", "On track"]],
    related: [["People", 12], ["Opportunities", 19], ["Goals", 5], ["Projects", 3]],
  },
  {
    id: "project", glyph: "▤", label: "PROJECT", subtitle: "WorkOS Implementation", category: "execution",
    position: [4.45, 0.25, 0.1], radius: 0.82, color: "#9161dc",
    facts: [["Name", "WorkOS Implementation"], ["Status", "On track"], ["Progress", "68%"], ["Owner", "PMO"], ["Due", "30 Oct"]],
    related: [["Tasks", 24], ["People", 8], ["Documents", 17], ["Risks", 3]],
  },
  {
    id: "asset", glyph: "≡", label: "ASSET", subtitle: "Cloud Server 01", category: "resources",
    position: [-3.3, -0.15, 2.65], radius: 0.76, color: "#8f5ed8",
    facts: [["Name", "Cloud Server 01"], ["Type", "Compute"], ["Provider", "AWS"], ["Status", "Healthy"], ["Region", "ap-south-1"]],
    related: [["Systems", 5], ["Projects", 3], ["Incidents", 1], ["Policies", 4]],
  },
  {
    id: "person", glyph: "●", label: "PERSON", subtitle: "John Doe", category: "resources",
    position: [0, -0.1, 3.65], radius: 0.8, color: "#a46ee8",
    facts: [["Name", "John Doe"], ["Role", "Account Lead"], ["Team", "Sales"], ["Status", "Active"], ["Location", "London"]],
    related: [["Projects", 4], ["Customers", 7], ["Tasks", 11], ["Documents", 9]],
  },
  {
    id: "invoice", glyph: "▧", label: "INVOICE", subtitle: "INV-2025-0045", category: "financial",
    position: [3.35, -0.1, 2.65], radius: 0.76, color: "#9863df",
    facts: [["Number", "INV-2025-0045"], ["Amount", "$42,500"], ["Status", "Due"], ["Customer", "Globex Ltd"], ["Due", "24 Sep"]],
    related: [["Customer", 1], ["Projects", 2], ["Payments", 1], ["Documents", 3]],
  },
];

const RELATION_COLORS = ["#8b5cf6", "#52c6a8", "#7795c9", "#e1ad38", "#b65bd6", "#3dbbc1"];

function ObjectOrb({ object, selected, muted, onSelect }: {
  object: SpaceObject;
  selected: boolean;
  muted: boolean;
  onSelect: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const target = selected ? 1.12 : hovered ? 1.06 : 1;
    const next = THREE.MathUtils.damp(groupRef.current.scale.x, target, 8, delta);
    groupRef.current.scale.setScalar(next);
  });

  return (
    <group ref={groupRef} position={object.position}>
      <mesh
        castShadow
        receiveShadow
        onClick={(event) => { event.stopPropagation(); onSelect(); }}
        onPointerOver={(event) => { event.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }}
        onPointerOut={(event) => { event.stopPropagation(); setHovered(false); document.body.style.cursor = "auto"; }}
      >
        <sphereGeometry args={[object.radius, 64, 48]} />
        <meshPhysicalMaterial
          color={object.color}
          roughness={0.26}
          metalness={0.08}
          clearcoat={1}
          clearcoatRoughness={0.16}
          transparent
          opacity={muted ? 0.22 : 0.98}
        />
      </mesh>
      <mesh scale={1.08} raycast={() => undefined}>
        <sphereGeometry args={[object.radius, 40, 32]} />
        <meshBasicMaterial color="#c7a8ff" transparent opacity={muted ? 0.02 : selected ? 0.22 : 0.1} side={THREE.BackSide} />
      </mesh>
      {!muted && (
        <Billboard follow lockX={false} lockY={false} lockZ={false}>
          <Text position={[0, 0.42, object.radius + 0.025]} fontSize={object.id === "organisation" ? 0.36 : 0.3} color="#ffffff" anchorX="center" anchorY="middle" fontWeight={600}>
            {object.glyph}
          </Text>
          <Text position={[0, 0.08, object.radius + 0.025]} fontSize={object.id === "organisation" ? 0.19 : 0.15} color="#ffffff" anchorX="center" anchorY="middle" fontWeight={700}>
            {object.label}
          </Text>
          <Text position={[0, -0.18, object.radius + 0.025]} fontSize={0.115} color="#f2eaff" anchorX="center" anchorY="middle">
            {object.subtitle}
          </Text>
        </Billboard>
      )}
      {selected && (
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -object.radius - 0.12, 0]} raycast={() => undefined}>
          <torusGeometry args={[object.radius * 1.02, 0.025, 12, 96]} />
          <meshBasicMaterial color="#6d28d9" transparent opacity={0.72} />
        </mesh>
      )}
    </group>
  );
}

function ObjectSpaceScene({ selectedId, onSelect }: {
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const particles = useMemo(() => {
    let seed = 19421;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    return Array.from({ length: 78 }, (_, index) => {
      const angle = random() * Math.PI * 2;
      const radius = 1.7 + random() * 5.1;
      return {
        key: index,
        position: [Math.cos(angle) * radius, -0.88 + random() * 2.4, Math.sin(angle) * radius] as [number, number, number],
        size: 0.035 + random() * 0.13,
      };
    });
  }, []);

  return (
    <>
      <color attach="background" args={["#f4f1fb"]} />
      <fog attach="fog" args={["#f4f1fb", 11, 24]} />
      <OrthographicCamera makeDefault position={[8.8, 7.2, 10.5]} zoom={72} />
      <OrbitControls makeDefault target={[0, 0, 0]} enableDamping dampingFactor={0.075} enablePan={false} minZoom={52} maxZoom={105} minPolarAngle={0.55} maxPolarAngle={1.25} />
      <ambientLight intensity={1.8} />
      <directionalLight position={[-5, 9, 7]} intensity={3.2} color="#ffffff" castShadow />
      <pointLight position={[0, 3, 1]} intensity={70} distance={16} color="#c6a7ff" />

      <mesh position={[0, -1.55, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[8.2, 128]} />
        <meshStandardMaterial color="#f8f6fc" roughness={0.93} />
      </mesh>

      {[1.7, 2.65, 3.65, 4.65, 5.65].map((radius, index) => (
        <mesh key={radius} position={[0, -1.48 + index * 0.004, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={() => undefined}>
          <torusGeometry args={[radius, index === 0 ? 0.035 : 0.018, 10, 180]} />
          <meshBasicMaterial color={index === 0 ? "#9f7aea" : "#b9a2df"} transparent opacity={0.2 + index * 0.025} />
        </mesh>
      ))}

      {OBJECTS.filter((object) => object.id !== "organisation").map((object, index) => (
        <Line
          key={`relation-${object.id}`}
          points={[[0, -0.25, 0], [object.position[0] * 0.54, -0.72, object.position[2] * 0.54], object.position]}
          color={RELATION_COLORS[index % RELATION_COLORS.length]}
          lineWidth={0.65}
          transparent
          opacity={0.32}
        />
      ))}

      {particles.map((particle) => (
        <mesh key={particle.key} position={particle.position} raycast={() => undefined}>
          <sphereGeometry args={[particle.size, 16, 12]} />
          <meshPhysicalMaterial color="#a97bea" roughness={0.25} clearcoat={1} transparent opacity={0.58} />
        </mesh>
      ))}

      {OBJECTS.map((object) => (
        <ObjectOrb
          key={object.id}
          object={object}
          selected={selectedId === object.id}
          muted={false}
          onSelect={() => onSelect(object.id)}
        />
      ))}
    </>
  );
}

export default function ObjectSpace() {
  const [selectedId, setSelectedId] = useState("customer");

  return (
    <section className="object-space" aria-label="Object Space">
      <div className="object-space__canvas">
        <Canvas shadows dpr={[1, 1.5]} gl={{ antialias: true, alpha: false }}>
          <ObjectSpaceScene selectedId={selectedId} onSelect={setSelectedId} />
        </Canvas>
      </div>
    </section>
  );
}
