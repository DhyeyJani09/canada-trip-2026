/* ==========================================================================
   Mosaic — dynamic gallery
   ========================================================================== */
(function () {
  'use strict';

  var prefersReducedMotion =
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function qs(selector, context) {
    return (context || document).querySelector(selector);
  }

  function qsa(selector, context) {
    return Array.prototype.slice.call(
      (context || document).querySelectorAll(selector)
    );
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[char];
    });
  }

  function slugify(value) {
    return String(value == null ? '' : value)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'uncategorized';
  }

  // Safety net: if a category/folder name ever comes through as a slug
  // (e.g. "1000-islands" instead of "1000 islands"), humanize it for display
  // instead of showing the raw hyphenated value on a filter pill.
  // A small lookup handles the cases plain title-casing gets wrong —
  // acronyms (TTC, ROM, CN) and possessives (Ripley's).
  var LABEL_OVERRIDES = {
  'niagara': 'Niagara ⛲️',
  'cn-tower': 'CN TOWER 📍',
  'ripleys': "Ripley's Aquarium 🎣🦈",
  'ripley-s-aquarium': "Ripley's Aquarium 🎣🦈",
  'cruise': 'Toronto Cruise ⛴️',
  'toronto-cruise': 'Toronto Cruise ⛴️',
  'rom': 'ROM 🗿🦖',
  'montreal': 'Montreal ⛪️',
  '1000-islands': '1000 islands 🏝',
  'lion-safari': 'African Lion Safari 🦁',
  'african-lion-safari': 'African Lion Safari 🦁',
  'zoo': 'Toronto Zoo 🦒🦍',
  'toronto-zoo': 'Toronto Zoo 🦒🦍',
  'tobermory': 'Tobermory 🏝🚢',
  'blue-mountain': 'Blue Mountain ⛰️🚠🎢',
  'streetcar': 'Street Car TTC 🚃',
  'street-car-ttc': 'Street Car TTC 🚃',
  'ttc': 'Street Car TTC 🚃'
};

  function prettifyLabel(value) {
    var str = String(value == null ? '' : value).trim();
    if (!str) return 'Uncategorized';

    var overrideKey = slugify(str);
    if (LABEL_OVERRIDES[overrideKey]) return LABEL_OVERRIDES[overrideKey];

    // only "de-slugify" if it looks like a slug (no spaces, has separators)
    if (/\s/.test(str)) return str;
    return str
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function isVideo(record) {
    return String(record.mimeType || '').toLowerCase().indexOf('video/') === 0;
  }

  function initStickyHeader() {
    var header = qs('#siteHeader');
    if (!header) return;

    function updateHeader() {
      header.classList.toggle('is-scrolled', window.scrollY > 8);
    }

    updateHeader();
    window.addEventListener('scroll', updateHeader, { passive: true });
  }

  function initMobileNav() {
    var navigation = qs('#primaryNav');
    if (!navigation) return;

    qsa('.nav-link, .btn-accent', navigation).forEach(function (link) {
      link.addEventListener('click', function () {
        if (!navigation.classList.contains('show') || !window.bootstrap) return;

        var instance =
          window.bootstrap.Collapse.getInstance(navigation) ||
          new window.bootstrap.Collapse(navigation, { toggle: false });

        instance.hide();
      });
    });
  }

  function initSmoothScroll() {
    qsa('a[href^="#"]').forEach(function (link) {
      var href = link.getAttribute('href');

      if (!href || href === '#' || href.length < 2) return;

      link.addEventListener('click', function (event) {
        var target = document.getElementById(href.slice(1));

        if (!target) return;

        event.preventDefault();
        target.scrollIntoView({
          behavior: prefersReducedMotion ? 'auto' : 'smooth',
          block: 'start'
        });
      });
    });
  }

  function initReveal(root) {
    var elements = qsa('.reveal', root || document);

    if (!elements.length) return;

    if (prefersReducedMotion || !('IntersectionObserver' in window)) {
      elements.forEach(function (element) {
        element.classList.add('is-visible');
      });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries, currentObserver) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;

          entry.target.classList.add('is-visible');
          currentObserver.unobserve(entry.target);
        });
      },
      {
        rootMargin: '0px 0px -8% 0px',
        threshold: 0.05
      }
    );

    elements.forEach(function (element) {
      observer.observe(element);
    });
  }

  function initCountUp() {
    var numbers = qsa('.stat-num[data-count]');

    if (!numbers.length) return;

    if (prefersReducedMotion || !('IntersectionObserver' in window)) {
      numbers.forEach(function (number) {
        number.textContent = number.getAttribute('data-count');
      });
      return;
    }

    function countTo(element) {
      var target = parseInt(element.getAttribute('data-count'), 10) || 0;
      var start = null;
      var duration = 1200;

      function step(timestamp) {
        if (start === null) start = timestamp;

        var progress = Math.min((timestamp - start) / duration, 1);
        var easedProgress = 1 - Math.pow(1 - progress, 3);

        element.textContent = Math.round(easedProgress * target);

        if (progress < 1) {
          window.requestAnimationFrame(step);
        } else {
          element.textContent = target;
        }
      }

      window.requestAnimationFrame(step);
    }

    var observer = new IntersectionObserver(
      function (entries, currentObserver) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;

          countTo(entry.target);
          currentObserver.unobserve(entry.target);
        });
      },
      { threshold: 0.5 }
    );

    numbers.forEach(function (number) {
      observer.observe(number);
    });
  }

  var Gallery = {
    records: [],
    filters: [],
    activeFilter: 'all',
    pageSize: 24,
    shown: 24,
    grid: null,
    filterBar: null,
    loadMore: null,
    loadMoreWrap: null,
    countElement: null,
    emptyElement: null,
    errorElement: null
  };

  var Lightbox = {
    element: null,
    image: null,
    title: null,
    meta: null,
    counter: null,
    openOriginal: null,
    items: [],
    index: 0,
    lastFocused: null,
    initialized: false
  };

  function categoryFor(record) {
    return record.category || record.folder || 'Uncategorized';
  }

  function buildFilters(records) {
  var filters = [
    { key: 'all', label: 'All' },
    { key: 'highlights', label: 'Highlights' },
    { key: 'photos', label: 'Photos' },
    { key: 'videos', label: 'Videos' }
  ];

  var desiredOrder = [
    'niagara',
    'cn-tower',
    'ripleys',
    'cruise',
    'rom',
    'montreal',
    '1000-islands',
    'lion-safari',
    'zoo',
    'tobermory',
    'blue-mountain',
    'streetcar'
  ];

  var categories = {};

  records.forEach(function (record) {
    var category = categoryFor(record);
    var key = slugify(category);

    if (!categories[key]) {
      categories[key] = category;
    }
  });

  desiredOrder.forEach(function (desiredKey) {
    if (!categories[desiredKey]) return;

    filters.push({
      key: 'category:' + desiredKey,
      label: LABEL_OVERRIDES[desiredKey] || prettifyLabel(categories[desiredKey])
    });
  });

  return filters;
}

  function recordMatches(record, filterKey) {
    if (filterKey === 'all') return true;
    if (filterKey === 'highlights') return Boolean(record.highlight);
    if (filterKey === 'photos') return !isVideo(record);
    if (filterKey === 'videos') return isVideo(record);

    if (filterKey.indexOf('category:') === 0) {
      return filterKey === 'category:' + slugify(categoryFor(record));
    }

    return false;
  }

  function currentRecords() {
    return Gallery.records.filter(function (record) {
      return recordMatches(record, Gallery.activeFilter);
    });
  }

  function renderFilters() {
    if (!Gallery.filterBar) return;

    Gallery.filterBar.innerHTML = '';

    Gallery.filters.forEach(function (filter) {
      var button = document.createElement('button');

      button.type = 'button';
      button.className = 'filter-pill';
      button.textContent = filter.label;
      button.setAttribute('data-filter', filter.key);
      button.setAttribute(
        'aria-pressed',
        filter.key === Gallery.activeFilter ? 'true' : 'false'
      );

      if (filter.key === Gallery.activeFilter) {
        button.classList.add('is-active');
      }

      button.addEventListener('click', function () {
        Gallery.activeFilter = filter.key;
        Gallery.shown = Gallery.pageSize;
        renderFilters();
        renderGrid();
      });

      Gallery.filterBar.appendChild(button);
    });
  }

  function tileMarkup(record) {
    var video = isVideo(record);
    var title = escapeHtml(record.name || '');
    var category = escapeHtml(prettifyLabel(categoryFor(record)));
    var thumbnail = escapeHtml(record.thumbnailUrl || '');
    var driveUrl = escapeHtml(record.driveUrl || '');

    return (
      '<figure class="tile reveal"' +
        ' data-title="' + title + '"' +
        ' data-caption="' + category + '"' +
        ' data-thumbnail="' + thumbnail + '"' +
        ' data-drive-url="' + driveUrl + '"' +
        ' data-is-video="' + (video ? '1' : '0') + '">' +
        '<button class="tile-open" type="button" aria-label="Open \u201c' + title + '\u201d in viewer">' +
          '<img src="' + thumbnail + '" alt="' + title + '" loading="lazy">' +
          (video ? '<span class="tile-badge">Video</span>' : '') +
          '<span class="tile-overlay">' +
            '<span class="tile-cat mono">' + category + '</span>' +
            '<span class="tile-title">' + title + '</span>' +
            '<span class="tile-icon" aria-hidden="true"></span>' +
          '</span>' +
        '</button>' +
      '</figure>'
    );
  }

  function updateGalleryStatus(matches, displayed) {
    if (Gallery.countElement) {
      if (Gallery.activeFilter === 'all') {
        Gallery.countElement.textContent =
          'Showing ' + displayed + ' / ' + Gallery.records.length + ' frames';
      } else {
        Gallery.countElement.textContent =
          'Showing ' + displayed + ' / ' + matches.length + ' frames';
      }
    }

    if (Gallery.emptyElement) {
      Gallery.emptyElement.hidden = displayed !== 0;
    }

    if (Gallery.loadMoreWrap) {
      Gallery.loadMoreWrap.style.display =
        matches.length > Gallery.shown ? '' : 'none';
    }

    if (Gallery.loadMore) {
      var remaining = Math.max(matches.length - Gallery.shown, 0);
      var remainingElement = qs('.load-remaining', Gallery.loadMore);

      if (remainingElement) {
        remainingElement.textContent = '+' + remaining;
      }
    }
  }

  function visiblePhotoTiles() {
    if (!Gallery.grid) return [];

    return qsa('.tile', Gallery.grid).filter(function (tile) {
      return tile.getAttribute('data-is-video') !== '1';
    });
  }

  function renderGrid() {
    if (!Gallery.grid) return;

    var matches = currentRecords();
    var displayedRecords = matches.slice(0, Gallery.shown);

    Gallery.grid.innerHTML = displayedRecords.map(tileMarkup).join('');

    qsa('.tile', Gallery.grid).forEach(function (tile) {
      var button = qs('.tile-open', tile);

      if (!button) return;

      button.addEventListener('click', function () {
        var video = tile.getAttribute('data-is-video') === '1';
        var driveUrl = tile.getAttribute('data-drive-url') || '';

        if (video) {
          if (driveUrl) {
            window.open(driveUrl, '_blank', 'noopener');
          }
          return;
        }

        Lightbox.items = visiblePhotoTiles();

        var index = Lightbox.items.indexOf(tile);

        if (index === -1) return;

        openLightbox(index, button);
      });
    });

    updateGalleryStatus(matches, displayedRecords.length);
    initReveal(Gallery.grid);
  }

  function showGalleryError(message) {
    if (Gallery.errorElement) {
      Gallery.errorElement.hidden = false;
      Gallery.errorElement.textContent = message;
    } else if (Gallery.grid) {
      Gallery.grid.innerHTML =
        '<p class="gallery-error" role="alert">' + escapeHtml(message) + '</p>';
    }

    if (Gallery.loadMoreWrap) {
      Gallery.loadMoreWrap.style.display = 'none';
    }

    if (Gallery.countElement) {
      Gallery.countElement.textContent = '';
    }
  }

  function initGallery() {
    Gallery.grid = qs('#masonry');
    // Target the dedicated gallery filter bar by ID, NOT by the ".filter-bar"
    // class. The hero's static trip-teaser pills used to also carry that
    // class, so document.querySelector('.filter-bar') was grabbing THEM
    // (the first match in the DOM) and wiping/replacing their hand-written
    // emoji labels with auto-generated ones — that's what caused pills like
    // "1000 islands 🏝" to render as "1000-islands". #galleryFilterBar is a
    // separate element that only this script ever touches.
    Gallery.filterBar = qs('#galleryFilterBar');
    Gallery.loadMore = qs('#loadMore');
    Gallery.loadMoreWrap = qs('#loadMoreWrap');
    Gallery.countElement = qs('#galleryCount');
    Gallery.emptyElement = qs('#emptyState');
    Gallery.errorElement = qs('#galleryError');

    if (!Gallery.grid) return;

    if (Gallery.loadMore) {
      Gallery.loadMore.addEventListener('click', function () {
        Gallery.shown += Gallery.pageSize;
        renderGrid();
      });
    }

    if (Gallery.loadMoreWrap) {
      Gallery.loadMoreWrap.style.display = 'none';
    }

    fetch('data/gallery.json')
      .then(function (response) {
        if (!response.ok) {
          throw new Error('Could not load gallery.json: HTTP ' + response.status);
        }

        return response.json();
      })
      .then(function (data) {
        var records = Array.isArray(data)
          ? data
          : (data && Array.isArray(data.items) ? data.items : null);

        if (!records) {
          throw new Error('gallery.json has an unexpected format');
        }

        Gallery.records = records;
        Gallery.filters = buildFilters(records);

        renderFilters();
        renderGrid();
        initLightbox();
      })
      .catch(function (error) {
        console.error('Gallery loading failed:', error);
        showGalleryError(
          'Sorry — the gallery could not be loaded right now. Please try again later.'
        );
      });
  }

  function fillLightboxFromTile(tile) {
    if (!tile || !Lightbox.image) return;

    var thumbnail = tile.getAttribute('data-thumbnail') || '';
    var title = tile.getAttribute('data-title') || '';
    var caption = tile.getAttribute('data-caption') || '';
    var driveUrl = tile.getAttribute('data-drive-url') || '';

    Lightbox.image.src = thumbnail;
    Lightbox.image.alt = title;

    if (Lightbox.title) {
      Lightbox.title.textContent = title;
    }

    if (Lightbox.meta) {
      Lightbox.meta.textContent = caption;
    }

    if (Lightbox.counter) {
      Lightbox.counter.textContent =
        (Lightbox.index + 1) + ' / ' + Lightbox.items.length;
    }

    if (Lightbox.openOriginal) {
      if (driveUrl) {
        Lightbox.openOriginal.href = driveUrl;
        Lightbox.openOriginal.hidden = false;
      } else {
        Lightbox.openOriginal.removeAttribute('href');
        Lightbox.openOriginal.hidden = true;
      }
    }
  }

  function openLightbox(index, trigger) {
    if (!Lightbox.element || !Lightbox.items.length) return;

    Lightbox.index = index;
    Lightbox.lastFocused = trigger || document.activeElement;

    fillLightboxFromTile(Lightbox.items[Lightbox.index]);

    Lightbox.element.hidden = false;
    document.body.style.overflow = 'hidden';

    void Lightbox.element.offsetWidth;
    Lightbox.element.classList.add('is-open');

    var closeButton = qs('.lightbox-close', Lightbox.element);

    if (closeButton) {
      closeButton.focus();
    }
  }

  function closeLightbox() {
    if (!Lightbox.element || Lightbox.element.hidden) return;

    Lightbox.element.classList.remove('is-open');

    function finishClose() {
      Lightbox.element.hidden = true;
      document.body.style.overflow = '';

      if (
        Lightbox.lastFocused &&
        typeof Lightbox.lastFocused.focus === 'function'
      ) {
        Lightbox.lastFocused.focus();
      }
    }

    if (prefersReducedMotion) {
      finishClose();
    } else {
      window.setTimeout(finishClose, 260);
    }
  }

  function stepLightbox(direction) {
    if (!Lightbox.items.length) return;

    Lightbox.index =
      (Lightbox.index + direction + Lightbox.items.length) %
      Lightbox.items.length;

    fillLightboxFromTile(Lightbox.items[Lightbox.index]);
  }

  function initLightbox() {
    if (Lightbox.initialized) return;

    Lightbox.element = qs('#lightbox');

    if (!Lightbox.element) return;

    Lightbox.image = qs('#lightboxImg', Lightbox.element);
    Lightbox.title = qs('#lightboxTitle', Lightbox.element);
    Lightbox.meta = qs('#lightboxMeta', Lightbox.element);
    Lightbox.counter = qs('#lightboxCounter', Lightbox.element);
    Lightbox.openOriginal = qs('#lightboxOpenOriginal', Lightbox.element);

    qsa('[data-close]', Lightbox.element).forEach(function (button) {
      button.addEventListener('click', closeLightbox);
    });

    var previousButton = qs('[data-prev]', Lightbox.element);
    var nextButton = qs('[data-next]', Lightbox.element);

    if (previousButton) {
      previousButton.addEventListener('click', function () {
        stepLightbox(-1);
      });
    }

    if (nextButton) {
      nextButton.addEventListener('click', function () {
        stepLightbox(1);
      });
    }

    document.addEventListener('keydown', function (event) {
      if (!Lightbox.element || Lightbox.element.hidden) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        closeLightbox();
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        stepLightbox(-1);
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        stepLightbox(1);
      }
    });

    Lightbox.initialized = true;
  }

  function initSubscribe() {
    // Guarded no-op unless a #subscribeForm with #email/#formNote exists in
    // the page. Safe to leave enabled even though the current "Memories"
    // section is just a CTA link with no form.
    var form = qs('#subscribeForm');
    if (!form) return;

    var input = qs('#email', form);
    var note = qs('#formNote', form);
    var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var value = (input && input.value ? input.value : '').trim();

      if (!emailPattern.test(value)) {
        if (note) {
          note.textContent = 'Please enter a valid email address.';
          note.className = 'form-note mono is-error';
        }
        if (input) input.focus();
        return;
      }

      if (note) {
        note.textContent = 'Thank you — you are on the list.';
        note.className = 'form-note mono is-ok';
      }
      form.reset();
    });
  }

  function applyFilterAndJump(key) {
    Gallery.activeFilter = key;
    Gallery.shown = Gallery.pageSize;

    // If gallery.json has already loaded, re-render immediately.
    // If it hasn't, initGallery()'s .then() will render with this
    // activeFilter already set once the data arrives.
    if (Gallery.records.length) {
      renderFilters();
      renderGrid();
    }

    var target = qs('#gallery');
    if (target) {
      target.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'start'
      });
    }
  }

  function initFilterJumpLinks() {
    qsa('[data-jump-filter]').forEach(function (link) {
      link.addEventListener('click', function (event) {
        event.preventDefault();
        applyFilterAndJump(link.getAttribute('data-jump-filter'));
      });
    });
  }

  function boot() {
    initStickyHeader();
    initMobileNav();
    initSmoothScroll();
    initReveal();
    initCountUp();
    initGallery();
    initFilterJumpLinks();
    initSubscribe();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
