// slide-print.js — botão "Imprimir PDF" + CSS de impressão para os decks de slides.
// Compartilhado por todos os decks (slide-lesson-*.html). Carregar DEPOIS do <script> inline
// do deck (logo antes de </body>), pois depende dos globais de animação (animMap, T, _run).
//
// Problema que resolve: na tela só o slide ativo aparece (.slide.active) e muito conteúdo é
// injetado por animação só quando o slide é visitado. Para um PDF com TODOS os slides, antes
// de imprimir precisamos (a) mostrar todos os slides e (b) popular o conteúdo animado.
(function () {
  'use strict';

  // ── CSS de impressão (só vale em @media print) ────────────────────────────
  var PRINT_CSS = [
    '@media print {',
    '  @page { size: A4 landscape; margin: 8mm; }',
    '  html, body { background:#fff !important; height:auto !important; overflow:visible !important; }',
    '  .slide-footer, .fullscreen-btn, .print-btn, .nav-wrapper, #prev-btn, #next-btn { display:none !important; }',
    '  .slide-container { position:static !important; height:auto !important; width:auto !important; overflow:visible !important; }',
    '  .slide { display:flex !important; position:relative !important; left:auto !important; top:auto !important;',
    '           width:100% !important; height:auto !important; min-height:175mm; box-shadow:none !important;',
    '           page-break-after:always; break-after:page; animation:none !important; }',
    '  .slide:last-child { page-break-after:auto; break-after:auto; }',
    // garante que elementos de "reveal" apareçam mesmo se a animação não os tocou
    '  .tl,.cv-tag,.mc,.ri,.qitem,.pstate,.ui-state,.hdr-row,.chk,.daily-tag,.ej-card,.reveal,.fade {',
    '     opacity:1 !important; transform:none !important; }',
    // preserva cores/gradientes de fundo na impressão
    '  * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }',
    '}'
  ].join('\n');

  function injectStyle() {
    if (document.querySelector('style[data-slide-print]')) return;
    var st = document.createElement('style');
    st.setAttribute('data-slide-print', '');
    st.textContent = PRINT_CSS;
    document.head.appendChild(st);
  }

  // ── Popular animações sem esperar a digitação ─────────────────────────────
  // typeLine (human-type.js) e showLine usam o T() global para agendar. Trocamos
  // T por execução imediata, neutralizamos clearT e forçamos _run=true; aí basta
  // chamar cada função do animMap para o conteúdo final aparecer de uma vez.
  function fillAllAnimations() {
    if (typeof animMap === 'undefined' || !animMap.length) return;
    var origT = (typeof T !== 'undefined') ? T : null;
    var origClear = (typeof clearT !== 'undefined') ? clearT : null;
    try { window._run = true; } catch (e) {}
    try { window.clearT = function () {}; } catch (e) {}
    try { window.T = function (fn) { try { fn(); } catch (e) {} }; } catch (e) {}
    for (var i = 0; i < animMap.length; i++) {
      var fn = animMap[i];
      if (typeof fn === 'function') { try { fn(); } catch (e) {} }
    }
    if (origT) { try { window.T = origT; } catch (e) {} }
    if (origClear) { try { window.clearT = origClear; } catch (e) {} }
  }

  function revealAll() {
    document.querySelectorAll('.slide').forEach(function (s) { s.classList.add('active'); });
    var sel = '.tl,.cv-tag,.mc,.ri,.qitem,.pstate,.ui-state,.hdr-row,.chk,.daily-tag,.ej-card,.reveal,.fade';
    document.querySelectorAll(sel).forEach(function (el) { el.classList.add('vis'); });
  }

  function printDeck() {
    revealAll();
    fillAllAnimations();
    revealAll(); // segunda passada: pega elementos criados pelas animações
    setTimeout(function () { window.print(); }, 200);
  }

  // restaura o estado interativo (slide único) depois de imprimir/cancelar
  window.addEventListener('afterprint', function () { location.reload(); });

  // ── Botão no footer ───────────────────────────────────────────────────────
  function injectButton() {
    var footer = document.querySelector('.slide-footer');
    if (!footer || footer.querySelector('.print-btn')) return;
    var btn = document.createElement('button');
    btn.className = 'print-btn';
    btn.type = 'button';
    btn.title = 'Imprimir / Salvar como PDF';
    btn.textContent = '🖨 Imprimir PDF';
    btn.style.cssText = 'background:#f1f4f8;border:none;font-size:.86rem;cursor:pointer;' +
      'padding:8px 12px;border-radius:8px;font-family:inherit;font-weight:700;white-space:nowrap;';
    btn.addEventListener('click', printDeck);
    var fs = footer.querySelector('.fullscreen-btn');
    if (fs) footer.insertBefore(btn, fs); else footer.appendChild(btn);
  }

  // atalho de teclado: P imprime (sem colidir com setas/F já usados)
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'p' || e.key === 'P') && !e.metaKey && !e.ctrlKey) { e.preventDefault(); printDeck(); }
  });

  function init() { injectStyle(); injectButton(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
