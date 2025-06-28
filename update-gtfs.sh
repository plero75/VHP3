#!/bin/bash
set -e

echo "📥 Téléchargement du dernier GTFS IDFM..."
wget -O gtfs.zip "https://data.iledefrance-mobilites.fr/explore/dataset/gtfs-idfm/files/"

echo "📦 Décompression du GTFS..."
unzip -o gtfs.zip -d ./gtfs

echo "📝 Exécution du script de parsing..."
node parse-gtfs.js

echo "✅ Mise à jour terminée : public/gtfs-info.json est prêt."