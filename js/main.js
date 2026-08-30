/* ==========================================================================
   Mosaic — main.js  (vanilla JS, no jQuery)
   Dynamic gallery loaded from data/gallery.json
   One function per feature · guard clauses · reduced-motion aware
   ========================================================================== */
(function () {
  'use strict';

  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------------- utils */
  function qs(sel, ctx) { return (ctx || document).querySelector(sel); }
  function qsa(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function isVideoRecord(rec) {
    var mt = (rec.mimeType || '').toLowerCase();
    return mt.indexOf('video') === 0;
  }
  function slugify(str) {
    return String(str == null ? '' : str)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'uncategorized';
  }

  /* ---------------------------------------------- sticky header state */
  function initStickyHeader() {
    var header = qs('#siteHeader');
    if (!header) return;
    var onScroll = function () {
      header.classList.toggle('is-scrolled', window.scrollY > 8);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ---------------------------------------------- close mobile nav on link */
  function initMobileNav() {
    var collapse = qs('#primaryNav');
    if (!collapse) return;
    qsa('.nav-link, .btn-accent', collapse).forEach(function (link) {
      link.addEventListener('click', function () {
        if (collapse.classList.contains('show') && window.bootstrap) {
          var inst = window.bootstrap.Collapse.getInstance(collapse) ||
                     new window.bootstrap.Collapse(collapse, { toggle: false });
          inst.hide();
        }
      });
    });
  }

  /* ---------------------------------------------- smooth in-page scroll */
  function initSmoothScroll() {
    qsa('a[href^="#"]').forEach(function (a) {
      var id = a.getAttribute('href');
      if (id === '#' || id.length < 2) return;
      a.addEventListener('click', function (e) {
        var target = document.getElementById(id.slice(1));
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'start' });
      });
    });
  }

  /* ---------------------------------------------- reveal on scroll */
  function initReveal(root) {
    var els = qsa('.reveal', root || document);
    if (!els.length) return;
    if (prefersReduced || !('IntersectionObserver' in window)) {
      els.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }
    var io = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          obs.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ---------------------------------------------- count-up stats */
  function initCountUp() {
    var nums = qsa('.stat-num[data-count]');
    if (!nums.length) return;
    if (prefersReduced || !('IntersectionObserver' in window)) {
      nums.forEach(function (n) { n.textContent = n.getAttribute('data-count'); });
      return;
    }
    var run = function (el) {
      var target = parseInt(el.getAttribute('data-count'), 10) || 0;
      var start = null, dur = 1200;
      var step = function (ts) {
        if (start === null) start = ts;
        var p = Math.min((ts - start) / dur, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(eased * target);
        if (p < 1) requestAnimationFrame(step);
        else el.textContent = target;
      };
      requestAnimationFrame(step);
    };
    var io = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { run(entry.target); obs.unobserve(entry.target); }
      });
    }, { threshold: 0.5 });
    nums.forEach(function (n) { io.observe(n); });
  }

  /* ---------------------------------------------- gallery data + state */
  var Gallery = {
    records: [],       // all records from gallery.json
    filters: [],        // [{ key, label }]
    filter: 'all',
    pageSize: 24,
    shown: 24,
    grid: null,
    filterBar: null,
    loadMoreWrap: null,
    loadMore: null,
    countEl: null,
    emptyEl: null,
    errorEl: null
  };

  function buildFilters(records) {
    var filters = [
      { key: 'all', label: 'All' },
      { key: 'highlights', label: 'Highlights' },
      { key: 'photos', label: 'Photos' },
      { key: 'videos', label: 'Videos' }
    ];
    var seen = {};
    records.forEach(function (rec) {
      var cat = rec.category || rec.folder;
      if (!cat) return;
      var key = 'cat:' + slugify(cat);
      if (seen[key]) return;
      seen[key] = true;
      filters.push({ key: key, label: cat });
    });
    return filters;
  }

  function recordMatchesFilter(rec, filterKey) {
    if (filterKey === 'all') return true;
    if (filterKey === 'highlights') return !!rec.highlight;
    if (filterKey === 'photos') return !isVideoRecord(rec);
    if (filterKey === 'videos') return isVideoRecord(rec);
    if (filterKey.indexOf('cat:') === 0) {
      var cat = rec.category || rec.folder || '';
      return 'cat:' + slugify(cat) === filterKey;
    }
    return false;
  }

  function renderFilterPills() {
    if (!Gallery.filterBar) return;
    Gallery.filterBar.innerHTML = '';
    Gallery.filters.forEach(function (f) {
      var pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'filter-pill';
      pill.setAttribute('data-filter', f.key);
      pill.setAttribute('aria-pressed', f.key === Gallery.filter ? 'true' : 'false');
      pill.classList.toggle('is-active', f.key === Gallery.filter);
      pill.textContent = f.label;
      pill.addEventListener('click', function () { setFilter(f.key); });
      Gallery.filterBar.appendChild(pill);
    });
  }

    function tileMarkup(rec) {
    var isVideo = isVideoRecord(rec);
    var title = escapeHtml(rec.name || '');
    var caption = escapeHtml(rec.category || rec.folder || '');
    var thumb = escapeHtml(rec.thumbnailUrl || '');
    var driveUrl = escapeHtml(rec.driveUrl || '');
    var fileId = (driveUrl.match(/\/file\/d\/([^/]+)/) || [])[1] || '';

    var badge = isVideo ? '<span class="tile-badge">Video</span>' : '';
    var img = '<img src="' + thumb + '" alt="' + title + '" loading="lazy">';

    var openAttrs = 'class="tile-open"';

    return '' +
      '<div class="tile reveal" data-category="' + escapeHtml(slugCategoryKey(rec)) + '" ' +
      'data-id="' + escapeHtml(rec.id || '') + '" ' +
      'data-title="' + title + '" ' +
      'data-caption="' + caption + '" ' +
      'data-thumb="' + thumb + '" ' +
      'data-drive-url="' + driveUrl + '" ' +
      'data-file-id="' + fileId + '" ' +
      'data-is-video="' + (isVideo ? '1' : '0') + '">' +
      '<button type="button" ' + openAttrs + '>' +
        img +
        badge +
      '</button>' +
    '</div>';
  }

  function slugCategoryKey(rec) {
    var cat = rec.category || rec.folder || '';
    return 'cat:' + slugify(cat);
  }

  function visibleFilteredRecords() {
    return Gallery.records.filter(function (rec) {
      return recordMatchesFilter(rec, Gallery.filter);
    });
  }

  function renderGrid() {
    if (!Gallery.grid) return;
    var matches = visibleFilteredRecords();
    var toShow = matches.slice(0, Gallery.shown);

    Gallery.grid.innerHTML = toShow.map(tileMarkup).join('');

    

        // wire up all tiles (photos and videos) to open the lightbox
    qsa('.tile', Gallery.grid).forEach(function (tile) {
      var btn = qs('.tile-open', tile);
      if (!btn) return;

      btn.addEventListener('click', function () {
        refreshLightboxSet();
        var idx = Lightbox.items.indexOf(tile);
        if (idx === -1) return;
        openLightbox(idx, btn);
      });
    });

    // load more visibility
    var canLoadMore = matches.length > Gallery.shown;
    if (Gallery.loadMoreWrap) Gallery.loadMoreWrap.style.display = canLoadMore ? '' : 'none';
    if (Gallery.loadMore) {
      var remaining = matches.length - Gallery.shown;
      var rem = qs('.load-remaining', Gallery.loadMore);
      if (rem) rem.textContent = '+' + Math.max(remaining, 0);
    }

    // count + empty state
    if (Gallery.countEl) {
      if (Gallery.filter === 'all') {
        Gallery.countEl.textContent = 'Showing ' + toShow.length + ' / ' + Gallery.records.length + ' frames';
      } else {
        var f = Gallery.filters.filter(function (x) { return x.key === Gallery.filter; })[0];
        var label = f ? f.label : Gallery.filter;
        Gallery.countEl.textContent = 'Showing ' + toShow.length + ' in ' + label;
      }
    }
    if (Gallery.emptyEl) Gallery.emptyEl.hidden = toShow.length !== 0;

    initReveal(Gallery.grid);
    refreshLightboxSet();
  }

  function setFilter(key) {
    Gallery.filter = key;
    Gallery.shown = Gallery.pageSize;
    renderFilterPills();
    renderGrid();
  }

  function showError(message) {
    if (Gallery.errorEl) {
      Gallery.errorEl.hidden = false;
      Gallery.errorEl.textContent = message;
    } else if (Gallery.grid) {
      Gallery.grid.innerHTML = '<p class="gallery-error" role="alert">' + escapeHtml(message) + '</p>';
    }
    if (Gallery.loadMoreWrap) Gallery.loadMoreWrap.style.display = 'none';
    if (Gallery.countEl) Gallery.countEl.textContent = '';
  }

  function initGallery() {
    Gallery.grid = qs('#masonry');
    Gallery.filterBar = qs('.filter-bar');
    Gallery.loadMoreWrap = qs('#loadMoreWrap');
    Gallery.loadMore = qs('#loadMore');
    Gallery.countEl = qs('#galleryCount');
    Gallery.emptyEl = qs('#emptyState');
    Gallery.errorEl = qs('#galleryError');

    if (!Gallery.grid) return;

    if (Gallery.loadMore) {
      Gallery.loadMore.addEventListener('click', function () {
        Gallery.shown += Gallery.pageSize;
        renderGrid();
      });
    }

    if (Gallery.loadMoreWrap) Gallery.loadMoreWrap.style.display = 'none';

    fetch('data/gallery.json')
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        var records = Array.isArray(data) ? data : (data && Array.isArray(data.items) ? data.items : null);
        if (!records) throw new Error('Unexpected gallery.json format');
        Gallery.records = records;
        Gallery.filters = buildFilters(records);
        renderFilterPills();
        renderGrid();
        initLightbox();
      })
      .catch(function (err) {
        showError('Sorry — the gallery could not be loaded right now. Please try again later.');
        if (window.console && console.error) console.error('gallery.json load failed:', err);
      });
  }

  /* ---------------------------------------------- lightbox */
  var Lightbox = {
    el: null, img: null, titleEl: null, metaEl: null, counterEl: null, openOriginalEl: null,
    items: [], index: 0, lastFocus: null, focusables: [], initialized: false
  };

    function collectVisibleTiles() {
    if (!Gallery.grid) return [];
    return qsa('.tile', Gallery.grid);
  }

  function refreshLightboxSet() {
    Lightbox.items = collectVisibleTiles();
  }

  function initLightbox() {
    var box = qs('#lightbox');
    if (!box) return;
    Lightbox.el = box;
    Lightbox.img = qs('#lightboxImg');
    Lightbox.titleEl = qs('#lightboxTitle');
    Lightbox.metaEl = qs('#lightboxMeta');
    Lightbox.counterEl = qs('#lightboxCounter');
    Lightbox.openOriginalEl = qs('#lightboxOpenOriginal');
    Lightbox.focusables = qsa('.lightbox-btn', box);

    refreshLightboxSet();

    if (!Lightbox.initialized) {
      qsa('[data-close]', box).forEach(function (b) {
        b.addEventListener('click', closeLightbox);
      });
      var prev = qs('[data-prev]', box);
      var next = qs('[data-next]', box);
      if (prev) prev.addEventListener('click', function () { step(-1); });
      if (next) next.addEventListener('click', function () { step(1); });

      document.addEventListener('keydown', onKeydown);

      // basic swipe on touch
      var startX = null;
      box.addEventListener('touchstart', function (e) { startX = e.touches[0].clientX; }, { passive: true });
      box.addEventListener('touchend', function (e) {
        if (startX === null) return;
        var dx = e.changedTouches[0].clientX - startX;
        if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
        startX = null;
      }, { passive: true });

      Lightbox.initialized = true;
    }
  }

      function fillFromTile(tile) {
    var thumb = tile.getAttribute('data-thumb') || '';
    var title = tile.getAttribute('data-title') || '';
    var caption = tile.getAttribute('data-caption') || '';
    var driveUrl = tile.getAttribute('data-drive-url') || '';
    var fileId = tile.getAttribute('data-file-id') || '';
    var isVideo = tile.getAttribute('data-is-video') === '1';

    var imgEl = Lightbox.img;
    var videoContainer = document.getElementById('lightboxVideoContainer');
    var videoIframe = document.getElementById('lightboxVideoIframe');

    if (!videoContainer || !videoIframe) {
      // Fallback: if video elements are missing, treat as photo
      isVideo = false;
    }

    if (isVideo && fileId) {
      // Video mode
      imgEl.style.display = 'none';
      videoContainer.hidden = false;
      videoIframe.src = 'https://drive.google.com/file/d/' + encodeURIComponent(fileId) + '/preview';

      Lightbox.titleEl.textContent = title;
      Lightbox.metaEl.textContent = caption;
      Lightbox.counterEl.textContent = (Lightbox.index + 1) + ' / ' + Lightbox.items.length;

      if (Lightbox.openOriginalEl) {
        if (driveUrl) {
          Lightbox.openOriginalEl.href = driveUrl;
          Lightbox.openOriginalEl.hidden = false;
        } else {
          Lightbox.openOriginalEl.removeAttribute('href');
          Lightbox.openOriginalEl.hidden = true;
        }
      }
    } else {
      // Photo mode
      imgEl.style.display = 'block';
      if (videoContainer) videoContainer.hidden = true;
      videoIframe.src = '';

      imgEl.src = thumb;
      imgEl.alt = title;
      Lightbox.titleEl.textContent = title;
      Lightbox.metaEl.textContent = caption;
      Lightbox.counterEl.textContent = (Lightbox.index + 1) + ' / ' + Lightbox.items.length;

      if (Lightbox.openOriginalEl) {
        if (driveUrl) {
          Lightbox.openOriginalEl.href = driveUrl;
          Lightbox.openOriginalEl.hidden = false;
        } else {
          Lightbox.openOriginalEl.removeAttribute('href');
          Lightbox.openOriginalEl.hidden = true;
        }
      }
    }
  }

  function openLightbox(idx, trigger) {
    if (!Lightbox.items.length) return;
    Lightbox.lastFocus = trigger || document.activeElement;
    Lightbox.index = idx;
    fillFromTile(Lightbox.items[idx]);
    Lightbox.el.hidden = false;
    document.body.style.overflow = 'hidden';
    // force reflow then animate
    void Lightbox.el.offsetWidth;
    Lightbox.el.classList.add('is-open');
    var closeBtn = qs('.lightbox-close', Lightbox.el);
    if (closeBtn) closeBtn.focus();
  }

  function closeLightbox() {
    if (!Lightbox.el || Lightbox.el.hidden) return;
    Lightbox.el.classList.remove('is-open');
    var finish = function () {
      Lightbox.el.hidden = true;
      document.body.style.overflow = '';
      if (Lightbox.lastFocus && typeof Lightbox.lastFocus.focus === 'function') {
        Lightbox.lastFocus.focus();
      }
    };
    if (prefersReduced) { finish(); }
    else { window.setTimeout(finish, 260); }
  }

  function step(dir) {
    if (!Lightbox.items.length) return;
    Lightbox.index = (Lightbox.index + dir + Lightbox.items.length) % Lightbox.items.length;
    fillFromTile(Lightbox.items[Lightbox.index]);
  }

  function onKeydown(e) {
    if (!Lightbox.el || Lightbox.el.hidden) return;
    switch (e.key) {
      case 'Escape': e.preventDefault(); closeLightbox(); break;
      case 'ArrowRight': e.preventDefault(); step(1); break;
      case 'ArrowLeft': e.preventDefault(); step(-1); break;
      case 'Tab': trapFocus(e); break;
      default: break;
    }
  }

  function trapFocus(e) {
    var f = Lightbox.focusables;
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    } else if (f.indexOf(document.activeElement) === -1) {
      e.preventDefault(); first.focus();
    }
  }

  /* ---------------------------------------------- newsletter form */
  function initSubscribe() {
    var form = qs('#subscribeForm');
    if (!form) return;
    var input = qs('#email', form);
    var note = qs('#formNote', form);
    var re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var val = (input.value || '').trim();
      if (!re.test(val)) {
        note.textContent = 'Please enter a valid email address.';
        note.className = 'form-note mono is-error';
        input.focus();
        return;
      }
      note.textContent = 'Thank you — you are on the print list.';
      note.className = 'form-note mono is-ok';
      form.reset();
    });
  }

  /* ---------------------------------------------- boot */
  function boot() {
    initStickyHeader();
    initMobileNav();
    initSmoothScroll();
    initReveal();
    initCountUp();
    initGallery();
    initSubscribe();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
