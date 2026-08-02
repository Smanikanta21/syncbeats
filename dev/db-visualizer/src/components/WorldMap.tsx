
"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { cn } from "@/lib/utils";

export interface GeoLocationItem {
  ip: string;
  country: string;
  countryCode: string;
  city: string;
  regionName?: string;
  lat: number;
  lon: number;
  isp?: string;
  flag: string;
  users?: { id: string; name: string; email: string; deviceName?: string }[];
}

interface WorldMapProps {
  locations: GeoLocationItem[];
}

export default function WorldMap({ locations }: WorldMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [hoveredPoint, setHoveredPoint] = useState<GeoLocationItem | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !mapContainerRef.current) return;

    // Dynamically import Leaflet to ensure SSR compatibility
    import("leaflet").then((L) => {
      // Fix default marker icon assets if needed
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      if (!mapInstanceRef.current && mapContainerRef.current) {
        // Initialize Leaflet Map centered on world view
        const map = L.map(mapContainerRef.current, {
          center: [20, 0],
          zoom: 2,
          minZoom: 2,
          maxZoom: 18,
          maxBounds: [[-85, -180], [85, 180]],
          maxBoundsViscosity: 1.0,
          zoomControl: true,
          scrollWheelZoom: true,
        });

        // Add CartoDB Dark Matter OpenStreetMap Tile Layer (Free, Accurate & Dark Mode)
        L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank">CARTO</a>',
          subdomains: "abcd",
          maxZoom: 19,
        }).addTo(map);

        mapInstanceRef.current = map;
      }

      const map = mapInstanceRef.current;

      // Clear existing markers
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      // Add custom glowing pulse markers for each location
      locations.forEach((loc) => {
        if (!loc.lat || !loc.lon) return;

        // Custom HTML DivIcon for glowing pinpoints
        const customIcon = L.divIcon({
          className: "custom-map-pin",
          html: `
            <div style="position: relative; width: 24px; height: 24px; display: flex; items-center: center; justify-content: center;">
              <span style="position: absolute; width: 24px; height: 24px; border-radius: 50%; background-color: rgba(16, 185, 129, 0.4); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></span>
              <span style="position: absolute; width: 12px; height: 12px; border-radius: 50%; background-color: #10b981; border: 2px solid #ffffff; box-shadow: 0 0 10px rgba(16, 185, 129, 0.8);"></span>
            </div>
          `,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });

        const usersHtml =
          loc.users && loc.users.length > 0
            ? loc.users.map((u) => `
                <div style="background: rgba(255,255,255,0.06); padding: 5px 8px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); margin-bottom: 4px;">
                  <div style="font-weight: 700; color: #ffffff; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${u.name}</div>
                  <div style="color: #a1a1aa; font-size: 10px; font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${u.email}</div>
                </div>
              `).join("")
            : `<div style="color: #a1a1aa; font-size: 11px;">IP: ${loc.ip}</div>`;

        const popupContent = `
          <div style="font-family: system-ui, sans-serif; padding: 4px; color: #f4f4f5; max-width: 250px; max-height: 220px; overflow-y: auto;">
            <div style="font-size: 13px; font-weight: bold; color: #10b981; margin-bottom: 4px; display: flex; items-center; justify-content: space-between;">
              <span>${loc.city || "Unknown City"}, ${loc.country}</span>
              <span>${loc.flag || "🌐"}</span>
            </div>
            <div style="font-size: 10px; color: #a1a1aa; font-family: monospace; margin-bottom: 6px;">
              IP: ${loc.ip} ${loc.isp ? "• " + loc.isp : ""}
            </div>
            <div style="border-top: 1px solid #27272a; padding-top: 6px;">
              ${usersHtml}
            </div>
          </div>
        `;

        const marker = L.marker([loc.lat, loc.lon], { icon: customIcon }).addTo(map);
        marker.bindPopup(popupContent, { className: "custom-leaflet-popup" });

        markersRef.current.push(marker);
      });

      // Fit bounds if locations exist
      if (locations.length > 1) {
        const bounds = L.latLngBounds(locations.map((l) => [l.lat, l.lon]));
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 6 });
      } else if (locations.length === 1) {
        map.setView([locations[0].lat, locations[0].lon], 5);
      }
    });
  }, [locations]);

  const handleResetZoom = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([20, 0], 2);
    }
  };

  return (
    <div className={cn('relative', 'w-full', 'bg-zinc-900/90', 'border', 'border-zinc-800/80', 'rounded-3xl', 'p-6', 'shadow-2xl', 'backdrop-blur-xl', 'overflow-hidden')}>
      {/* Header */}
      <div className={cn('flex', 'flex-col', 'sm:flex-row', 'sm:items-center', 'justify-between', 'gap-4', 'mb-6')}>
        <div>
          <div className={cn('flex', 'items-center', 'gap-2')}>
            <span className={cn('w-2.5', 'h-2.5', 'rounded-full', 'bg-emerald-500', 'animate-ping')} />
            <h3 className={cn('text-lg', 'font-bold', 'text-white', 'tracking-tight')}>Interactive OpenStreetMap World Visualizer</h3>
          </div>
          <p className={cn('text-xs', 'text-zinc-400', 'mt-1')}>High-accuracy OpenStreetMap CartoDB dark layer with zoom, pan, and live IP pinpoints</p>
        </div>

        <div className={cn('flex', 'items-center', 'gap-3')}>
          <button
            onClick={handleResetZoom}
            className={cn('px-3', 'py-1.5', 'bg-zinc-800', 'hover:bg-zinc-700', 'text-zinc-300', 'text-xs', 'font-semibold', 'rounded-xl', 'border', 'border-zinc-700', 'transition-colors', 'flex', 'items-center', 'gap-1.5')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            Reset View
          </button>
          <div className={cn('text-xs', 'font-mono', 'text-emerald-400', 'bg-emerald-500/10', 'border', 'border-emerald-500/20', 'px-3', 'py-1.5', 'rounded-xl', 'font-bold')}>
            {locations.length} Locations Plotted
          </div>
        </div>
      </div>

      {/* Leaflet Map Container */}
      <div className={cn('relative', 'w-full', 'h-[450px]', 'bg-zinc-950', 'rounded-2xl', 'border', 'border-zinc-800/80', 'overflow-hidden', 'shadow-inner', 'z-0')}>
        <div ref={mapContainerRef} className={cn('w-full', 'h-full')} />
      </div>

      {/* Location Cards list */}
      <div className={cn('mt-6', 'grid', 'grid-cols-2', 'sm:grid-cols-3', 'md:grid-cols-4', 'lg:grid-cols-6', 'gap-3')}>
        {locations.slice(0, 12).map((loc, idx) => (
          <div
            key={`card-${loc.ip}-${idx}`}
            onClick={() => {
              if (mapInstanceRef.current) {
                mapInstanceRef.current.setView([loc.lat, loc.lon], 8);
              }
            }}
            className={cn('p-3', 'bg-zinc-950/60', 'border', 'border-zinc-800/80', 'rounded-2xl', 'hover:border-emerald-500/40', 'hover:bg-zinc-950', 'transition-all', 'cursor-pointer', 'group')}
          >
            <div className={cn('flex', 'items-center', 'justify-between', 'mb-1')}>
              <span className={cn('p-1', 'rounded-lg', 'bg-zinc-900', 'border', 'border-zinc-800', 'text-emerald-400')}>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>
              </span>
              <span className={cn('text-[10px]', 'font-mono', 'text-zinc-500', 'truncate', 'max-w-[80px]')}>{loc.ip}</span>
            </div>
            <div className={cn('text-xs', 'font-bold', 'text-zinc-200', 'group-hover:text-emerald-400', 'truncate')}>{loc.city || loc.country}</div>
            <div className={cn('text-[10px]', 'text-zinc-400', 'truncate')}>{loc.country}</div>
          </div>
        ))}
      </div>

      {/* Global CSS overrides for Leaflet popups & dark background */}
      <style jsx global>{`
        .leaflet-container {
          background-color: #09090b !important;
          background: #09090b !important;
        }
        .leaflet-popup-content-wrapper {
          background-color: #18181b !important;
          border: 1px solid #27272a !important;
          border-radius: 12px !important;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5) !important;
        }
        .leaflet-popup-tip {
          background-color: #18181b !important;
        }
        .custom-leaflet-popup .leaflet-popup-content {
          margin: 10px 14px !important;
        }
        @keyframes ping {
          75%, 100% {
            transform: scale(2);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
