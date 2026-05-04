/**
 * justified-gallery.js — jQuery-free drop-in replacement for Justified Gallery
 *
 * Supports multiple independent galleries on the same page.
 * Each instance gets its own lightbox with prev/next scoped to that gallery.
 *
 * Usage:
 *   new JustifiedGallery('#gallery1', { rowHeight: 220 });
 *   new JustifiedGallery('#gallery2', { rowHeight: 220 });
 *
 * Options:
 *   rowHeight      {number}  Target row height in px.                  Default: 220
 *   maxRowHeight   {number}  Max row height (0 = unlimited).           Default: 0
 *   margins        {number}  Gap between items in px.                  Default: 4
 *   lastRow        {string}  'left'|'center'|'right'|'justify'|'hide'  Default: 'left'
 *   captions       {boolean} Show captions on hover.                   Default: true
 *   lightbox       {boolean} Enable built-in lightbox.                 Default: true
 *   imgSelector    {string}  Selector for <img> inside items.          Default: 'img'
 *   waitThumbnails {boolean} Wait for images before final layout.      Default: true
 *
 * Expected item structure (produced by gallery.html include):
 *   <figure class="jg-item" data-src="full.jpg" data-caption="My caption">
 *     <img src="thumb.jpg" alt="..." width="800" height="600" loading="lazy">
 *   </figure>
 */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.JustifiedGallery = factory();
  }
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  /* ─── defaults ─────────────────────────────────────────────────────────── */
  const DEFAULTS = {
    rowHeight:        230,
    maxRowHeight:     0,
    maxLastRowHeight: 0,  // justify falls back to 'left' if row would exceed this (0 = no limit)
    maxCols:          0,    // 0 = no limit; 2 = max 2 images per row, etc.
    margins:          4,
    lastRow:          'justify',
    captions:         true,
    lightbox:         false,
    imgSelector:      'img',
  };

  /* ─── helpers ───────────────────────────────────────────────────────────── */
  function mergeOptions(defaults, user, dataAttrs) {
    const o = Object.assign({}, defaults, user);
    if (dataAttrs.rowHeight)        o.rowHeight        = parseInt(dataAttrs.rowHeight,        10);
    if (dataAttrs.margins)          o.margins          = parseInt(dataAttrs.margins,          10);
    if (dataAttrs.lastRow)          o.lastRow          = dataAttrs.lastRow;
    if (dataAttrs.maxLastRowHeight) o.maxLastRowHeight = parseInt(dataAttrs.maxLastRowHeight, 10);
    if (dataAttrs.maxCols)         o.maxCols          = parseInt(dataAttrs.maxCols,          10);
    return o;
  }

  function getAspect(img) {
    const nw = img.naturalWidth  || parseInt(img.getAttribute('width'),  10) || 0;
    const nh = img.naturalHeight || parseInt(img.getAttribute('height'), 10) || 0;
    if (nw && nh) return nw / nh;
    if (img.width && img.height) return img.width / img.height;
    return 1.5;
  }

  function getCaptionText(item) {
    // Support both data-caption (new include) and data-sub-html (original lgGallery include).
    // data-sub-html contains HTML like <div class='lg-relative-caption-item'>My caption</div>
    // so strip tags to get plain text.
    const subHtml = item.getAttribute('data-sub-html');
    if (subHtml) {
      const tmp = document.createElement('div');
      tmp.innerHTML = subHtml;
      return tmp.textContent.trim();
    }
    return (
      item.getAttribute('data-caption') ||
      item.querySelector('figcaption')?.textContent ||
      item.querySelector('img')?.getAttribute('alt') ||
      ''
    ).trim();
  }

  function getFullSrc(item, img) {
    return (
      item.getAttribute('data-src') ||
      item.getAttribute('data-full') ||
      item.getAttribute('href') ||          // <a href="full.jpg"> — original include
      img?.getAttribute('data-src') ||
      img?.src ||
      ''
    );
  }

  function debounce(fn, wait) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
  }

  /* ─── layout engine ─────────────────────────────────────────────────────── */
  function computeRows(items, containerWidth, opts) {
    const { rowHeight, maxRowHeight, margins, maxCols } = opts;
    const rows = [];
    let row = [], rowAspectSum = 0;

    for (const item of items) {
      const img    = item.querySelector('img');
      const aspect = item._jgAspect || getAspect(img) || 1.5;
      item._jgAspect = aspect;

      row.push(item);
      rowAspectSum += aspect;

      const naturalWidth  = rowAspectSum * rowHeight + margins * (row.length - 1);
      const colLimitHit   = maxCols && row.length >= maxCols;

      if (naturalWidth >= containerWidth || colLimitHit) {
        const usable = containerWidth - margins * (row.length - 1);
        let h = usable / rowAspectSum;
        if (maxRowHeight && h > maxRowHeight) h = maxRowHeight;
        rows.push({ items: row, height: Math.round(h), isLast: false });
        row = []; rowAspectSum = 0;
      }
    }

    if (row.length) {
      let h = rowHeight;
      let effectiveLastRow = opts.lastRow;

      if (opts.lastRow === 'justify') {
        const usable = containerWidth - margins * (row.length - 1);
        h = usable / rowAspectSum;
        // If justified height would be too tall, fall back to natural left-aligned height
        if (opts.maxLastRowHeight && h > opts.maxLastRowHeight) {
          h = rowHeight;
          effectiveLastRow = 'left';
        }
      }

      if (opts.maxRowHeight && h > opts.maxRowHeight) h = opts.maxRowHeight;
      rows.push({ items: row, height: Math.round(h), isLast: true, effectiveLastRow });
    }

    return rows;
  }

  function applyLayout(rows, opts, container) {
    const { margins } = opts;
    const W = container.getBoundingClientRect().width || container.offsetWidth;

    // Detach items from any existing row wrappers back into the container
    container.querySelectorAll('.jg-row').forEach(r => {
      while (r.firstChild) container.insertBefore(r.firstChild, r);
      r.remove();
    });

    rows.forEach(row => {
      // For the last row, use effectiveLastRow (may differ from opts.lastRow
      // if justify was capped by maxLastRowHeight and fell back to 'left')
      const rowLastRow = row.isLast ? (row.effectiveLastRow || opts.lastRow) : null;

      const rowEl = document.createElement('div');
      rowEl.className = 'jg-row';
      if (row.isLast) {
        rowEl.classList.add('jg-row--last', 'jg-last-' + rowLastRow);
      }

      const usable = W - margins * (row.items.length - 1);
      const aspSum = row.items.reduce((s, it) => s + (it._jgAspect || 1.5), 0);

      row.items.forEach((item, ii) => {
        let w;
        if (row.isLast && rowLastRow !== 'justify') {
          // Natural width at the row height — don't stretch to fill
          w = Math.round((item._jgAspect || 1.5) * row.height);
        } else {
          if (ii === row.items.length - 1) {
            const assigned = row.items
              .slice(0, ii)
              .reduce((s, it) => s + Math.round((it._jgAspect || 1.5) / aspSum * usable), 0);
            w = usable - assigned;
          } else {
            w = Math.round((item._jgAspect || 1.5) / aspSum * usable);
          }
        }
        item.style.width  = w + 'px';
        item.style.height = row.height + 'px';
        rowEl.appendChild(item);
      });

      container.appendChild(rowEl);
    });
  }

  /* ─── lightbox — one per gallery instance ───────────────────────────────── */
  function buildLightbox(instanceId) {
    const lb = document.createElement('div');
    lb.className = 'jg-lightbox';
    lb.id        = 'jg-lb-' + instanceId;
    lb.setAttribute('role',       'dialog');
    lb.setAttribute('aria-modal', 'true');
    lb.setAttribute('aria-label', 'Image viewer');
    lb.innerHTML = `
      <button class="jg-lightbox__close" aria-label="Close">&#x2715;</button>
      <span class="jg-lightbox__counter"></span>
      <div class="jg-lightbox__inner">
        <button class="jg-lightbox__btn jg-lightbox__btn--prev" aria-label="Previous image">&#8592;</button>
        <img class="jg-lightbox__img" src="" alt="" />
        <button class="jg-lightbox__btn jg-lightbox__btn--next" aria-label="Next image">&#8594;</button>
      </div>
      <p class="jg-lightbox__caption"></p>
    `;
    document.body.appendChild(lb);
    return lb;
  }

  function initLightbox(lb, items) {
    const lbImg = lb.querySelector('.jg-lightbox__img');
    const lbCap = lb.querySelector('.jg-lightbox__caption');
    const lbCtr = lb.querySelector('.jg-lightbox__counter');
    let current = 0;

    const open = (index) => {
      current       = index;
      const item    = items[index];
      const img     = item.querySelector('img');
      const src     = getFullSrc(item, img);
      const cap     = getCaptionText(item);

      lbImg.classList.add('is-loading');
      lbImg.src         = '';
      lbCap.textContent = cap;
      lbCtr.textContent = (index + 1) + ' / ' + items.length;
      lb.classList.add('is-open');
      document.body.style.overflow = 'hidden';

      const tmp   = new Image();
      tmp.onload  = () => { lbImg.src = src; lbImg.alt = img?.alt || ''; lbImg.classList.remove('is-loading'); };
      tmp.onerror = () => { lbImg.src = src; lbImg.classList.remove('is-loading'); };
      tmp.src     = src;

      lb.querySelector('.jg-lightbox__close').focus();
    };

    const close = () => {
      lb.classList.remove('is-open');
      document.body.style.overflow = '';
      lbImg.src = '';
    };

    const nav = (dir) => open((current + dir + items.length) % items.length);

    lb.querySelector('.jg-lightbox__close').addEventListener('click', close);
    lb.querySelector('.jg-lightbox__btn--prev').addEventListener('click', () => nav(-1));
    lb.querySelector('.jg-lightbox__btn--next').addEventListener('click', () => nav(1));
    lb.addEventListener('click', e => { if (e.target === lb) close(); });

    // Keyboard events — guarded so only the open lightbox responds
    document.addEventListener('keydown', e => {
      if (!lb.classList.contains('is-open')) return;
      if (e.key === 'Escape')     close();
      if (e.key === 'ArrowLeft')  nav(-1);
      if (e.key === 'ArrowRight') nav(1);
    });

    return open;
  }

  /* ─── main constructor ──────────────────────────────────────────────────── */
  let instanceCounter = 0;

  function JustifiedGallery(selector, userOptions) {
    const container = typeof selector === 'string'
      ? document.querySelector(selector)
      : selector;

    if (!container) {
      console.warn('JustifiedGallery: container not found:', selector);
      return;
    }

    const instanceId = container.id || ('jg' + (++instanceCounter));
    const dataAttrs  = {
      rowHeight:        container.dataset.rowHeight,
      margins:          container.dataset.margins,
      lastRow:          container.dataset.lastRow,
      maxLastRowHeight: container.dataset.maxLastRowHeight,
      maxCols:          container.dataset.cols,  // data-cols="2"
    };

    // Class name shorthands → maxCols.
    // Supports: "2by2", "3by3", "cols-2", "cols-3", etc.
    // A data-cols attribute always takes precedence over a class name.
    if (!dataAttrs.maxCols) {
      const colsFromClass =
        // matches "2by2", "3by3", "4by4" …
        (container.className.match(/\b(\d+)by\d+\b/)  ||
        // matches "cols-2", "cols-3" …
         container.className.match(/\bcols-(\d+)\b/))?.[1];
      if (colsFromClass) {
        dataAttrs.maxCols = colsFromClass;
        container.dataset.cols = colsFromClass; // write back so it's inspectable
      }
    }
    const opts = mergeOptions(DEFAULTS, userOptions || {}, dataAttrs);

    container.classList.add('jg-gallery');
    container.style.setProperty('--jg-gap',       opts.margins   + 'px');
    container.style.setProperty('--jg-row-height', opts.rowHeight + 'px');

    // Unwrap any existing .jg-row divs from a previous run (or from a
    // conflicting init) so we're always working with the raw items.
    container.querySelectorAll('.jg-row').forEach(r => {
      while (r.firstChild) container.insertBefore(r.firstChild, r);
      r.remove();
    });

    // Collect direct-child items — now guaranteed to be the real images/anchors
    const items = Array.from(container.children)
      .filter(el => el.nodeType === 1); // elements only, no text nodes

    // Prep each item
    items.forEach(item => {
      item.classList.add('jg-item');
      item.setAttribute('tabindex', '0');
      item.setAttribute('role',     'button');

      if (opts.captions) {
        const text = getCaptionText(item);
        if (text && !item.querySelector('.jg-caption')) {
          const cap       = document.createElement('div');
          cap.className   = 'jg-caption';
          cap.textContent = text;
          item.appendChild(cap);
        }
      }
    });

    // Per-instance lightbox
    if (opts.lightbox) {
      const lb   = buildLightbox(instanceId);
      const open = initLightbox(lb, items);

      items.forEach((item, i) => {
        item.addEventListener('click', () => open(i));
        item.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(i); }
        });
      });
    }

    /* ── layout ──────────────────────────────────────────────────────────── */
    const layout = () => {
      const W = container.getBoundingClientRect().width || container.offsetWidth;
      if (!W) return;
      applyLayout(computeRows(items, W, opts), opts, container);
    };

    const ro = new ResizeObserver(debounce(layout, 100));
    ro.observe(container);

    // Strategy: layout immediately using whatever aspect info is available
    // (naturalWidth/Height if already decoded, else width/height attributes,
    // else the fallback 1.5). Then re-layout as each image finishes loading
    // to correct any aspects that were estimated.
    //
    // This avoids the trap of waiting on lazy-loaded images that may never
    // fire 'load' until the user scrolls to them.
    layout();

    const imgs = items.map(i => i.querySelector('img')).filter(Boolean);
    imgs.forEach(img => {
      if (img.complete) return; // already decoded — aspect already correct
      img.addEventListener('load',  () => {
        // Clear the cached aspect so computeRows re-reads naturalWidth/Height
        const item = img.closest('.jg-item');
        if (item) delete item._jgAspect;
        layout();
      }, { once: true });
      img.addEventListener('error', () => layout(), { once: true });
    });

    return {
      layout,
      destroy() {
        ro.disconnect();
        container.classList.remove('jg-gallery');
        container.querySelectorAll('.jg-row').forEach(r => {
          while (r.firstChild) container.insertBefore(r.firstChild, r);
          r.remove();
        });
        items.forEach(item => {
          item.classList.remove('jg-item');
          item.style.width = item.style.height = '';
          item.removeAttribute('tabindex');
          item.removeAttribute('role');
          item.querySelector('.jg-caption')?.remove();
        });
        document.getElementById('jg-lb-' + instanceId)?.remove();
      }
    };
  }

  /* ─── auto-init ──────────────────────────────────────────────────────────
   * Finds every div.jg (and div.jg-gallery) on the page and initialises
   * each one automatically — no per-gallery <script> tag required.
   *
   * Per-container options via data attributes:
   *   data-row-height="180"
   *   data-margins="6"
   *   data-last-row="center"
   * ───────────────────────────────────────────────────────────────────────*/
  function autoInit() {
    // Match both the legacy "jg" class and the new "jg-gallery" class
    document.querySelectorAll('div.jg, div.jg-gallery').forEach(container => {
      if (container.dataset.jgInit) return; // skip if already initialised
      container.dataset.jgInit = '1';
      // Options are read from data attributes inside the JustifiedGallery
      // constructor via mergeOptions — no need to pass them explicitly here.
      new JustifiedGallery(container);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }

  return JustifiedGallery;
}));