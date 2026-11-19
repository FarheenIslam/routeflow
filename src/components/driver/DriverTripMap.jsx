import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const BANGLADESH_CENTER = [23.8103, 90.4125];

/**
 * Leaflet map for one driver trip.
 *
 * It draws what the database actually knows: route origin, stops and
 * destination coordinates, plus the last *manually reported* driver position.
 * There is no GPS feed, so the bus marker is labelled with its report time and
 * never animated or interpolated.
 */
export default function DriverTripMap({ trip, t, language }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const overlayRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;

    const map = L.map(containerRef.current, {
      scrollWheelZoom: false,
      attributionControl: true,
    }).setView(BANGLADESH_CENTER, 7);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    mapRef.current = map;
    overlayRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const overlay = overlayRef.current;
    if (!map || !overlay) return;

    overlay.clearLayers();

    const route = trip?.route;
    if (!route) return;

    const points = [];
    const addPoint = (place, label, kind) => {
      if (typeof place?.lat !== 'number' || typeof place?.lng !== 'number') return;
      points.push([place.lat, place.lng]);
      L.circleMarker([place.lat, place.lng], {
        radius: kind === 'stop' ? 5 : 7,
        color: kind === 'origin' ? '#0f766e' : kind === 'destination' ? '#b45309' : '#475569',
        weight: 2,
        fillColor: '#ffffff',
        fillOpacity: 1,
      })
        .bindTooltip(label, { direction: 'top' })
        .addTo(overlay);
    };

    addPoint(route.origin, `${t('driver.map.origin')}: ${route.origin?.name ?? ''}`, 'origin');
    (route.stops ?? []).forEach((stop) => addPoint(stop, stop.name, 'stop'));
    addPoint(
      route.destination,
      `${t('driver.map.destination')}: ${route.destination?.name ?? ''}`,
      'destination',
    );

    if (points.length >= 2) {
      L.polyline(points, { color: '#0f766e', weight: 3, opacity: 0.7 }).addTo(overlay);
      map.fitBounds(points, { padding: [30, 30] });
    } else if (points.length === 1) {
      map.setView(points[0], 10);
    } else {
      map.setView(BANGLADESH_CENTER, 7);
    }

    const last = trip.lastLocation;
    if (last && Number.isFinite(last.lat) && Number.isFinite(last.lng)) {
      L.circleMarker([last.lat, last.lng], {
        radius: 9,
        color: '#b91c1c',
        weight: 3,
        fillColor: '#ef4444',
        fillOpacity: 0.9,
      })
        .bindPopup(
          `${t('driver.map.lastReported')}<br/>${new Date(last.reportedAt).toLocaleString(
            language === 'bn' ? 'bn-BD' : 'en-GB',
          )}<br/><span style="font-size:11px">${t('driver.map.manual')}</span>`,
        )
        .addTo(overlay);
    }
  }, [trip, t, language]);

  return (
    <div className="relative">
      <div ref={containerRef} className="h-64 w-full rounded-lg border border-line" />
      {!trip?.lastLocation && (
        <span className="pointer-events-none absolute left-3 top-3 z-[400] rounded-full bg-surface/95 px-2.5 py-1 text-xs font-medium text-ink-muted shadow-sm">
          {t('driver.map.noReport')}
        </span>
      )}
    </div>
  );
}
