#!/data/data/com.termux/files/usr/bin/bash
set -e
ZIP="flutter_fixes_v2.zip"
GIT="/data/data/com.termux/files/home/storage/git/main/china-trip-bookings"
TMP="/data/data/com.termux/files/home/tmp_deploy_flutter_fixes"

cd ~/storage/downloads
mkdir -p "$TMP"
unzip -o "$ZIP" -d "$TMP"
cp -r "$TMP"/. "$GIT"/
cd "$GIT"
git add -A
git commit -m "fix: flutter compile errors (withOpacity, string compare, Todo.toJson)"
git push
rm -rf "$TMP"
echo "Done!"
