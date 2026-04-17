import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const docsDir = path.resolve("docs");
const distDir = path.resolve("dist");

// Clean docs directory
if (fs.existsSync(docsDir)) {
  fs.rmSync(docsDir, { recursive: true, force: true });
}
fs.mkdirSync(docsDir, { recursive: true });

// Build React app with Vite
console.log("Building React app...");
process.env.VITE_BASE_PATH = "/boardgame_assets/editor/";
execSync("npm run build", { stdio: "inherit", env: { ...process.env } });

// Inject Google OAuth client ID into built files
const googleClientId = (process.env.GOOGLE_CLIENT_ID || "").trim();

if (googleClientId && googleClientId !== "YOUR_GOOGLE_CLIENT_ID") {
  const looksValid = googleClientId.length > 20 &&
    (googleClientId.endsWith('.apps.googleusercontent.com') || googleClientId.includes('-'));

  if (!looksValid) {
    console.error("\n❌ ERROR: GOOGLE_CLIENT_ID appears to be invalid!");
    process.exit(1);
  }

  console.log("Injecting Google OAuth client ID...");
  const assetsDir = path.join(distDir, "assets");

  if (!fs.existsSync(assetsDir)) {
    console.error("❌ ERROR: assets directory not found.");
    process.exit(1);
  }

  const jsFiles = fs.readdirSync(assetsDir).filter(f => f.endsWith(".js"));
  let injectedCount = 0;

  for (const jsFile of jsFiles) {
    const filePath = path.join(assetsDir, jsFile);
    let content = fs.readFileSync(filePath, "utf8");
    const original = content;
    content = content.replace(/YOUR_GOOGLE_CLIENT_ID/g, googleClientId);
    if (content !== original) {
      fs.writeFileSync(filePath, content, "utf8");
      injectedCount++;
      console.log(`  ✓ Injected into ${jsFile}`);
    }
  }

  if (injectedCount === 0) {
    console.error("❌ ERROR: Placeholder not found in built files.");
    process.exit(1);
  }
} else {
  console.error("\n❌ ERROR: GOOGLE_CLIENT_ID not set!");
  process.exit(1);
}

// Copy Vite output to docs/
const copyDir = (source: string, target: string) => {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const src = path.join(source, entry.name);
    const dst = path.join(target, entry.name);
    if (entry.isDirectory()) copyDir(src, dst);
    else fs.copyFileSync(src, dst);
  }
};

const editorDir = path.join(docsDir, "editor");
console.log("Copying build to docs/editor/...");
copyDir(distDir, editorDir);

// Root redirect to editor
fs.writeFileSync(path.join(docsDir, "index.html"), `<!doctype html>
<html><head><meta http-equiv="refresh" content="0;url=/boardgame_assets/editor/" /></head>
<body><p>Redirecting...</p></body></html>`, "utf8");

// 404.html for GitHub Pages SPA routing
fs.writeFileSync(path.join(docsDir, "404.html"), `<!doctype html>
<html><head><meta charset="UTF-8" />
<script>
  sessionStorage.setItem('redirectPath', window.location.pathname + window.location.search + window.location.hash);
  window.location.replace('/boardgame_assets/editor/');
</script>
</head><body><p>Redirecting...</p></body></html>`, "utf8");

console.log("✓ Build complete.");
