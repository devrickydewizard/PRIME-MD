# Running PRIME-MD on Termux

```bash
pkg update -y
pkg install -y nodejs-lts ffmpeg python make clang binutils git libvips
cd ~/PRIME-MD
rm -rf node_modules
npm install
npm rebuild better-sqlite3 sqlite3 sharp     # only if a native module failed
npm start                                    # or: node index.js
```
- ffmpeg comes from Termux (`pkg install ffmpeg`); the bundled ffmpeg npm binaries are optional.
- Use `nodejs-lts`; the newest "current" Node often has no prebuilt native modules.
