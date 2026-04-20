/**
 * OrbitUI.tsx
 *
 * Canvas-based orbit placement UI for SyncBeats spatial audio.
 * Users drag their device node around a circle to reposition in 3D space.
 * When not playing, renders as a flat 2D circle. When playing, the CSS
 * parent applies a 3D perspective transform.
 */

"use client";

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { SpatialPosition, DeviceSpatialState } from '../audio/SpatialAudioEngine';

// ── Types ─────────────────────────────────────────────────────────────────────

interface OrbitUIProps {
  devices: DeviceSpatialState[];
  myDeviceId: string;
  onPositionChange: (deviceId: string, position: SpatialPosition) => void;
  /** Width of the canvas in CSS pixels. Height will match. Default 340 */
  size?: number;
  /** Display names map: deviceId → displayName */
  displayNames?: Record<string, string>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DEVICE_COLORS = [
  '#1ED760', '#ffffff', '#a1a1aa', '#4ade80',
  '#2dd4bf', '#94a3b8', '#cbd5e1',
];

function orbitToCanvas(
  pos: SpatialPosition,
  cx: number,
  cy: number,
  baseRadius: number
): { x: number; y: number } {
  const r = pos.radius * baseRadius;
  return {
    x: cx + Math.sin(pos.angle) * r,
    y: cy - Math.cos(pos.angle) * r,
  };
}

function canvasToOrbit(
  canvasX: number,
  canvasY: number,
  cx: number,
  cy: number,
  _baseRadius: number,
  currentRadius: number
): SpatialPosition {
  const dx = canvasX - cx;
  const dy = -(canvasY - cy);
  const angle = Math.atan2(dx, dy);
  return { angle, radius: currentRadius, elevation: 0 };
}

// ── Component ─────────────────────────────────────────────────────────────────

const OrbitUI: React.FC<OrbitUIProps> = ({
  devices,
  myDeviceId,
  onPositionChange,
  size = 340,
  displayNames = {},
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draggingRef = useRef<string | null>(null);
  const [hoveredDevice, setHoveredDevice] = useState<string | null>(null);

  const CX = size / 2;
  const CY = size / 2;
  const BASE_RADIUS = size * 0.38;
  const NODE_RADIUS = 20;

  // ── Drawing ─────────────────────────────────────────────────────────────

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const pr = window.devicePixelRatio || 1;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(pr, pr);

    // Detect dark mode
    const isDark = document.documentElement.classList.contains('dark') ||
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    const borderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
    const textColor = isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.8)';
    const accentColor = isDark ? '#ffffff' : '#000000';

    // Grid rings
    for (let r = BASE_RADIUS * 0.33; r <= BASE_RADIUS * 1.15; r += BASE_RADIUS * 0.33) {
      ctx.beginPath();
      ctx.arc(CX, CY, r, 0, Math.PI * 2);
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // Crosshair
    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(CX, 20); ctx.lineTo(CX, size - 20); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(20, CY); ctx.lineTo(size - 20, CY); ctx.stroke();
    ctx.setLineDash([]);

    // Direction labels
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.globalAlpha = 0.6;
    ctx.fillText('FRONT', CX, 14);
    ctx.fillText('BACK', CX, size - 6);
    ctx.textAlign = 'right';
    ctx.fillText('L', 14, CY + 4);
    ctx.textAlign = 'left';
    ctx.fillText('R', size - 14, CY + 4);
    ctx.globalAlpha = 1;

    // Orbit track (main ring)
    ctx.beginPath();
    ctx.arc(CX, CY, BASE_RADIUS, 0, Math.PI * 2);
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Connection lines + Device nodes
    devices.forEach(({ deviceId, position }, index) => {
      const p = orbitToCanvas(position, CX, CY, BASE_RADIUS);
      const color = DEVICE_COLORS[index % DEVICE_COLORS.length];
      const isMe = deviceId === myDeviceId;
      const isHovered = hoveredDevice === deviceId;
      const isDragging = draggingRef.current === deviceId;

      // Draw connection line from center to device
      ctx.beginPath();
      ctx.moveTo(CX, CY);
      ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = isMe ? color + 'a0' : color + '40';
      ctx.lineWidth = isMe ? 1.5 : 0.75;
      ctx.setLineDash(isMe ? [] : [3, 5]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Node
      const r = isDragging ? NODE_RADIUS + 4 : isHovered ? NODE_RADIUS + 2 : NODE_RADIUS;

      // Glow effect for own device
      if (isMe) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 6, 0, Math.PI * 2);
        const glow = ctx.createRadialGradient(p.x, p.y, r, p.x, p.y, r + 6);
        glow.addColorStop(0, color + '40');
        glow.addColorStop(1, color + '00');
        ctx.fillStyle = glow;
        ctx.fill();
      }

      // 3D Glassy Volumetric Node
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = isMe ? color : color + '40';
      ctx.fill();

      // Specular highlight to make it look like a 3D glass sphere
      const gloss = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.3, r * 0.1, p.x, p.y, r);
      gloss.addColorStop(0, 'rgba(255,255,255,0.9)');
      gloss.addColorStop(0.4, 'rgba(255,255,255,0.2)');
      gloss.addColorStop(1, 'rgba(255,255,255,0)');
      
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = gloss;
      ctx.fill();

      ctx.strokeStyle = isMe ? '#fff' : color;
      ctx.lineWidth = isMe ? 2 : 1.5;
      ctx.stroke();

      // Label inside node
      const label = displayNames[deviceId]
        ? displayNames[deviceId].slice(0, 2).toUpperCase()
        : (isMe ? 'YOU' : `D${index + 1}`);

      ctx.font = `${isMe ? 'bold ' : ''}11px system-ui, sans-serif`;
      ctx.fillStyle = isMe ? '#fff' : (isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)');
      ctx.textAlign = 'center';
      ctx.fillText(label, p.x, p.y + 4);

      // Angle indicator for own device
      if (isMe || isDragging) {
        const azDeg = Math.round(((position.angle * 180) / Math.PI + 360) % 360);
        ctx.font = '9px monospace';
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.fillText(`${azDeg}°`, p.x, p.y - r - 6);
      }
    });

    // Listener (center node)
    ctx.beginPath();
    ctx.arc(CX, CY, 22, 0, Math.PI * 2);
    ctx.fillStyle = isDark ? '#18181b' : '#ffffff';
    ctx.fill();
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Ear icon in center
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillStyle = accentColor;
    ctx.textAlign = 'center';
    ctx.fillText('👂', CX, CY + 5);

    ctx.restore();
  }, [devices, myDeviceId, hoveredDevice, CX, CY, BASE_RADIUS, size, displayNames]);

  // Re-draw whenever state changes
  useEffect(() => {
    draw();
  }, [draw]);

  // ── DPI-aware canvas setup ───────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pr = window.devicePixelRatio || 1;
    canvas.width = size * pr;
    canvas.height = size * pr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    draw();
  }, [size]); // Remove draw from dependencies so we don't reset canvas dims on every position update

  // ── Pointer events ───────────────────────────────────────────────────────

  const getCanvasPoint = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const touch = 'touches' in e ? e.touches[0] : e as React.MouseEvent;
    return {
      x: (touch.clientX - rect.left) * (size / rect.width),
      y: (touch.clientY - rect.top) * (size / rect.height),
    };
  };

  const hitTest = (pt: { x: number; y: number }): string | null => {
    for (const { deviceId, position } of devices) {
      const p = orbitToCanvas(position, CX, CY, BASE_RADIUS);
      const dx = pt.x - p.x, dy = pt.y - p.y;
      if (dx * dx + dy * dy <= NODE_RADIUS * NODE_RADIUS * 1.5) return deviceId;
    }
    return null;
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    const pt = getCanvasPoint(e);
    const hit = hitTest(pt);
    if (hit) {
      draggingRef.current = hit;
    }
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    const pt = getCanvasPoint(e);
    const draggingId = draggingRef.current;

    const hovered = hitTest(pt);
    setHoveredDevice(hovered);

    if (!draggingId) return;

    const device = devices.find(d => d.deviceId === draggingId);
    if (!device) return;

    const newPos = canvasToOrbit(pt.x, pt.y, CX, CY, BASE_RADIUS, device.position.radius);
    onPositionChange(draggingId, { ...newPos, elevation: device.position.elevation });
  };

  const handlePointerUp = () => {
    draggingRef.current = null;
  };

  return (
    <div style={{ display: 'inline-block', userSelect: 'none' }}>
      <canvas
        ref={canvasRef}
        style={{
          borderRadius: '50%',
          cursor: hoveredDevice ? 'grab' : 'default',
          touchAction: 'none',
        }}
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onMouseLeave={handlePointerUp}
        onTouchStart={handlePointerDown}
        onTouchMove={handlePointerMove}
        onTouchEnd={handlePointerUp}
      />
    </div>
  );
};

export default React.memo(OrbitUI);
