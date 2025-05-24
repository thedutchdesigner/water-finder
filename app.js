// app.js - Revised AR.js integration with static scene

document.addEventListener('DOMContentLoaded', () => {
  // Leaflet map setup...
  const mapDiv = document.getElementById('map');
  const map = L.map(mapDiv).setView([0,0],2);
  L.tileLayer(
    'https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png',
    { maxZoom:19, attribution:'© OpenStreetMap contributors © CartoDB' }
  ).addTo(map);
  const markersCluster = L.markerClusterGroup({ maxClusterRadius:50 }).addTo(map);

  // Fetch fountains logic...
  let locationMarker;
  map.locate({ setView:true, maxZoom:16 });
  map.on('locationfound', e => {
    if(locationMarker) map.removeLayer(locationMarker);
    locationMarker = L.circleMarker(e.latlng,{radius:8,color:'blue'}).addTo(map);
    fetchNearby(e.latlng.lat,e.latlng.lng,1000);
  });

  map.on('locationerror', ()=>console.error('Location error'));
  let fetchTimeout;
  const bboxCache = new Map();
  map.on('moveend', ()=>{
    clearTimeout(fetchTimeout);
    fetchTimeout = setTimeout(()=>{
      const b = map.getBounds();
      const key = [b.getSouth(),b.getWest(),b.getNorth(),b.getEast()]
        .map(v=>v.toFixed(3)).join(',');
      if(bboxCache.has(key)) renderMarkers(bboxCache.get(key));
      else fetchFountains(b,key);
    },500);
  });

  async function fetchNearby(lat,lon,radius){
    const q = \`[out:json][timeout:15];node["amenity"="drinking_water"](around:\${radius},\${lat},\${lon});out center;\`;
    try{let r=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',body:q});
      let d=await r.json();renderMarkers(d.elements);
    }catch(e){console.error(e);}
  }
  async function fetchFountains(bounds,key){
    const q = \`[out:json][timeout:25];(\`+
      \`node["amenity"="drinking_water"](\${bounds.getSouth()},\${bounds.getWest()},\${bounds.getNorth()},\${bounds.getEast()});\`+
      \`way["amenity"="drinking_water"](\${bounds.getSouth()},\${bounds.getWest()},\${bounds.getNorth()},\${bounds.getEast()});\`+
      \`relation["amenity"="drinking_water"](\${bounds.getSouth()},\${bounds.getWest()},\${bounds.getNorth()},\${bounds.getEast()});\`+
      \`);out center;\`;
    try{let r=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',body:q});
      let d=await r.json();bboxCache.set(key,d.elements);renderMarkers(d.elements);
    }catch(e){console.error(e);}
  }
  function renderMarkers(el){markersCluster.clearLayers();
    window._fountains = el;el.forEach(f=>{
      let lat=f.lat||f.center&&f.center.lat,lon=f.lon||f.center&&f.center.lon;
      if(!lat||!lon)return;
      markersCluster.addLayer(L.marker([lat,lon]).bindPopup(
        \`<strong>\${f.tags&&f.tags.name||'Drinking water'}</strong><br/><button onclick="navigate(\${lat},\${lon})">Navigate</button>\`
      ));
    });
  }
  window.navigate=(lat,lon)=>{
    const url = /iP(hone|ad|od)/.test(navigator.platform)
      ? \`maps://maps.apple.com/?daddr=\${lat},\${lon}\`
      : \`https://www.google.com/maps/dir/?api=1&destination=\${lat},\${lon}\`;
    window.open(url,'_blank');
  };

  // AR toggling
  const arBtn=document.getElementById('ar-button');
  const arContainer=document.getElementById('arSceneContainer');
  const exitBtn=document.getElementById('ar-exit-button');
  const scene=document.getElementById('ar-scene');

  arBtn.addEventListener('click',()=>{
    mapDiv.style.display='none';arBtn.style.display='none';arContainer.style.display='block';exitBtn.style.display='block';
    // create entities
    (window._fountains||[]).forEach(f=>{
      let lat=f.lat||f.center&&f.center.lat,lon=f.lon||f.center&&f.center.lon;
      if(!lat||!lon)return;
      const e=document.createElement('a-entity');
      e.setAttribute('gps-entity-place',\`latitude:\${lat};longitude:\${lon};\`);
      e.setAttribute('geometry','primitive: cone; radiusBottom:0; radiusTop:1; height:2');
      e.setAttribute('material','color:blue;opacity:0.8');
      e.setAttribute('look-at','[gps-camera]');
      e.classList.add('ar-fountain');
      scene.appendChild(e);
    });
  });
  exitBtn.addEventListener('click',()=>{
    mapDiv.style.display='block';arBtn.style.display='block';arContainer.style.display='none';exitBtn.style.display='none';
    scene.querySelectorAll('.ar-fountain').forEach(el=>el.remove());
  });
});
