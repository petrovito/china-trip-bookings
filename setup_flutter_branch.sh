#!/data/data/com.termux/files/usr/bin/bash
# ── China Trip — Flutter Frontend Branch Setup ───────────────────────────────
# Pure git — no Flutter needed on Termux.
# GH Actions handles flutter create (bootstrap) and APK builds.
# ─────────────────────────────────────────────────────────────────────────────
set -e

ZIP="flutter_v2.zip"
GIT="$HOME/storage/git/main/china-trip-bookings"
TMP="$HOME/tmp_flutter_setup"

echo "=== 1 / 3  Creating flutter-frontend branch from go-backend..."
cd "$GIT"
git fetch origin
git checkout go-backend
git pull origin go-backend
git checkout -b flutter-frontend 2>/dev/null || git checkout flutter-frontend

echo ""
echo "=== 2 / 3  Copying source files into repo..."
cd ~/storage/downloads
mkdir -p "$TMP"
unzip -o "$ZIP" -d "$TMP"
cp -r "$TMP"/. "$GIT"/
rm -rf "$TMP"

echo ""
echo "=== 3 / 3  Committing and pushing..."
cd "$GIT"
git add -A
git commit -m "feat: flutter frontend source + GH Actions workflows"
git push -u origin flutter-frontend

echo ""
echo "=== Done! =============================================="
echo ""
echo "Next: go to GitHub → Actions → Bootstrap Flutter Platform Files"
echo "      → Run workflow → Branch: flutter-frontend → Run"
echo ""
echo "That runs once. After it commits android/ and web/ back,"
echo "every push to flutter-frontend auto-builds the APK."
echo "Download from Actions → Build Flutter APK → Artifacts."
