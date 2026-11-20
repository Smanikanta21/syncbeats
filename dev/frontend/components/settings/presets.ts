import type { GradientNode } from "../../hooks/useSettings";

export const DEFAULT_NODE_POSITIONS: Record<number, { x: number; y: number }[]> = {
  2: [
    { x: 25, y: 45 },
    { x: 75, y: 45 },
  ],
  3: [
    { x: 20, y: 35 },
    { x: 80, y: 35 },
    { x: 50, y: 75 },
  ],
  4: [
    { x: 20, y: 30 },
    { x: 80, y: 30 },
    { x: 20, y: 70 },
    { x: 80, y: 70 },
  ],
  5: [
    { x: 15, y: 25 },
    { x: 85, y: 25 },
    { x: 50, y: 50 },
    { x: 20, y: 75 },
    { x: 85, y: 75 },
  ],
  6: [
    { x: 50, y: 12 },
    { x: 18, y: 35 },
    { x: 18, y: 65 },
    { x: 82, y: 35 },
    { x: 82, y: 65 },
    { x: 50, y: 88 },
  ],
};

export const AUDIO_BAND_NAMES: Record<number, string[]> = {
  2: ["Bass", "Treble"],
  3: ["Bass", "Mids", "Treble"],
  4: ["Sub Bass", "Low Mids", "Upper Mids", "Treble"],
  5: ["Sub Bass", "Punch Bass", "Warm Mids", "Vocal Lead", "Treble"],
  6: ["Sub Bass", "Bass", "Low Mids", "Mids", "Upper Mids", "Highs"],
};

export const GRADIENT_PRESETS: Record<number, { name: string; nodes: GradientNode[] }[]> = {
  2: [
    { name: "Electric Violet", nodes: [{ id: "n1", color: "#8b5cf6", position: 0 }, { id: "n2", color: "#3b82f6", position: 100 }] },
    { name: "Solar Flare", nodes: [{ id: "n1", color: "#f97316", position: 0 }, { id: "n2", color: "#ef4444", position: 100 }] },
    { name: "Emerald Mist", nodes: [{ id: "n1", color: "#10b981", position: 0 }, { id: "n2", color: "#06b6d4", position: 100 }] },
    { name: "Synth Wave", nodes: [{ id: "n1", color: "#a855f7", position: 0 }, { id: "n2", color: "#ec4899", position: 100 }] },
  ],
  3: [
    { name: "Cyber Neon", nodes: [{ id: "n1", color: "#8b5cf6", position: 0 }, { id: "n2", color: "#ec4899", position: 50 }, { id: "n3", color: "#3b82f6", position: 100 }] },
    { name: "Aurora Borealis", nodes: [{ id: "n1", color: "#10b981", position: 0 }, { id: "n2", color: "#06b6d4", position: 50 }, { id: "n3", color: "#8b5cf6", position: 100 }] },
    { name: "Sunset Flare", nodes: [{ id: "n1", color: "#f97316", position: 0 }, { id: "n2", color: "#ef4444", position: 50 }, { id: "n3", color: "#a855f7", position: 100 }] },
    { name: "Deep Ocean", nodes: [{ id: "n1", color: "#0284c7", position: 0 }, { id: "n2", color: "#3b82f6", position: 50 }, { id: "n3", color: "#6366f1", position: 100 }] },
  ],
  4: [
    { name: "Spectrum Prism", nodes: [{ id: "n1", color: "#ef4444", position: 0 }, { id: "n2", color: "#f59e0b", position: 33 }, { id: "n3", color: "#10b981", position: 66 }, { id: "n4", color: "#3b82f6", position: 100 }] },
    { name: "Hyperdrive", nodes: [{ id: "n1", color: "#ec4899", position: 0 }, { id: "n2", color: "#8b5cf6", position: 33 }, { id: "n3", color: "#3b82f6", position: 66 }, { id: "n4", color: "#06b6d4", position: 100 }] },
    { name: "Forest Glow", nodes: [{ id: "n1", color: "#059669", position: 0 }, { id: "n2", color: "#10b981", position: 33 }, { id: "n3", color: "#84cc16", position: 66 }, { id: "n4", color: "#eab308", position: 100 }] },
    { name: "Magma Core", nodes: [{ id: "n1", color: "#991b1b", position: 0 }, { id: "n2", color: "#dc2626", position: 33 }, { id: "n3", color: "#f97316", position: 66 }, { id: "n4", color: "#fbbf24", position: 100 }] },
  ],
  5: [
    { name: "Tokyo Neon", nodes: [{ id: "n1", color: "#f43f5e", position: 0 }, { id: "n2", color: "#d946ef", position: 25 }, { id: "n3", color: "#8b5cf6", position: 50 }, { id: "n4", color: "#06b6d4", position: 75 }, { id: "n5", color: "#10b981", position: 100 }] },
    { name: "Galaxy Cosmos", nodes: [{ id: "n1", color: "#4c1d95", position: 0 }, { id: "n2", color: "#7c3aed", position: 25 }, { id: "n3", color: "#2563eb", position: 50 }, { id: "n4", color: "#0d9488", position: 75 }, { id: "n5", color: "#059669", position: 100 }] },
    { name: "Golden Horizon", nodes: [{ id: "n1", color: "#7c2d12", position: 0 }, { id: "n2", color: "#c2410c", position: 25 }, { id: "n3", color: "#ea580c", position: 50 }, { id: "n4", color: "#f59e0b", position: 75 }, { id: "n5", color: "#fef08a", position: 100 }] },
  ],
  6: [
    { name: "Full Spectrum", nodes: [{ id: "n1", color: "#ef4444", position: 0 }, { id: "n2", color: "#f97316", position: 20 }, { id: "n3", color: "#eab308", position: 40 }, { id: "n4", color: "#10b981", position: 60 }, { id: "n5", color: "#3b82f6", position: 80 }, { id: "n6", color: "#a855f7", position: 100 }] },
    { name: "Neon Hex", nodes: [{ id: "n1", color: "#f43f5e", position: 0 }, { id: "n2", color: "#d946ef", position: 20 }, { id: "n3", color: "#8b5cf6", position: 40 }, { id: "n4", color: "#06b6d4", position: 60 }, { id: "n5", color: "#10b981", position: 80 }, { id: "n6", color: "#84cc16", position: 100 }] },
    { name: "Cosmic Array", nodes: [{ id: "n1", color: "#1e1b4b", position: 0 }, { id: "n2", color: "#4c1d95", position: 20 }, { id: "n3", color: "#7c3aed", position: 40 }, { id: "n4", color: "#ec4899", position: 60 }, { id: "n5", color: "#f97316", position: 80 }, { id: "n6", color: "#fbbf24", position: 100 }] },
  ],
};

// The existing preset grid falls back to three colors for six-color layouts.
export function getVisiblePresets(count: number) {
  return GRADIENT_PRESETS[count === 6 ? 3 : count] || GRADIENT_PRESETS[3];
}
