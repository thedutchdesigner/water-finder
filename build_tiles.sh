#!/usr/bin/env bash
# build_tiles.sh - Generate vector tiles from fountains.geojson

set -e

# Check for fountains.geojson
if [ ! -f fountains.geojson ]; then
  echo "Error: fountains.geojson not found!"
  exit 1
fi

# Prepare cleaned.geojson
echo "Using fountains.geojson as input..."
cp fountains.geojson cleaned.geojson

# Build MBTiles using tippecanoe
echo "Building MBTiles..."
tippecanoe -o fountains.mbtiles --drop-densest-as-needed -Z0 -z16 cleaned.geojson

# Extract PBF tiles into tiles/ directory
echo "Extracting PBF tiles..."
rm -rf tiles
mb-util fountains.mbtiles tiles --image_format=pbf

# Create tiles.json manifest
echo "Writing tiles.json manifest..."
cat <<EOF > tiles.json
{
  "tilejson": "2.2.0",
  "name": "fountains",
  "version": "1.0.0",
  "scheme": "xyz",
  "tiles": [
    "https://<YOUR_USERNAME>.github.io/<YOUR_REPO_NAME>/tiles/{z}/{x}/{y}.pbf"
  ]
}
EOF

echo "Done! Now commit fountains.geojson, cleaned.geojson, tiles, tiles.json"
