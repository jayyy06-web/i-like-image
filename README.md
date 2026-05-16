# i like image 🖼️
### Smart Image Tools for E-Commerce — with Python Backend

---

## Setup (Windows)

### Step 1 — Install Python
Download from https://python.org (3.10 or newer)
✅ Check "Add Python to PATH" during install

### Step 2 — Start the Backend
Double-click `start_server.bat`
OR open Command Prompt in this folder and run:
```
pip install flask pillow flask-cors
python server.py
```

### Step 3 — Open the Website
Open `index.html` in your browser (Chrome/Edge recommended)

The navbar will show 🟢 "Python backend online" when connected.

---

## Features

| Feature | Tool Used |
|---------|-----------|
| Compress (JPEG, PNG, WebP) | Python Pillow |
| Format Convert | Python Pillow |
| Resize with presets | Python Pillow (LANCZOS) |
| Bulk processing | Supported |
| Batch rename | Supported |
| ZIP download | JSZip (browser) |
| Before/After preview | Browser |
| Dark / Light mode | CSS |

## Why Python Backend?
- Real PNG compression (palette quantization)
- JPEG progressive encoding
- WebP method=6 (best compression)
- EXIF auto-rotation (phone photos)
- White background for PNG→JPEG
- No quality loss from double-encoding

## E-Commerce Presets
- Amazon: 1000×1000px
- Flipkart: 500×500px
- Meesho: 800×800px
- Shopify: 2048×2048px
- Instagram: 1080×1080px
- Custom: enter any size

---
Made with Flask + Pillow + HTML/CSS/JS
