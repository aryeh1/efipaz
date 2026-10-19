/**
 * PDF viewer for efipaz.com — pdf.js (pinned version from cdnjs) with a plain fallback.
 *
 * URL: viewer.html?file=<site-relative path to a .pdf>
 * Renders every page on a canvas in a scrolling column (works on phones, where browsers
 * otherwise download the PDF). If pdf.js cannot load (no CDN), falls back to an <iframe>.
 */
(function () {
  'use strict';

  var PDFJS_VERSION = '3.11.174';
  var CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + PDFJS_VERSION + '/';
  var base = window.VIEWER_BASE || '';
  var he = (window.VIEWER_LANG || 'he') === 'he';
  var T = he
    ? { bad: 'לא נמצא קובץ להצגה.', fail: 'לא הצלחתי להציג את הקובץ כאן. אפשר להוריד אותו או לפתוח בחלון חדש.', page: 'עמוד' }
    : { bad: 'No file to show.', fail: 'The file could not be displayed here. You can download it or open it in a new tab.', page: 'Page' };

  var pagesEl = document.getElementById('pages');
  var titleEl = document.getElementById('title');
  var pageEl = document.getElementById('page');

  function msg(text) { pagesEl.innerHTML = ''; var p = document.createElement('p'); p.className = 'viewer__msg'; p.textContent = text; pagesEl.appendChild(p); }

  // --- validate the requested file: same site, relative, a PDF, no path tricks
  var file = new URLSearchParams(location.search).get('file') || '';  // already decoded once
  var segs = file.split('/');
  var ok = file && /\.pdf$/i.test(file) && segs.indexOf('..') === -1 && segs.indexOf('') === -1 &&
    file.indexOf(':') === -1 && file.indexOf('\\') === -1;
  if (!ok) { msg(T.bad); return; }

  var url = base + file.split('/').map(encodeURIComponent).join('/');
  var name = file.split('/').pop().replace(/\.pdf$/i, '').replace(/_/g, ' ');
  titleEl.textContent = name;
  document.title = name + ' | ' + (he ? 'אפי פז' : 'Efi Paz');
  document.getElementById('download').href = url;
  document.getElementById('download').setAttribute('download', file.split('/').pop());
  document.getElementById('open').href = url;

  function fallback() {
    pagesEl.innerHTML = '';
    var p = document.createElement('p'); p.className = 'viewer__msg'; p.textContent = T.fail; pagesEl.appendChild(p);
    var f = document.createElement('iframe'); f.className = 'viewer__fallback'; f.src = url; f.title = name; pagesEl.appendChild(f);
  }

  // --- load pdf.js
  var s = document.createElement('script');
  s.src = CDN + 'pdf.min.js';
  s.integrity = 'sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e';
  s.crossOrigin = 'anonymous';
  s.onerror = fallback;
  s.onload = function () {
    var pdfjsLib = window['pdfjs-dist/build/pdf'] || window.pdfjsLib;
    if (!pdfjsLib) { fallback(); return; }
    pdfjsLib.GlobalWorkerOptions.workerSrc = CDN + 'pdf.worker.min.js';
    pdfjsLib.getDocument({ url: url, cMapUrl: CDN + 'cmaps/', cMapPacked: true }).promise.then(render, fallback);
  };
  document.head.appendChild(s);

  // --- render all pages, sized to the column width, re-rendered on zoom
  var pdf = null, scale = 1, rendering = false, pending = false;
  var dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.5 : 2);
  var observer = null;
  var VISIBLE_MARGIN = '150% 0px';  // render pages within 1.5 screens of the viewport, release the rest

  function render(doc) {
    pdf = doc;
    pagesEl.innerHTML = '';
    // size every page from page 1 so the scrollbar is right, draw only pages near the viewport
    pdf.getPage(1).then(function (p1) {
      var ratio = p1.getViewport({ scale: 1 }).height / p1.getViewport({ scale: 1 }).width;
      for (var i = 1; i <= pdf.numPages; i++) {
        var c = document.createElement('canvas');
        c.className = 'viewer__canvas';
        c.setAttribute('data-page', i);
        c.setAttribute('aria-label', T.page + ' ' + i);
        c.dataset.ratio = ratio;
        pagesEl.appendChild(c);
      }
      layout();
      observer = new IntersectionObserver(onVisible, { rootMargin: VISIBLE_MARGIN });
      Array.prototype.forEach.call(pagesEl.querySelectorAll('canvas'), function (c) { observer.observe(c); });
      pagesEl.addEventListener('scroll', updateCounter, { passive: true });
      window.addEventListener('scroll', updateCounter, { passive: true });
      var t;
      window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(relayout, 200); });
      updateCounter();
    }, fallback);
  }

  function columnWidth() { return Math.min(pagesEl.clientWidth - 24, 900) * scale; }

  function layout() {
    var width = columnWidth();
    Array.prototype.forEach.call(pagesEl.querySelectorAll('canvas'), function (c) {
      c.style.width = Math.floor(width) + 'px';
      c.style.height = Math.floor(width * parseFloat(c.dataset.ratio || 1.4)) + 'px';
    });
  }

  function relayout() {
    layout();
    Array.prototype.forEach.call(pagesEl.querySelectorAll('canvas'), function (c) {
      c.dataset.drawnWidth = '';
      if (c.dataset.visible === '1') draw(c);
    });
  }

  function onVisible(entries) {
    entries.forEach(function (en) {
      var c = en.target;
      if (en.isIntersecting) { c.dataset.visible = '1'; draw(c); }
      else { c.dataset.visible = ''; release(c); }
    });
  }

  function release(c) {
    // free the bitmap of far-away pages (a 200-page book must not hold 200 bitmaps)
    if (c.width) { c.width = 0; c.height = 0; c.dataset.drawnWidth = ''; }
  }

  function draw(canvas) {
    if (!pdf || canvas.dataset.rendering === '1') return;
    var width = columnWidth();
    if (canvas.dataset.drawnWidth === String(Math.floor(width)) && canvas.width) return;
    canvas.dataset.rendering = '1';
    pdf.getPage(parseInt(canvas.getAttribute('data-page'), 10)).then(function (page) {
      var vp = page.getViewport({ scale: 1 });
      var v = page.getViewport({ scale: width / vp.width });
      canvas.width = Math.floor(v.width * dpr);
      canvas.height = Math.floor(v.height * dpr);
      canvas.style.width = Math.floor(v.width) + 'px';
      canvas.style.height = Math.floor(v.height) + 'px';
      canvas.dataset.ratio = v.height / v.width;
      var ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return page.render({ canvasContext: ctx, viewport: v }).promise;
    }).then(function () { canvas.dataset.drawnWidth = String(Math.floor(width)); canvas.dataset.rendering = ''; updateCounter(); },
            function () { canvas.dataset.rendering = ''; });
  }

  function updateCounter() {
    if (!pdf) return;
    var canvases = pagesEl.querySelectorAll('canvas');
    var mid = window.innerHeight / 2;
    var current = 1;
    for (var i = 0; i < canvases.length; i++) {
      var r = canvases[i].getBoundingClientRect();
      if (r.top <= mid) current = i + 1; else break;
    }
    pageEl.textContent = current + ' / ' + pdf.numPages;
  }

  document.getElementById('zoom-in').addEventListener('click', function () { scale = Math.min(scale + 0.25, 3); relayout(); });
  document.getElementById('zoom-out').addEventListener('click', function () { scale = Math.max(scale - 0.25, 0.5); relayout(); });
})();
