#!/bin/sh
# Builds the PlayVolt hub for Cloudflare Pages (project root: repository root,
# build command: sh build-hub.sh, output directory: hub-dist).
# Copies the hub and its static games. Dekabess (dominoes/) and Pin & Spin
# (pin-and-spin/) have their own Cloudflare Pages projects, so only their hub
# logos are copied here.
set -e
rm -rf hub-dist
mkdir -p hub-dist
cp index.html auth.js hub-dist/
for dir in whos-the-worst whos-the-worst-adult bluff rushing-blur soul-harvest riot-roll sounds; do
  [ -d "$dir" ] && cp -R "$dir" hub-dist/
done
rm -rf hub-dist/riot-roll/supabase
mkdir -p hub-dist/dominoes/public hub-dist/pin-and-spin/public
cp dominoes/public/dekabess-logo-lobby.webp hub-dist/dominoes/public/
cp pin-and-spin/public/pin-and-spin-logo.webp hub-dist/pin-and-spin/public/
echo "Hub built in hub-dist/"
