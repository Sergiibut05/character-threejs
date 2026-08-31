# my-portfolio

The app itself. The project README — what this is, screenshots, how it is put
together — lives at the repository root: [`../README.md`](../README.md).

```bash
npm install
npm run dev      # https://localhost:5173  (HTTPS: WebGPU needs a secure context)
npm run build    # → dist/
```

Asset pipelines, all using `ffmpeg-static` / npm deps so nothing has to be
installed system-wide:

```bash
node tools/compress-glbs.mjs      # meshes  → Draco
node tools/convert-ktx2.mjs       # textures → KTX2 / UASTC
node tools/transcode-sfx.mjs      # audio    → Opus (.webm) + AAC (.m4a)
```
