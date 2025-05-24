// cluster-worker.js - Web Worker for Supercluster indexing and querying
importScripts('https://unpkg.com/supercluster@7.1.4/dist/supercluster.min.js');

let index = null;

// Handle messages from main thread
onmessage = (e) => {
  const { type, data, bbox, zoom } = e.data;

  if (type === 'load') {
    // data: array of {lat, lon}
    const features = data.map(f => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [f.lon, f.lat] }
    }));
    index = new Supercluster({
      radius: 60,
      maxZoom: 16,
      initial: function() {},
      map: function(props) {},
      reduce: function(accumulated, props) {}
    });
    index.load(features);
    postMessage({ type: 'loaded' });
  } else if (type === 'getClusters' && index) {
    // bbox: [west, south, east, north], zoom: integer
    const clusters = index.getClusters(bbox, zoom);
    postMessage({ type: 'clusters', clusters });
  }
};
