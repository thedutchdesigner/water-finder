document.addEventListener('DOMContentLoaded', () => {
  const map = L.map('map').setView([0, 0], 15);
  L.tileLayer('https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap contributors © CartoDB'
  }).addTo(map);

  const markers = L.markerClusterGroup({
    animate: true,
    animateAddingMarkers: true,
    chunkedLoading: true,
    chunkInterval: 80,
    removeOutsideVisibleBounds: true,
    spiderfyOnMaxZoom: true,
    disableClusteringAtZoom: 18,
    maxClusterRadius: zoom => zoom < 10 ? 150 : zoom < 14 ? 100 : 50,
    iconCreateFunction: cluster => {
      const count = cluster.getChildCount();
      const label = count > 500 ? '500+' : count;
      const size = Math.max(30, Math.min(count * 2, 60));
      return L.divIcon({
        html: `<div class="cluster-icon" style="width:${size}px;height:${size}px;line-height:${size}px;">${label}</div>`,
        iconSize: [size, size]
      });
    }
  }).addTo(map);

  const cache = new Map();
  let loadedBounds = null;

  // Compute areas not yet loaded
  function getDiffBounds(oldB, newB) {
    if (!oldB) return [newB];
    const diffs = [];
    // West strip
    if (newB.getWest() < oldB.getWest()) {
      diffs.push(L.latLngBounds(
        [newB.getSouth(), newB.getWest()],
        [newB.getNorth(), oldB.getWest()]
      ));
    }
    // East strip
    if (newB.getEast() > oldB.getEast()) {
      diffs.push(L.latLngBounds(
        [newB.getSouth(), oldB.getEast()],
        [newB.getNorth(), newB.getEast()]
      ));
    }
    // South strip
    if (newB.getSouth() < oldB.getSouth()) {
      diffs.push(L.latLngBounds(
        [newB.getSouth(), newB.getWest()],
        [oldB.getSouth(), newB.getEast()]
      ));
    }
    // North strip
    if (newB.getNorth() > oldB.getNorth()) {
      diffs.push(L.latLngBounds(
        [oldB.getNorth(), newB.getWest()],
        [newB.getNorth(), newB.getEast()]
      ));
    }
    return diffs;
  }

  async function fetchFountains(bounds) {
    const key = [bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getEast()]
                .map(v => v.toFixed(4)).join(',');
    if (cache.has(key)) return cache.get(key);
    const query = \`[out:json][timeout:15];
node["amenity"="drinking_water"](\${bounds.getSouth()},\${bounds.getWest()},\${bounds.getNorth()},\${bounds.getEast()});
out center;\`;
    const resp = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST', body: query
    });
    const data = await resp.json();
    cache.set(key, data.elements);
    return data.elements;
  }

  async function addPoints(bounds) {
    const pts = await fetchFountains(bounds);
    pts.forEach(pt => {
      const lat = pt.lat ?? pt.center?.lat;
      const lon = pt.lon ?? pt.center?.lon;
      if (lat == null || lon == null) return;
      const icon = L.divIcon({ className: 'circle-icon', iconSize: [16,16], iconAnchor: [8,8] });
      L.marker([lat, lon], { icon })
       .on('click', () => {
         const url = /iP(hone|ad|od)/.test(navigator.platform)
           ? \`maps://maps.apple.com/?daddr=\${lat},\${lon}\`
           : \`https://www.google.com/maps/dir/?api=1&destination=\${lat},\${lon}\`;
         window.open(url, '_blank');
       })
       .addTo(markers);
    });
  }

  async function updateMarkers() {
    const b = map.getBounds();
    if (!loadedBounds) {
      // initial full fetch
      await addPoints(b);
      loadedBounds = b;
    } else {
      // fetch only new strips
      const diffs = getDiffBounds(loadedBounds, b);
      for (const strip of diffs) {
        await addPoints(strip);
      }
      // extend loadedBounds
      loadedBounds = loadedBounds.extend([b.getSouthWest(), b.getNorthEast()]);
    }
  }

  map.locate({ setView: true, maxZoom: 16 });
  map.on('locationfound', e => {
    L.circleMarker(e.latlng, { radius:6, fillColor:'blue', fillOpacity:0.9, color:null }).addTo(map);
    updateMarkers();
  });
  map.on('moveend zoomend', updateMarkers);

  // AR button logic
  const arBtn=document.getElementById('ar-button'),
        arView=document.getElementById('ar-view'),
        exitBtn=document.getElementById('exit-ar'),
        video=document.getElementById('ar-video');
  let stream;
  arBtn.addEventListener('click', async () => {
    document.getElementById('map').style.display='none';
    arBtn.style.display='none';
    arView.style.display='block';
    try {
      stream=await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment'} });
      video.srcObject=stream; await video.play();
    } catch {
      alert('Camera unavailable');
      exitAR();
    }
  });
  exitBtn.addEventListener('click', exitAR);
  function exitAR(){
    if (stream) stream.getTracks().forEach(t=>t.stop());
    arView.style.display='none';
    document.getElementById('map').style.display='block';
    arBtn.style.display='block';
  }
});
