// app.js - Incremental fetch & smart clustering to avoid heavy reloads on zoom out

document.addEventListener('DOMContentLoaded', () => {
  const mapEl = document.getElementById('map');
  const map = L.map(mapEl).setView([0, 0], 15);
  L.tileLayer(
    'https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png',
    { maxZoom: 19, attribution: '© OpenStreetMap contributors © CartoDB' }
  ).addTo(map);

  // MarkerClusterGroup with chunked loading
  const markers = L.markerClusterGroup({
    animate: true,
    animateAddingMarkers: true,
    chunkedLoading: true,
    chunkInterval: 80,
    removeOutsideVisibleBounds: true,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    disableClusteringAtZoom: 16,
    maxClusterRadius: z => z < 8 ? 150 : z < 12 ? 100 : z < 16 ? 50 : 30,
    iconCreateFunction: cluster => {
      const count = cluster.getChildCount();
      const label = count > 500 ? '500+' : count;
      const size = Math.max(30, Math.min(count * 2, 60));
      return L.divIcon({
        html: `<div class="cluster-icon" style="width:${size}px; height:${size}px; line-height:${size}px;">${label}</div>`,
        className: '',
        iconSize: [size, size]
      });
    }
  }).addTo(map);

  // Track loaded area
  let loadedBounds = null;
  const cache = new Map();

  // Helper to compute difference bounds
  function getDiffBounds(oldB, newB) {
    if (!oldB) return newB;
    const sw = L.latLng(
      Math.min(oldB.getSouth(), newB.getSouth()),
      Math.min(oldB.getWest(), newB.getWest())
    );
    const ne = L.latLng(
      Math.max(oldB.getNorth(), newB.getNorth()),
      Math.max(oldB.getEast(), newB.getEast())
    );
    // new area beyond old bounds
    const additions = [];
    // west strip
    if (newB.getWest() < oldB.getWest()) {
      additions.push(L.latLngBounds(
        L.latLng(newB.getSouth(), newB.getWest()),
        L.latLng(newB.getNorth(), oldB.getWest())
      ));
    }
    // east strip
    if (newB.getEast() > oldB.getEast()) {
      additions.push(L.latLngBounds(
        L.latLng(newB.getSouth(), oldB.getEast()),
        L.latLng(newB.getNorth(), newB.getEast())
      ));
    }
    // south strip
    if (newB.getSouth() < oldB.getSouth()) {
      additions.push(L.latLngBounds(
        L.latLng(newB.getSouth(), newB.getWest()),
        L.latLng(oldB.getSouth(), newB.getEast())
      ));
    }
    // north strip
    if (newB.getNorth() > oldB.getNorth()) {
      additions.push(L.latLngBounds(
        L.latLng(oldB.getNorth(), newB.getWest()),
        L.latLng(newB.getNorth(), newB.getEast())
      ));
    }
    return additions;
  }

  async function fetchFountains(bounds) {
    const q = `[out:json][timeout:20];
node["amenity"="drinking_water"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});
out center;`;
    const key = [bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getEast()]
      .map(v => v.toFixed(4)).join(',');
    if (cache.has(key)) return cache.get(key);
    const resp = await fetch('https://overpass-api.de/api/interpreter', { method:'POST', body:q });
    const data = await resp.json();
    cache.set(key, data.elements);
    return data.elements;
  }

  // Add points to cluster
  async function addPoints(bounds) {
    const points = await fetchFountains(bounds);
    points.forEach(pt => {
      const lat = pt.lat ?? pt.center?.lat, lon = pt.lon ?? pt.center?.lon;
      if (lat==null||lon==null) return;
      const icon = L.divIcon({ className:'circle-icon', iconSize:[16,16], iconAnchor:[8,8] });
      const m = L.marker([lat, lon], { icon })
        .on('click', () => {
          const url = /iP(hone|ad|od)/.test(navigator.platform)
            ? `maps://maps.apple.com/?daddr=${lat},${lon}`
            : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
          window.open(url,'_blank');
        });
      markers.addLayer(m);
    });
  }

  // Update clusters incrementally
  async function updateMarkers() {
    const newBounds = map.getBounds();
    if (!loadedBounds) {
      // initial load: entire view
      await addPoints(newBounds);
      loadedBounds = newBounds;
    } else {
      // fetch only diff strips
      const diffs = getDiffBounds(loadedBounds, newBounds);
      for (const b of diffs) {
        await addPoints(b);
      }
      // update loadedBounds to union
      loadedBounds = loadedBounds.extend([newBounds.getSouthWest(), newBounds.getNorthEast()]);
    }
  }

  // Map events
  map.locate({ setView:true, maxZoom:16 });
  map.on('locationfound', e => {
    L.circleMarker(e.latlng, { radius:6, fillColor:'blue', fillOpacity:0.9, color:null }).addTo(map);
    updateMarkers();
  });
  map.on('moveend zoomend', () => updateMarkers());

  // AR toggle ... (unchanged)
});