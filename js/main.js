/* ==========================================================================
   Mosaic — main.js  (vanilla JS, no jQuery)
   One function per feature · guard clauses · reduced-motion aware
   ========================================================================== */
(function () {
  'use strict';

  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------------- utils */
  function qs(sel, ctx) { return (ctx || document).querySelector(sel); }
  function qsa(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

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
  function initReveal() {
    var els = qsa('.reveal');
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

  /* ---------------------------------------------- gallery: filter + load more */
  var GalleryState = { filter: 'all', pageSize: 12, revealed: false };

  function initGallery() {
    var grid = qs('#masonry');
    if (!grid) return;
    var tiles = qsa('.tile', grid);
    var pills = qsa('.filter-pill');
    var seriesLinks = qsa('.series-link');
    var loadMoreWrap = qs('#loadMoreWrap');
    var loadMore = qs('#loadMore');
    var countEl = qs('#galleryCount');
    var emptyEl = qs('#emptyState');
    var total = tiles.length;

    function matches(tile) {
      return GalleryState.filter === 'all' ||
             tile.getAttribute('data-category') === GalleryState.filter;
    }

    function render() {
      var shownCount = 0;
      var matchingSoFar = 0;

      tiles.forEach(function (tile) {
        var isMatch = matches(tile);
        var show;
        if (!isMatch) {
          show = false;
        } else if (GalleryState.filter !== 'all') {
          // filtered view: show every match, ignore paging
          show = true;
        } else {
          // "all" view: honour paging window
          show = GalleryState.revealed || matchingSoFar < GalleryState.pageSize;
        }
        if (isMatch) matchingSoFar++;
        tile.classList.toggle('is-hidden', !show);
        if (show) shownCount++;
      });

      // load-more visibility (only meaningful in the paged "all" view)
      var matchCount = tiles.reduce(function (acc, t) { return acc + (matches(t) ? 1 : 0); }, 0);
      var canPage = (GalleryState.filter === 'all' && !GalleryState.revealed && matchCount > GalleryState.pageSize);
      if (loadMoreWrap) loadMoreWrap.style.display = canPage ? '' : 'none';
      if (loadMore) {
        var remaining = matchCount - GalleryState.pageSize;
        var rem = qs('.load-remaining', loadMore);
        if (rem) rem.textContent = '+' + Math.max(remaining, 0);
      }

      // count + empty state
      if (countEl) {
        if (GalleryState.filter === 'all') {
          countEl.textContent = 'Showing ' + shownCount + ' / ' + total + ' frames';
        } else {
          countEl.textContent = 'Showing ' + shownCount + ' in ' +
            GalleryState.filter.charAt(0).toUpperCase() + GalleryState.filter.slice(1);
        }
      }
      if (emptyEl) emptyEl.hidden = shownCount !== 0;

      refreshLightboxSet();
    }

    function setFilter(value) {
      GalleryState.filter = value;
      // reset paging whenever we switch context
      GalleryState.revealed = (value !== 'all');
      pills.forEach(function (p) {
        var on = p.getAttribute('data-filter') === value;
        p.classList.toggle('is-active', on);
        p.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      render();
    }

    pills.forEach(function (pill) {
      pill.addEventListener('click', function () {
        setFilter(pill.getAttribute('data-filter'));
      });
    });

    seriesLinks.forEach(function (link) {
      link.addEventListener('click', function () {
        setFilter(link.getAttribute('data-filter'));
        var gallery = qs('#gallery');
        if (gallery) gallery.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'start' });
      });
    });

    if (loadMore) {
      loadMore.addEventListener('click', function () {
        GalleryState.revealed = true;
        render();
      });
    }

    render();
  }

  /* ---------------------------------------------- lightbox */
  var Lightbox = {
    el: null, img: null, titleEl: null, metaEl: null, counterEl: null,
    items: [], index: 0, lastFocus: null, focusables: [],
  };

  function collectVisibleTiles() {
    return qsa('.tile').filter(function (t) {
      return !t.classList.contains('is-hidden');
    });
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
    Lightbox.focusables = qsa('.lightbox-btn', box);

    refreshLightboxSet();

    // open on tile click (event delegation)
    var grid = qs('#masonry');
    if (grid) {
      grid.addEventListener('click', function (e) {
        var btn = e.target.closest('.tile-open');
        if (!btn) return;
        var tile = btn.closest('.tile');
        if (!tile) return;
        refreshLightboxSet();
        var idx = Lightbox.items.indexOf(tile);
        if (idx === -1) return;
        openLightbox(idx, btn);
      });
    }

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
  }

  function fillFromTile(tile) {
    var innerImg = qs('img', tile);
    Lightbox.img.src = innerImg ? innerImg.getAttribute('src') : '';
    Lightbox.img.alt = innerImg ? innerImg.getAttribute('alt') : '';
    Lightbox.titleEl.textContent = tile.getAttribute('data-title') || '';
    Lightbox.metaEl.textContent = tile.getAttribute('data-caption') || '';
    Lightbox.counterEl.textContent = (Lightbox.index + 1) + ' / ' + Lightbox.items.length;
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
    if (Lightbox.el.hidden) return;
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
    if (Lightbox.el.hidden) return;
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
    initLightbox();
    initSubscribe();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
