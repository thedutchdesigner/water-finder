#!/usr/bin/env bash
# build_tiles.sh - Generate vector tiles from fountains.json

set -e

# 1. Convert Overpass JSON to valid GeoJSON (requires osmtogeojson)
if ! command -v osmtogeojson &> /dev/null; then
  echo "Installing osmtogeojson..."
  npm install -g osmtogeojson
fi
echo "Converting fountains.json to fountains.geojson..."
osmtogeojson fountains.json > fountains.geojson

# 2. Build MBTiles using tippecanoe
echo "Building MBTiles..."
tippecanoe -o fountains.mbtiles --drop-densest-as-needed -Z0 -z16 fountains.geojson

# 3. Extract PBF tiles using mbutil
echo "Extracting PBF tiles..."
mb-util fountains.mbtiles tiles --image_format=pbf

# 4. Create tiles.json
echo "Writing tiles.json manifest..."
cat <<EOF > tiles.json
{
  "tilejson": "2.2.0",
  "name": "fountains",
  "version": "1.0.0",
  "scheme": "xyz",
  "tiles": [
    "https://<USERNAME>.github.io/<REPO_NAME>/tiles/{z}/{x}/{y}.pbf"
  ]
}
EOF

echo "Done! You can now commit fountains.geojson, tiles/ and tiles.json to your repo."
