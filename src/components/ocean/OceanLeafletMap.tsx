import { useEffect, useRef } from "react";
import type { NOAA_STATIONS, NoaaStation } from "@/lib/noaa-api";

interface OceanLeafletMapProps {
  stations: readonly NoaaStation[] | NoaaStation[];
  selectedStationId: string;
  onStationSelect: (station: NoaaStation) => void;
  stationName?: string;
}

/**
 * Interactive world ocean map using Leaflet.js with:
 * - Ocean-themed dark tile layer (CartoDB Dark Matter)
 * - NOAA buoy station markers with custom colors
 * - Clickable station pins with popup info
 * - Auto-pans to selected station
 */
export function OceanLeafletMap({
  stations,
  selectedStationId,
  onStationSelect,
  stationName,
}: OceanLeafletMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markersRef = useRef<Map<string, import("leaflet").Marker>>(new Map());
  const selectedIdRef = useRef(selectedStationId);
  selectedIdRef.current = selectedStationId;

  useEffect(() => {
    let L: typeof import("leaflet");

    const initMap = async () => {
      if (!mapContainerRef.current || mapRef.current) return;

      L = (await import("leaflet")).default;

      // Fix default icon path issue with bundlers
      (L.Icon.Default.prototype as unknown as Record<string, unknown>)["_getIconUrl"] = undefined;
      delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)["_getIconUrl"];
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(mapContainerRef.current, {
        center: [20, -30],
        zoom: 2,
        minZoom: 1,
        maxZoom: 10,
        zoomControl: true,
        attributionControl: true,
      });

      mapRef.current = map;

      // Ocean-themed dark tile layer
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 20,
      }).addTo(map);

      // Add stations as markers
      stations.forEach((station: NoaaStation) => {
        const isSelected = station.id === selectedIdRef.current;

        const icon = L.divIcon({
          className: "",
          html: `<div style="
            width: ${isSelected ? "18px" : "12px"};
            height: ${isSelected ? "18px" : "12px"};
            border-radius: 50%;
            background: ${isSelected ? "linear-gradient(135deg,#06b6d4,#0ea5e9)" : "rgba(6,182,212,0.5)"};
            border: 2px solid ${isSelected ? "#06b6d4" : "rgba(6,182,212,0.3)"};
            box-shadow: ${isSelected ? "0 0 12px rgba(6,182,212,0.8)" : "0 0 4px rgba(6,182,212,0.4)"};
            transition: all 0.2s;
            cursor: pointer;
          "></div>`,
          iconSize: [isSelected ? 18 : 12, isSelected ? 18 : 12],
          iconAnchor: [isSelected ? 9 : 6, isSelected ? 9 : 6],
        });

        const marker = L.marker([station.lat, station.lon], { icon })
          .addTo(map)
          .bindPopup(
            `<div style="font-family:'DM Sans',sans-serif;min-width:180px;">
              <p style="font-weight:700;font-size:13px;margin-bottom:4px;">${station.name}</p>
              <p style="color:#64748b;font-size:11px;margin-bottom:2px;">ID: ${station.id} · ${station.oceanBasin}</p>
              <p style="color:#64748b;font-size:11px;margin-bottom:6px;">${station.region}</p>
              <p style="font-size:11px;">📍 ${station.lat.toFixed(3)}°N, ${Math.abs(station.lon).toFixed(3)}°${station.lon < 0 ? "W" : "E"}</p>
            </div>`,
            {
              closeButton: false,
              className: "leaflet-ocean-popup",
            },
          )
          .on("click", () => {
            onStationSelect(station);
          });

        markersRef.current.set(station.id, marker);

        if (isSelected) {
          map.setView([station.lat, station.lon], 4, { animate: true });
          marker.openPopup();
        }
      });
    };

    initMap();

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
  }, []); // Only initialize once

  // Update markers when selected station changes
  useEffect(() => {
    if (!mapRef.current) return;

    (async () => {
      const L = (await import("leaflet")).default;

      markersRef.current.forEach((marker, id) => {
        const isSelected = id === selectedStationId;
        const station = stations.find((s: NoaaStation) => s.id === id);
        if (!station) return;

        const icon = L.divIcon({
          className: "",
          html: `<div style="
            width: ${isSelected ? "18px" : "12px"};
            height: ${isSelected ? "18px" : "12px"};
            border-radius: 50%;
            background: ${isSelected ? "linear-gradient(135deg,#06b6d4,#0ea5e9)" : "rgba(6,182,212,0.5)"};
            border: 2px solid ${isSelected ? "#06b6d4" : "rgba(6,182,212,0.3)"};
            box-shadow: ${isSelected ? "0 0 12px rgba(6,182,212,0.8)" : "0 0 4px rgba(6,182,212,0.4)"};
            transition: all 0.2s;
            cursor: pointer;
          "></div>`,
          iconSize: [isSelected ? 18 : 12, isSelected ? 18 : 12],
          iconAnchor: [isSelected ? 9 : 6, isSelected ? 9 : 6],
        });
        marker.setIcon(icon);

        if (isSelected) {
          mapRef.current?.flyTo([station.lat, station.lon], 5, { animate: true, duration: 1.2 });
          marker.openPopup();
        }
      });
    })();
  }, [selectedStationId, stations]);

  return (
    <>
      {/* Inject Leaflet CSS */}
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        crossOrigin=""
      />
      <style>{`
        .leaflet-ocean-popup .leaflet-popup-content-wrapper {
          background: rgba(10,15,26,0.95);
          border: 1px solid rgba(6,182,212,0.3);
          border-radius: 12px;
          color: #e2e8f0;
          backdrop-filter: blur(12px);
          box-shadow: 0 4px 24px rgba(0,0,0,0.5);
        }
        .leaflet-ocean-popup .leaflet-popup-tip {
          background: rgba(10,15,26,0.95);
        }
        .leaflet-container {
          background: #0a1628;
          font-family: 'DM Sans', sans-serif;
        }
        .leaflet-control-attribution {
          background: rgba(10,15,26,0.7) !important;
          color: #475569 !important;
        }
        .leaflet-control-attribution a {
          color: #06b6d4 !important;
        }
        .leaflet-bar a {
          background: rgba(10,15,26,0.9) !important;
          color: #e2e8f0 !important;
          border-color: rgba(6,182,212,0.3) !important;
        }
        .leaflet-bar a:hover {
          background: rgba(6,182,212,0.15) !important;
        }
      `}</style>
      <div
        ref={mapContainerRef}
        className="relative w-full overflow-hidden rounded-2xl"
        style={{ height: "320px" }}
        aria-label="Interactive NOAA ocean station map"
      />
      <div className="glass absolute bottom-3 left-3 flex items-center gap-2 rounded-xl px-3 py-2 text-xs pointer-events-none">
        <span className="size-2 animate-pulse rounded-full bg-sea-green" />
        <span>{stationName || "Station"} · NOAA Live</span>
      </div>
    </>
  );
}
