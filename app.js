/* Image Resizer — header menu (hamburger). Runs on every page. */
(function () {
  var menuBtn = document.getElementById('menuBtn');
  var mainNav = document.querySelector('nav.main');
  if (menuBtn && mainNav) {
    menuBtn.addEventListener('click', function () {
      var open = mainNav.classList.toggle('open');
      menuBtn.classList.toggle('open', open);
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    mainNav.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        mainNav.classList.remove('open');
        menuBtn.classList.remove('open');
        menuBtn.setAttribute('aria-expanded', 'false');
      });
    });
  }
})();

/* Image Resizer tool — pure client-side canvas resizing. Runs only on the homepage.
   No network calls: the image never leaves the visitor's browser. */
(function () {
  function $(id) { return document.getElementById(id); }

  var dropZone = $('dropZone');
  if (!dropZone) return; // not the homepage — nothing else to do

  var fileInput = $('fileInput');
  var selectBtn = $('selectImageBtn');
  var fileInfo = $('fileInfo');
  var previewImg = $('previewImg');
  var fileNameEl = $('fileName');
  var fileMetaEl = $('fileMeta');
  var dimWidth = $('dimWidth');
  var dimHeight = $('dimHeight');
  var dimUnit = $('dimUnit');
  var keepAspect = $('keepAspect');
  var formatSelect = $('formatSelect');
  var targetSize = $('targetSize');
  var targetUnit = $('targetUnit');
  var resizeBtn = $('resizeBtn');
  var resizeHint = $('resizeHint');
  var errorBox = $('errorBox');
  var resultBox = $('resultBox');
  var resultImg = $('resultImg');
  var resultDims = $('resultDims');
  var resultNote = $('resultNote');
  var downloadBtn = $('downloadBtn');
  var againLink = $('againLink');
  var cropStageWrap = $('cropStageWrap');
  var cropStage = $('cropStage');
  var cropImg = $('cropImg');
  var cropBox = $('cropBox');
  var cropCaption = $('cropCaption');

  var orig = null; // { img, name, width, height, size }
  var resultUrl = null;
  var resultBlob = null;
  var resultFileName = '';
  var crop = null; // { cx, cy, fw, fh } — crop box centre/size as fractions of the displayed image

  function formatBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.classList.add('show');
  }
  function clearError() { errorBox.classList.remove('show'); errorBox.textContent = ''; }

  function setResizeEnabled(on) {
    resizeBtn.disabled = !on;
    resizeHint.textContent = on
      ? 'Ready — tap Resize Image to create your resized copy.'
      : 'Choose an image first to resize it.';
  }

  function openPicker() { fileInput.click(); }

  dropZone.addEventListener('click', openPicker);
  dropZone.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); }
  });
  selectBtn.addEventListener('click', function (e) { e.stopPropagation(); openPicker(); });
  fileInput.addEventListener('change', function () {
    if (fileInput.files && fileInput.files[0]) handleFile(fileInput.files[0]);
    fileInput.value = '';
  });
  ['dragenter', 'dragover'].forEach(function (evt) {
    dropZone.addEventListener(evt, function (e) { e.preventDefault(); dropZone.classList.add('drag-over'); });
  });
  ['dragleave', 'drop'].forEach(function (evt) {
    dropZone.addEventListener(evt, function (e) { e.preventDefault(); dropZone.classList.remove('drag-over'); });
  });
  dropZone.addEventListener('drop', function (e) {
    var files = e.dataTransfer && e.dataTransfer.files;
    if (files && files[0]) handleFile(files[0]);
  });

  function handleFile(file) {
    clearError();
    if (!file || !file.type || file.type.indexOf('image/') !== 0) {
      showError('That file is not an image. Please choose a JPG, PNG, WebP or other image file.');
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        orig = { img: img, name: file.name, width: img.naturalWidth, height: img.naturalHeight, size: file.size };
        previewImg.src = reader.result;
        fileNameEl.textContent = file.name;
        fileMetaEl.textContent = img.naturalWidth + ' × ' + img.naturalHeight + ' px · ' + formatBytes(file.size);
        fileInfo.classList.add('show');
        dimUnit.value = 'pixel';
        dimWidth.value = img.naturalWidth;
        dimHeight.value = img.naturalHeight;
        resultBox.classList.remove('show');
        setResizeEnabled(true);
        cropImg.src = reader.result;
        cropStageWrap.classList.add('show');
        recomputeCrop(null);
      };
      img.onerror = function () {
        showError('Sorry, that image could not be opened. Please try a different image file.');
      };
      img.src = reader.result;
    };
    reader.onerror = function () {
      showError('Sorry, that image could not be read. Please try again.');
    };
    reader.readAsDataURL(file);
  }

  function ratio() { return orig.width / orig.height; }

  function syncFromWidth() {
    if (!orig || !keepAspect.checked) return;
    var w = parseFloat(dimWidth.value);
    if (!isFinite(w) || w <= 0) return;
    if (dimUnit.value === 'percent') {
      dimHeight.value = dimWidth.value;
    } else {
      dimHeight.value = Math.max(1, Math.round(w / ratio()));
    }
  }
  function syncFromHeight() {
    if (!orig || !keepAspect.checked) return;
    var h = parseFloat(dimHeight.value);
    if (!isFinite(h) || h <= 0) return;
    if (dimUnit.value === 'percent') {
      dimWidth.value = dimHeight.value;
    } else {
      dimWidth.value = Math.max(1, Math.round(h * ratio()));
    }
  }
  dimWidth.addEventListener('input', syncFromWidth);
  dimHeight.addEventListener('input', syncFromHeight);
  dimWidth.addEventListener('input', function () { if (orig) recomputeCrop(crop); });
  dimHeight.addEventListener('input', function () { if (orig) recomputeCrop(crop); });
  keepAspect.addEventListener('change', function () { if (orig) recomputeCrop(crop); });

  dimUnit.addEventListener('change', function () {
    if (!orig) return;
    var w = parseFloat(dimWidth.value);
    var h = parseFloat(dimHeight.value);
    if (dimUnit.value === 'percent') {
      if (isFinite(w) && w > 0) dimWidth.value = Math.round((w / orig.width) * 100);
      if (isFinite(h) && h > 0) dimHeight.value = Math.round((h / orig.height) * 100);
    } else {
      if (isFinite(w) && w > 0) dimWidth.value = Math.max(1, Math.round((w / 100) * orig.width));
      if (isFinite(h) && h > 0) dimHeight.value = Math.max(1, Math.round((h / 100) * orig.height));
    }
  });
  dimUnit.addEventListener('change', function () { if (orig) recomputeCrop(crop); });

  /* Compute the target pixel size from the Dimensions fields.
     Returns { w, h } or null (and shows an error, unless silent). */
  function computeTarget(silent) {
    var wIn = parseFloat(dimWidth.value);
    var hIn = parseFloat(dimHeight.value);
    var wOk = isFinite(wIn) && wIn > 0;
    var hOk = isFinite(hIn) && hIn > 0;
    if (!wOk && !hOk) {
      if (!silent) showError('Please enter a width or a height first — or both. Numbers only, larger than zero.');
      return null;
    }
    var w, h;
    if (dimUnit.value === 'percent') {
      if (wIn > 500 || hIn > 500) {
        if (!silent) showError('Percent cannot be more than 500%. Please enter a smaller value.');
        return null;
      }
      if (wOk && hOk) { w = (wIn / 100) * orig.width; h = (hIn / 100) * orig.height; }
      else if (wOk) { w = (wIn / 100) * orig.width; h = w / ratio(); }
      else { h = (hIn / 100) * orig.height; w = h * ratio(); }
    } else {
      if (wOk && hOk) { w = wIn; h = hIn; }
      else if (wOk) { w = wIn; h = w / ratio(); }
      else { h = hIn; w = h * ratio(); }
    }
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    if (w > 8000 || h > 8000) {
      if (!silent) showError('That size is too large — the longest side can be 8,000 px at most. Please enter smaller dimensions.');
      return null;
    }
    if (w * h > 100000000) {
      if (!silent) showError('That size is too large — please keep the total under 100 megapixels.');
      return null;
    }
    return { w: w, h: h };
  }

  /* ---------- Draggable crop box ---------- */
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /* Target aspect ratio from the Dimensions fields (same math as
     computeTarget, but silent). Falls back to the original image aspect
     when no usable dimensions are set. */
  function targetAspect() {
    if (!orig) return null;
    var t = computeTarget(true);
    return t ? t.w / t.h : ratio();
  }

  function isWholeCrop() {
    return !crop || (crop.fw >= 0.999 && crop.fh >= 0.999);
  }

  function gcd(a, b) {
    a = Math.abs(Math.round(a)); b = Math.abs(Math.round(b));
    while (b) { var t = a % b; a = b; b = t; }
    return a || 1;
  }

  /* Crop region in ORIGINAL image pixels, clamped to the image.
     The rect's aspect always matches the exact target aspect (target.w /
     target.h from computeTarget), so the drawn output is exactly the
     target size with no stretching. The box fractions already carry that
     aspect, but rounding them to whole pixels can shift it (e.g. a
     1151 x 575 px box for an 800 x 400 px target), so the rect is sized
     from the target aspect itself, keeping the box centre. A whole-image
     crop still uses the whole image, exactly as before. */
  function cropSourceRect() {
    if (!orig) return { sx: 0, sy: 0, sw: 0, sh: 0 };
    if (!crop) return { sx: 0, sy: 0, sw: orig.width, sh: orig.height };
    if (isWholeCrop()) return { sx: 0, sy: 0, sw: orig.width, sh: orig.height };

    var target = computeTarget(true);
    var aspect = target ? target.w / target.h : ratio();

    // Box centre and size in original pixels (float, exact aspect).
    var cx = crop.cx * orig.width;
    var cy = crop.cy * orig.height;
    var bw = crop.fw * orig.width;
    var bh = crop.fh * orig.height;

    // Force the exact target aspect, keeping the centre: shrink the side
    // that is too long for the aspect.
    if (bw / bh > aspect) { bw = bh * aspect; }
    else { bh = bw / aspect; }

    var sw, sh;
    var exact = false;
    if (target) {
      // Integer rect with the exact target aspect: scale the target's own
      // reduced ratio to the box. Use it when it stays within 2% of the
      // box size, so the previewed crop and the downloaded crop match.
      var g = gcd(target.w, target.h);
      var uw = target.w / g, uh = target.h / g;
      var k = Math.floor(Math.min(bw / uw, bh / uh));
      if (k >= 1) {
        var ew = k * uw, eh = k * uh;
        if ((bw - ew) / bw <= 0.02 && (bh - eh) / bh <= 0.02) {
          sw = ew; sh = eh; exact = true;
        }
      }
    }
    if (!exact) {
      // Round the box to whole pixels, deriving one side from the other
      // through the exact target aspect (never from the box's own rounded
      // aspect), and keep the rect inside the box.
      sw = Math.max(1, Math.round(bw));
      sh = Math.max(1, Math.round(sw / aspect));
      if (sh > bh) { sh = Math.max(1, Math.floor(bh)); sw = Math.max(1, Math.round(sh * aspect)); }
      if (sw > bw) { sw = Math.max(1, Math.floor(bw)); sh = Math.max(1, Math.round(sw / aspect)); }
    }

    // Centre the rect on the box centre, keeping it inside the image.
    var sx = clamp(Math.round(cx - sw / 2), 0, orig.width - sw);
    var sy = clamp(Math.round(cy - sh / 2), 0, orig.height - sh);
    return { sx: sx, sy: sy, sw: sw, sh: sh };
  }

  function layoutCropBox() {
    if (!orig || !crop) return;
    var dw = cropImg.clientWidth, dh = cropImg.clientHeight;
    if (!dw || !dh) return;
    cropBox.style.left = ((crop.cx - crop.fw / 2) * dw) + 'px';
    cropBox.style.top = ((crop.cy - crop.fh / 2) * dh) + 'px';
    cropBox.style.width = (crop.fw * dw) + 'px';
    cropBox.style.height = (crop.fh * dh) + 'px';
  }

  function updateCaption() {
    if (!orig || !crop) return;
    if (isWholeCrop()) {
      var wholeTarget = computeTarget(true);
      var wholeText = 'Whole image will be used — to crop, uncheck Keep aspect ratio and set a different width and height.';
      if (wholeTarget) wholeText += ' Download will be ' + wholeTarget.w + ' × ' + wholeTarget.h + ' px.';
      cropCaption.textContent = wholeText;
      return;
    }
    var src = cropSourceRect();
    var target = computeTarget(true);
    var text = 'Crop area: ' + src.sw + ' × ' + src.sh + ' px of ' + orig.width + ' × ' + orig.height +
      ' — drag the box to choose what stays.';
    if (target) text += ' Download will be ' + target.w + ' × ' + target.h + ' px.';
    cropCaption.textContent = text;
  }

  /* Recompute the box for the current target aspect. Largest rectangle of
     that aspect fitting inside the displayed image; keeps the previous
     relative centre when one is given, otherwise centres the box. */
  function recomputeCrop(centre) {
    if (!orig) return;
    var dw = cropImg.clientWidth, dh = cropImg.clientHeight;
    if (!dw || !dh) return;
    var aspect = targetAspect();
    var oa = ratio();
    if (Math.abs(aspect - oa) / oa < 0.01) {
      crop = { cx: 0.5, cy: 0.5, fw: 1, fh: 1 };
    } else {
      var bw = dw, bh = bw / aspect;
      if (bh > dh) { bh = dh; bw = bh * aspect; }
      var fw = bw / dw, fh = bh / dh;
      var cx = centre ? centre.cx : 0.5;
      var cy = centre ? centre.cy : 0.5;
      crop = {
        cx: clamp(cx, fw / 2, 1 - fw / 2),
        cy: clamp(cy, fh / 2, 1 - fh / 2),
        fw: fw, fh: fh
      };
    }
    layoutCropBox();
    updateCaption();
  }

  cropImg.addEventListener('load', function () {
    if (orig && cropStageWrap.classList.contains('show')) recomputeCrop(null);
  });

  window.addEventListener('resize', function () { layoutCropBox(); });

  /* Drag the box with mouse or touch (Pointer Events). */
  var drag = null;
  cropBox.addEventListener('pointerdown', function (e) {
    if (!orig || !crop) return;
    e.preventDefault();
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, cx: crop.cx, cy: crop.cy };
    cropBox.classList.add('dragging');
    if (cropBox.setPointerCapture) {
      try { cropBox.setPointerCapture(e.pointerId); } catch (err) {}
    }
  });
  cropBox.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    var dw = cropImg.clientWidth, dh = cropImg.clientHeight;
    if (!dw || !dh) return;
    crop.cx = clamp(drag.cx + (e.clientX - drag.x) / dw, crop.fw / 2, 1 - crop.fw / 2);
    crop.cy = clamp(drag.cy + (e.clientY - drag.y) / dh, crop.fh / 2, 1 - crop.fh / 2);
    layoutCropBox();
    updateCaption();
  });
  function endDrag() {
    if (!drag) return;
    drag = null;
    cropBox.classList.remove('dragging');
  }
  cropBox.addEventListener('pointerup', endDrag);
  cropBox.addEventListener('pointercancel', endDrag);

  function canvasToBlob(canvas, type, quality) {
    return new Promise(function (resolve) {
      canvas.toBlob(function (b) { resolve(b); }, type, quality);
    });
  }

  function mimeFor(format) {
    if (format === 'png') return 'image/png';
    if (format === 'webp') return 'image/webp';
    return 'image/jpeg';
  }
  function extFor(format) {
    if (format === 'png') return '.png';
    if (format === 'webp') return '.webp';
    return '.jpg';
  }

  resizeBtn.addEventListener('click', function () {
    if (!orig) { showError('Choose an image first to resize it.'); return; }
    clearError();
    var target = computeTarget();
    if (!target) return;

    var format = formatSelect.value;
    var mime = mimeFor(format);
    var canvas = document.createElement('canvas');
    canvas.width = target.w;
    canvas.height = target.h;
    var ctx = canvas.getContext('2d');
    if (format === 'jpg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, target.w, target.h); }
    var src = cropSourceRect();
    ctx.drawImage(orig.img, src.sx, src.sy, src.sw, src.sh, 0, 0, target.w, target.h);

    var targetBytes = null;
    var tVal = parseFloat(targetSize.value);
    if (isFinite(tVal) && tVal > 0) {
      targetBytes = Math.round(tVal * (targetUnit.value === 'kb' ? 1024 : 1024 * 1024));
    }

    var done = function (blob, note) {
      if (!blob) {
        showError('Sorry, the resize did not work for this image. Please try a different image or format.');
        return;
      }
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      resultBlob = blob;
      resultUrl = URL.createObjectURL(blob);
      var base = orig.name.replace(/\.[^.]+$/, '') || 'image';
      resultFileName = base + '-resized' + extFor(format);
      resultImg.src = resultUrl;
      resultImg.alt = 'Resized image — ' + target.w + ' by ' + target.h + ' pixels';
      resultDims.textContent = 'New size: ' + target.w + ' × ' + target.h + ' px · ' + formatBytes(blob.size) +
        ' (was ' + orig.width + ' × ' + orig.height + ' px · ' + formatBytes(orig.size) + ')';
      var notes = [];
      if (!isWholeCrop()) {
        notes.push('Cropped to ' + src.sw + ' × ' + src.sh + ' px, then resized to ' + target.w + ' × ' + target.h + ' px.');
      }
      if (note) notes.push(note);
      var finalNote = notes.join(' ');
      if (finalNote) { resultNote.textContent = finalNote; resultNote.classList.add('show'); }
      else { resultNote.classList.remove('show'); resultNote.textContent = ''; }
      resultBox.classList.add('show');
      resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };

    if (targetBytes && format !== 'png') {
      // Binary-search the highest quality that fits under the target size.
      canvasToBlob(canvas, mime, 0.95).then(function (top) {
        if (top && top.size <= targetBytes) { done(top, null); return; }
        var lo = 0.05, hi = 0.95, best = null;
        var steps = 0;
        var tryQ = function (q) {
          return canvasToBlob(canvas, mime, q).then(function (b) {
            steps++;
            if (b && b.size <= targetBytes) { best = b; lo = q; }
            else { hi = q; }
            if (steps < 9 && hi - lo > 0.02) return tryQ((lo + hi) / 2);
            if (best) { done(best, null); return; }
            // Even the lowest quality is still over the target.
            return canvasToBlob(canvas, mime, 0.05).then(function (lowest) {
              done(lowest, 'We could not reach your target size of ' + formatBytes(targetBytes) +
                ' even at the lowest quality, so we used the lowest quality. Try smaller dimensions to make the file smaller.');
            });
          });
        };
        return tryQ((lo + hi) / 2);
      });
    } else if (targetBytes && format === 'png') {
      canvasToBlob(canvas, mime).then(function (blob) {
        done(blob, 'Target file size does not apply to PNG — PNG is lossless, so its quality cannot be lowered to shrink the file. Choose JPG or WebP if you need a file under a certain size.');
      });
    } else {
      canvasToBlob(canvas, mime, 0.92).then(function (blob) { done(blob, null); });
    }
  });

  downloadBtn.addEventListener('click', function () {
    if (!resultBlob || !resultUrl) return;
    var a = document.createElement('a');
    a.href = resultUrl;
    a.download = resultFileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  });

  againLink.addEventListener('click', function () {
    orig = null;
    if (resultUrl) { URL.revokeObjectURL(resultUrl); resultUrl = null; }
    resultBlob = null;
    crop = null;
    cropStageWrap.classList.remove('show');
    cropCaption.textContent = '';
    fileInfo.classList.remove('show');
    resultBox.classList.remove('show');
    dimWidth.value = '';
    dimHeight.value = '';
    targetSize.value = '';
    clearError();
    setResizeEnabled(false);
    dropZone.scrollIntoView({ behavior: 'smooth', block: 'center' });
    dropZone.focus();
  });

  setResizeEnabled(false);
})();
