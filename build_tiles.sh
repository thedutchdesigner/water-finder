#!/usr/bin/env bash
# build_tiles.sh - Generate vector tiles from fountains.geojson

set -e

# 1. Check for fountains.geojson
if [ ! -f fountains.geojson ]; then
  echo "Error: fountains.geojson not found!"
  exit 1
fi

# 2. Copy input to cleaned.geojson
echo "Using fountains.geojson as input..."
cp fountains.geojson cleaned.geojson

# 3. Build MBTiles (force overwrite)
echo "Building MBTiles..."
tippecanoe --force -o fountains.mbtiles --drop-densest-as-needed -Z0 -z16 cleaned.geojson

# 4. Extract PBF tiles into tiles/
echo "Extracting PBF tiles..."
rm -rf tiles fountains.mbtiles
mb-util fountains.mbtiles tiles --image_format=pbf

# 5. Write tiles.json manifest
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

echo "Done! Now run: git add cleaned.geojson tiles tiles.json && git commit -m 'Update vector tiles' && git push"
