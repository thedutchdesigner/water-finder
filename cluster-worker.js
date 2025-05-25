// cluster-worker.js - Web Worker for Supercluster

importScripts('https://unpkg.com/supercluster@7.1.4/dist/supercluster.min.js');
let index = null;

onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'load') {
    const features = msg.data.map(f => ({
      type: 'Feature', properties:{}, 
      geometry:{ type:'Point', coordinates:[f.lon, f.lat] }
    }));
    index = new Supercluster({ radius: 80, maxZoom: 18 });
    index.load(features);
    postMessage({ type: 'loaded' });
  } else if (msg.type === 'getClusters' && index) {
    const clusters = index.getClusters(msg.bbox, msg.zoom);
    postMessage({ type: 'clusters', clusters });
  }
};
