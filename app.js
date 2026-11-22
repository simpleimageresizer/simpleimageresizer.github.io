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

  var orig = null; // { img, name, width, height, size }
  var resultUrl = null;
  var resultBlob = null;
  var resultFileName = '';

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

  /* Compute the target pixel size from the Dimensions fields.
     Returns { w, h } or null (and shows an error). */
  function computeTarget() {
    var wIn = parseFloat(dimWidth.value);
    var hIn = parseFloat(dimHeight.value);
    var wOk = isFinite(wIn) && wIn > 0;
    var hOk = isFinite(hIn) && hIn > 0;
    if (!wOk && !hOk) {
      showError('Please enter a width or a height first — or both. Numbers only, larger than zero.');
      return null;
    }
    var w, h;
    if (dimUnit.value === 'percent') {
      if (wIn > 500 || hIn > 500) {
        showError('Percent cannot be more than 500%. Please enter a smaller value.');
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
      showError('That size is too large — the longest side can be 8,000 px at most. Please enter smaller dimensions.');
      return null;
    }
    if (w * h > 100000000) {
      showError('That size is too large — please keep the total under 100 megapixels.');
      return null;
    }
    return { w: w, h: h };
  }

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
    ctx.drawImage(orig.img, 0, 0, target.w, target.h);

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
      if (note) { resultNote.textContent = note; resultNote.classList.add('show'); }
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
