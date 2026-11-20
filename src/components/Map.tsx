import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Bounty } from '../../shared/types';
import { rewardText } from '../lib/api';

export const AKOKA = { latitude: 6.5184, longitude: 3.3859 };

export function ScoutMap({ bounties, center = AKOKA, onSelect, onPick, selectedId, small = false }: {
  bounties: Bounty[]; center?: { latitude: number; longitude: number }; onSelect?: (id: string) => void;
  onPick?: (coordinates: { latitude: number; longitude: number }) => void; selectedId?: string | null; small?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef<L.LayerGroup | null>(null);
  const callbacks = useRef({ onSelect, onPick });
  callbacks.current = { onSelect, onPick };

  useEffect(() => {
    if (!container.current) return;
    const instance = L.map(container.current, { zoomControl: false, scrollWheelZoom: false, attributionControl: true, zoomAnimation: !window.matchMedia('(prefers-reduced-motion: reduce)').matches }).setView([center.latitude, center.longitude], 15);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(instance);
    L.control.zoom({ position: 'bottomright' }).addTo(instance);
    markers.current = L.layerGroup().addTo(instance);
    instance.on('click', (event: L.LeafletMouseEvent) => callbacks.current.onPick?.({ latitude: event.latlng.lat, longitude: event.latlng.lng }));
    map.current = instance;
    const observer = new ResizeObserver(() => instance.invalidateSize({ animate: false }));
    observer.observe(container.current);
    return () => { observer.disconnect(); instance.remove(); map.current = null; };
  }, []);

  useEffect(() => { map.current?.setView([center.latitude, center.longitude], map.current.getZoom(), { animate: false }); }, [center.latitude, center.longitude]);

  useEffect(() => {
    if (!markers.current) return;
    markers.current.clearLayers();
    for (const bounty of bounties) {
      const icon = L.divIcon({ className: 'map-bounty-marker', html: `<span class="map-price${selectedId === bounty.id ? ' map-price-selected' : ''}">${rewardText(bounty.reward)}<span> test</span></span>`, iconSize: [70, 36], iconAnchor: [35, 36] });
      const marker = L.marker([bounty.latitude, bounty.longitude], { icon, keyboard: true, title: bounty.title, alt: `${bounty.title}, ${rewardText(bounty.reward)} test tokens` });
      marker.on('click', () => callbacks.current.onSelect?.(bounty.id));
      marker.addTo(markers.current);
    }
    if (onPick) L.circleMarker([center.latitude, center.longitude], { radius: 8, color: '#164f40', fillColor: '#dceab6', fillOpacity: 1, weight: 3 }).addTo(markers.current);
  }, [bounties, selectedId, center.latitude, center.longitude, !!onPick]);

  return <div className={small ? 'map-container map-small' : 'map-container'} ref={container} role="region" aria-label={onPick ? 'Choose a place on the map' : 'Map of nearby checks'} />;
}
