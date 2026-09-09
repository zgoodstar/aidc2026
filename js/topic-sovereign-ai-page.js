/**
 * Topic 观点页：按语言嵌入主权 AI 幻灯片（中文 / 英文两套 deck）。
 * 切主题不重载 iframe；切语言只替换 deck 文件，并尽量保留当前页码 hash。
 * 全屏播放：先铺满视口（演讲模式），再尝试 Fullscreen API 隐藏浏览器壳。
 */
(function (global) {
  'use strict';

  const DECK_ZH = 'topic/sovereign-ai/sovereign-ai-zh.html';
  const DECK_EN = 'topic/sovereign-ai/sovereign-ai.html';
  const PRESENT_CLASS = 'is-presenting';
  const NAV_KEYS = new Set(['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'ArrowLeft', 'ArrowUp', 'PageUp', 'Home', 'End']);

  let bound = false;
  let presenting = false;
  let deckKeyTarget = null;

  function deckPath(locale) {
    return locale === 'en' ? DECK_EN : DECK_ZH;
  }

  function currentHash(iframe) {
    try {
      return iframe.contentWindow?.location?.hash || '';
    } catch {
      return '';
    }
  }

  function t(key, fallback) {
    const value = global.AidcI18n?.t?.(key);
    return value && value !== key ? value : fallback;
  }

  function stageEl() {
    return document.getElementById('sovereign-deck-stage');
  }

  function iframeEl() {
    return document.getElementById('sovereign-deck');
  }

  function presentBtn() {
    return document.getElementById('sovereign-present');
  }

  function exitBtn() {
    return document.getElementById('sovereign-exit-present');
  }

  function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function requestFs(el) {
    const fn = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!fn) return Promise.reject(new Error('fullscreen-unavailable'));
    return Promise.resolve(fn.call(el));
  }

  function exitFs() {
    if (!fullscreenElement()) return Promise.resolve();
    const fn = document.exitFullscreen || document.webkitExitFullscreen;
    if (!fn) return Promise.resolve();
    return Promise.resolve(fn.call(document)).catch(() => undefined);
  }

  function notifyDeckResize(iframe) {
    try {
      iframe?.contentWindow?.dispatchEvent(new Event('resize'));
    } catch {
      /* iframe 尚未就绪 */
    }
  }

  function focusDeck(iframe) {
    try {
      iframe?.focus();
      iframe?.contentWindow?.focus();
    } catch {
      /* 跨文档焦点失败时仍可走父页按键转发 */
    }
  }

  function setPresentingUi(on) {
    const stage = stageEl();
    const play = presentBtn();
    const exit = exitBtn();
    document.body.classList.toggle(PRESENT_CLASS, on);
    document.body.style.overflow = on ? 'hidden' : '';
    if (play) play.hidden = on;
    if (exit) exit.hidden = !on;
    if (stage) stage.setAttribute('data-presenting', on ? '1' : '0');
    notifyDeckResize(iframeEl());
    global.requestAnimationFrame(() => notifyDeckResize(iframeEl()));
  }

  function enterPresent() {
    const stage = stageEl();
    const iframe = iframeEl();
    if (!stage || !iframe) return;
    presenting = true;
    setPresentingUi(true);
    focusDeck(iframe);
    requestFs(stage).then(() => {
      notifyDeckResize(iframe);
      focusDeck(iframe);
    }).catch(() => {
      focusDeck(iframe);
    });
  }

  function exitPresent() {
    presenting = false;
    setPresentingUi(false);
    exitFs().finally(() => {
      presentBtn()?.focus();
    });
  }

  function togglePresent() {
    if (presenting || fullscreenElement()) exitPresent();
    else enterPresent();
  }

  function forwardNavKey(event) {
    const iframe = iframeEl();
    const doc = iframe?.contentDocument;
    const target = doc?.body;
    if (!target) return;
    target.dispatchEvent(new KeyboardEvent('keydown', {
      key: event.key,
      code: event.code,
      keyCode: event.keyCode,
      which: event.which,
      bubbles: true,
      cancelable: true,
    }));
  }

  function onParentKeydown(event) {
    if (event.key === 'Escape' && presenting) {
      event.preventDefault();
      exitPresent();
      return;
    }
    if ((event.key === 'f' || event.key === 'F') && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const tag = (event.target && event.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target?.isContentEditable) return;
      event.preventDefault();
      togglePresent();
      return;
    }
    if (!presenting || !NAV_KEYS.has(event.key)) return;
    event.preventDefault();
    forwardNavKey(event);
  }

  function onDeckKeydown(event) {
    if ((event.key === 'f' || event.key === 'F') && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      togglePresent();
    }
  }

  function bindDeckKeys(iframe) {
    try {
      const doc = iframe.contentDocument;
      if (!doc || deckKeyTarget === doc) return;
      if (deckKeyTarget) {
        deckKeyTarget.removeEventListener('keydown', onDeckKeydown);
      }
      deckKeyTarget = doc;
      doc.addEventListener('keydown', onDeckKeydown);
    } catch {
      deckKeyTarget = null;
    }
  }

  function onFullscreenChange() {
    if (fullscreenElement()) {
      presenting = true;
      setPresentingUi(true);
      focusDeck(iframeEl());
      return;
    }
    if (presenting) {
      presenting = false;
      setPresentingUi(false);
    }
  }

  function syncSovereignDeck() {
    const iframe = iframeEl();
    if (!iframe) return;
    const locale = global.AidcI18n?.getLocale?.() || 'zh';
    const next = deckPath(locale);
    const current = iframe.getAttribute('data-deck-src') || '';
    const title = t('page.iframeTitle', iframe.getAttribute('title') || '');
    if (title) iframe.setAttribute('title', title);
    if (current === next) {
      bindDeckKeys(iframe);
      if (presenting) notifyDeckResize(iframe);
      return;
    }
    const hash = current ? currentHash(iframe) : '';
    iframe.setAttribute('data-deck-src', next);
    iframe.src = next + hash;
  }

  function bindOnce() {
    if (bound) return;
    bound = true;
    const iframe = iframeEl();
    const exit = exitBtn();
    document.querySelectorAll('[data-present-enter]').forEach((button) => {
      button.addEventListener('click', enterPresent);
    });
    exit?.addEventListener('click', exitPresent);
    iframe?.addEventListener('load', () => {
      bindDeckKeys(iframe);
      if (presenting) {
        notifyDeckResize(iframe);
        focusDeck(iframe);
      }
    });
    document.addEventListener('keydown', onParentKeydown);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
  }

  function initTopicSovereignAiPage() {
    bindOnce();
    syncSovereignDeck();
  }

  global.initTopicSovereignAiPage = initTopicSovereignAiPage;
})(typeof window !== 'undefined' ? window : globalThis);
