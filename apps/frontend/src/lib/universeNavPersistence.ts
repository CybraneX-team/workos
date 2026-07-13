export type PersistedUniverseNavLevel = 'industry' | 'subdomain' | 'company';

export type PersistedUniverseNav = {
  level: PersistedUniverseNavLevel;
  industryId: string;
  subdomainId?: string;
  companyId?: string;
  interiorMode?: string | null;
  insideBH?: boolean;
  cameraPosition: [number, number, number];
  cameraTarget: [number, number, number];
};

export type PersistedPlanetState = {
  companyId: string;
  companyName: string;
  role: string;
  referenceCompanyId?: string;
  insideRootPolytope: boolean;
  rootPolytopeDeptId: string | null;
  rootPolytopeInternalPath: string[];
  /** Stable fallback when root ids shift after template changes. */
  rootLabel?: string;
  internalPathLabels?: string[];
  industryColor?: string;
};

const STORAGE_KEY = 'universe3d_nav_state';
const PLANET_STORAGE_KEY = 'universe3d_planet_state';

export function saveUniverseNavState(state: PersistedUniverseNav | null): void {
  if (!state) {
    sessionStorage.removeItem(STORAGE_KEY);
    return;
  }
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function loadUniverseNavState(): PersistedUniverseNav | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedUniverseNav;
    if (!parsed?.level || !parsed?.industryId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearUniverseNavState(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}

export function savePlanetState(state: PersistedPlanetState | null): void {
  if (!state) {
    sessionStorage.removeItem(PLANET_STORAGE_KEY);
    return;
  }
  sessionStorage.setItem(PLANET_STORAGE_KEY, JSON.stringify(state));
}

export function loadPlanetState(): PersistedPlanetState | null {
  try {
    const raw = sessionStorage.getItem(PLANET_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedPlanetState;
  } catch {
    return null;
  }
}

export function clearPlanetState(): void {
  sessionStorage.removeItem(PLANET_STORAGE_KEY);
}
