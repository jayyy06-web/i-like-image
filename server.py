from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from PIL import Image, ImageOps
import io
import os
import zipfile
import tempfile

app = Flask(__name__)
CORS(app)

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB per file
ALLOWED_TYPES = {'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/tiff'}

FORMAT_MAP = {
    'image/jpeg': ('JPEG', '.jpg'),
    'image/png':  ('PNG',  '.png'),
    'image/webp': ('WEBP', '.webp'),
    'image/gif':  ('GIF',  '.gif'),
    'image/bmp':  ('BMP',  '.bmp'),
}


def open_image_safe(file_bytes):
    """Open image, auto-rotate via EXIF, convert to RGB/RGBA safely."""
    img = Image.open(io.BytesIO(file_bytes))
    img = ImageOps.exif_transpose(img)  # fix phone rotation
    return img


def to_rgb_if_needed(img, target_fmt):
    """Convert to RGB for JPEG (no alpha). Keep RGBA for PNG/WEBP."""
    if target_fmt == 'JPEG' and img.mode in ('RGBA', 'P', 'LA'):
        bg = Image.new('RGB', img.size, (255, 255, 255))
        if img.mode == 'P':
            img = img.convert('RGBA')
        if img.mode in ('RGBA', 'LA'):
            bg.paste(img, mask=img.split()[-1])
        return bg
    if img.mode == 'P':
        return img.convert('RGBA')
    if img.mode not in ('RGB', 'RGBA', 'L'):
        return img.convert('RGB')
    return img


def encode_image(img, pil_fmt, quality):
    """Encode PIL image to bytes with given format and quality."""
    buf = io.BytesIO()
    save_kwargs = {}

    if pil_fmt == 'JPEG':
        save_kwargs = {
            'quality': quality,
            'optimize': True,
            'progressive': True,
            'subsampling': 0 if quality > 85 else 2,
        }
    elif pil_fmt == 'PNG':
        # PNG is lossless — use pngquant-style quantization via palette if quality < 95
        compress_level = max(1, min(9, int((100 - quality) / 11)))
        save_kwargs = {
            'optimize': True,
            'compress_level': compress_level,
        }
        # For better PNG compression, quantize to palette if quality <= 85
        if quality <= 85 and img.mode == 'RGBA':
            img = img.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG)
            save_kwargs = {'optimize': True}
        elif quality <= 85 and img.mode == 'RGB':
            img = img.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
            save_kwargs = {'optimize': True}
    elif pil_fmt == 'WEBP':
        save_kwargs = {
            'quality': quality,
            'method': 6,   # slowest = best compression
            'lossless': quality >= 100,
        }
    elif pil_fmt == 'GIF':
        save_kwargs = {'optimize': True}

    img.save(buf, format=pil_fmt, **save_kwargs)
    buf.seek(0)
    return buf


def build_response(buf, mime, ext, orig_size, new_size, width, height, extra_headers=None):
    """Helper: build a send_file response with standard metadata headers."""
    response = send_file(buf, mimetype=mime, as_attachment=False)
    response.headers['X-Original-Size'] = str(orig_size)
    response.headers['X-New-Size']      = str(new_size)
    response.headers['X-Width']         = str(width)
    response.headers['X-Height']        = str(height)
    response.headers['X-Extension']     = ext
    expose = 'X-Original-Size,X-New-Size,X-Width,X-Height,X-Extension'
    if extra_headers:
        for k, v in extra_headers.items():
            response.headers[k] = str(v)
            expose += ',' + k
    response.headers['Access-Control-Expose-Headers'] = expose
    return response


# ─────────────────────────────────────────
#  POST /api/compress
#  fields: file, quality (1-100), format (same/image/jpeg/etc)
# ─────────────────────────────────────────
@app.route('/api/compress', methods=['POST'])
def compress():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    f = request.files['file']
    quality = int(request.form.get('quality', 82))
    out_fmt  = request.form.get('format', 'same')   # 'same' | 'image/jpeg' | ...
    quality  = max(1, min(100, quality))

    file_bytes = f.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        return jsonify({'error': 'File too large (max 50MB)'}), 413

    try:
        img = open_image_safe(file_bytes)
        orig_w, orig_h = img.size  # Lock dimensions — never change

        # Determine output format
        if out_fmt == 'same':
            mime = f.mimetype or 'image/jpeg'
        else:
            mime = out_fmt

        pil_fmt, ext = FORMAT_MAP.get(mime, ('JPEG', '.jpg'))
        img = to_rgb_if_needed(img, pil_fmt)

        orig_size = len(file_bytes)
        buf = encode_image(img, pil_fmt, quality)
        new_size = buf.getbuffer().nbytes

        return build_response(buf, mime, ext, orig_size, new_size, orig_w, orig_h,
                               {'X-Format-Used': pil_fmt})

    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ─────────────────────────────────────────
#  POST /api/smart-compress
#
#  PIXELS ARE NEVER CHANGED — only encoding is optimized.
#
#  Strategy:
#   1. Try WebP (best compression at same quality)
#   2. Try JPEG (for photo originals)
#   3. If target_kb given → binary-search quality to hit target size
#   4. Return whichever is smallest (never larger than original)
#
#  fields: file, target_kb (0=auto), max_quality (30-100, default 90)
# ─────────────────────────────────────────
@app.route('/api/smart-compress', methods=['POST'])
def smart_compress():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    f = request.files['file']
    target_kb = int(request.form.get('target_kb', 0))   # 0 = no target
    max_qual  = int(request.form.get('max_quality', 90))
    max_qual  = max(30, min(100, max_qual))

    file_bytes = f.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        return jsonify({'error': 'File too large (max 50MB)'}), 413

    try:
        img = open_image_safe(file_bytes)
        orig_w, orig_h = img.size        # LOCKED — dimension guarantee
        orig_size      = len(file_bytes)
        orig_mime      = f.mimetype or 'image/jpeg'

        target_bytes = target_kb * 1024 if target_kb > 0 else None

        # ── Helper: encode a copy (never mutate original img) ──
        def try_encode(pil_fmt, quality):
            img_copy = to_rgb_if_needed(img.copy(), pil_fmt)
            buf = encode_image(img_copy, pil_fmt, quality)
            return buf, buf.getbuffer().nbytes

        # ── Binary search quality to get ≤ target_bytes ──
        def binary_search(pil_fmt, target_b, q_lo=30, q_hi=None):
            if q_hi is None:
                q_hi = max_qual
            result_buf, result_size, result_q = None, float('inf'), q_lo
            for _ in range(9):   # 9 iterations → within ~1 quality unit
                if q_lo > q_hi:
                    break
                q_mid = (q_lo + q_hi) // 2
                b, s = try_encode(pil_fmt, q_mid)
                if s <= target_b:
                    result_buf, result_size, result_q = b, s, q_mid
                    q_lo = q_mid + 1   # try higher quality (still within target)
                else:
                    q_hi = q_mid - 1
            if result_buf is None:
                # Could not reach target — return smallest possible
                result_buf, result_size = try_encode(pil_fmt, q_lo)
                result_q = q_lo
            return result_buf, result_size, result_q

        best_buf  = None
        best_size = orig_size + 1   # must beat the original
        best_mime = 'image/webp'
        best_ext  = '.webp'
        best_fmt  = 'WEBP'
        best_qual = max_qual

        # ── Candidate formats to try (in priority order) ──
        candidates = [
            ('WEBP', 'image/webp', '.webp'),
            ('JPEG', 'image/jpeg', '.jpg'),
        ]
        # Keep PNG lossless WebP only if original had transparency
        if 'png' in orig_mime and img.mode == 'RGBA':
            candidates.insert(0, ('WEBP', 'image/webp', '.webp'))  # lossless attempt at q=100

        for pil_fmt, mime, ext in candidates:
            if target_bytes:
                b, s, q = binary_search(pil_fmt, target_bytes)
            else:
                b, s = try_encode(pil_fmt, max_qual)
                q = max_qual

            if s < best_size:
                best_buf  = b
                best_size = s
                best_mime = mime
                best_ext  = ext
                best_fmt  = pil_fmt
                best_qual = q

        # ── Fallback: if nothing beat original, use WebP at max_qual ──
        if best_buf is None or best_size >= orig_size:
            best_buf, best_size = try_encode('WEBP', max_qual)
            best_mime, best_ext, best_fmt = 'image/webp', '.webp', 'WEBP'
            best_qual = max_qual

        # ── DIMENSION SAFETY CHECK ──
        best_buf.seek(0)
        check_img = Image.open(io.BytesIO(best_buf.read()))
        if check_img.size != (orig_w, orig_h):
            raise RuntimeError(
                f'Safety check failed: output {check_img.size} != input {(orig_w, orig_h)}'
            )
        best_buf.seek(0)

        return build_response(
            best_buf, best_mime, best_ext, orig_size, best_size, orig_w, orig_h,
            {
                'X-Format-Used':  best_fmt,
                'X-Quality-Used': best_qual,
                'X-Mode':         'smart',
            }
        )

    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ─────────────────────────────────────────
#  POST /api/convert
#  fields: file, format (image/jpeg|png|webp), quality
# ─────────────────────────────────────────
@app.route('/api/convert', methods=['POST'])
def convert():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    f = request.files['file']
    quality = int(request.form.get('quality', 90))
    mime    = request.form.get('format', 'image/jpeg')
    quality = max(1, min(100, quality))

    file_bytes = f.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        return jsonify({'error': 'File too large (max 50MB)'}), 413

    try:
        img = open_image_safe(file_bytes)
        orig_w, orig_h = img.size
        pil_fmt, ext = FORMAT_MAP.get(mime, ('JPEG', '.jpg'))
        img = to_rgb_if_needed(img, pil_fmt)

        orig_size = len(file_bytes)
        buf = encode_image(img, pil_fmt, quality)
        new_size = buf.getbuffer().nbytes

        return build_response(buf, mime, ext, orig_size, new_size, orig_w, orig_h)

    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ─────────────────────────────────────────
#  POST /api/resize
#  fields: file, width, height, keep_ratio, quality
# ─────────────────────────────────────────
@app.route('/api/resize', methods=['POST'])
def resize():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    f = request.files['file']
    target_w   = int(request.form.get('width',  0) or 0)
    target_h   = int(request.form.get('height', 0) or 0)
    keep_ratio = request.form.get('keep_ratio', 'true').lower() == 'true'
    quality    = int(request.form.get('quality', 90))
    quality    = max(1, min(100, quality))

    if not target_w and not target_h:
        return jsonify({'error': 'Width or height required'}), 400

    file_bytes = f.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        return jsonify({'error': 'File too large (max 50MB)'}), 413

    try:
        img = open_image_safe(file_bytes)
        orig_w, orig_h = img.size

        if keep_ratio:
            if target_w and target_h:
                img.thumbnail((target_w, target_h), Image.LANCZOS)
            elif target_w:
                ratio = target_w / orig_w
                img = img.resize((target_w, max(1, int(orig_h * ratio))), Image.LANCZOS)
            else:
                ratio = target_h / orig_h
                img = img.resize((max(1, int(orig_w * ratio)), target_h), Image.LANCZOS)
        else:
            w = target_w or orig_w
            h = target_h or orig_h
            img = img.resize((w, h), Image.LANCZOS)

        mime = f.mimetype or 'image/jpeg'
        pil_fmt, ext = FORMAT_MAP.get(mime, ('JPEG', '.jpg'))
        img = to_rgb_if_needed(img, pil_fmt)

        orig_size = len(file_bytes)
        buf = encode_image(img, pil_fmt, quality)
        new_size = buf.getbuffer().nbytes

        return build_response(buf, mime, ext, orig_size, new_size, img.width, img.height)

    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ─────────────────────────────────────────
#  GET /api/health
# ─────────────────────────────────────────
@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'pillow': Image.__version__})


if __name__ == '__main__':
    print("=" * 50)
    print("  i like image — Python Backend")
    print("  Running on http://localhost:5000")
    print("=" * 50)
    app.run(debug=False, port=5000, threaded=True)
