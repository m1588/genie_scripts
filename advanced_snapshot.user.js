
// ==UserScript==
// @name         GenieATM Snapshot Library (localStorage only)
// @namespace    https://github.com/m1588/genie_sctips
// @version      2025-08-21
// @description  Adds a native-styled Snapshot Library to GenieATM Snapshot page: Save/Load/Update/Delete/Export/Import presets in localStorage.
// @author       Siarhei Matashuk
// @license      MIT
// @homepageURL  https://github.com/m1588/genie_sctips
// @supportURL   https://github.com/m1588/genie_sctips/issues
// @updateURL    https://raw.githubusercontent.com/m1588/genie_scripts/main/genieatm-snapshot-library.user.js
// @downloadURL  https://raw.githubusercontent.com/m1588/genie_scripts/main/genieatm-snapshot-library.user.js
// @match        *://*/atm_snapshot*
// @match        *://*/atm_snapshot.php*
// @run-at       document-idle
// @noframes
// @grant        none
// ==/UserScript==
(function () {
  'use strict';

  /* ---------- config ---------- */
  const STORAGE_KEY = 'genieatm:snapshots';

  /* ---------- dom utils ---------- */
  const $1 = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const waitFor = async (pred, t = 9000, step = 100) => { const t0 = Date.now(); while (!pred()) { if (Date.now()-t0>t) return false; await sleep(step);} return true; };
  const escapeHtml = s => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  /* ---------- page element ids ---------- */
  const ids = {
    data_source: '#data_source', time_duration: '#time_duration', timeout: '#timeout',
    scope_type: '#scope_type', instance: '#instance', direction: '#crt_direction',
    topn: '#topn_no', primaryCounter: '#sel_primaryCounter',
    selAggs: '#sel_aggs', availAggs: '#available_members',
    selCounters: '#sel_counters', availCounters: '#available_counters',
    criteriaBox: '#div_criteria_chboxs',
    formTop: '#div_form_content',
  };

  /* ---------- serialize current form ---------- */
  function serializeConfig() {
    const cfg = {
      v: 1,
      ds: $1(ids.data_source)?.value,
      td: $1(ids.time_duration)?.value,
      to: $1(ids.timeout)?.value,
      scope: $1(ids.scope_type)?.value,
      inst: $1(ids.instance)?.value,
      dir: $1(ids.direction)?.value,
      topn: $1(ids.topn)?.value,
      pc: $1(ids.primaryCounter)?.value,
      c: Array.from($1(ids.selCounters)?.options || []).map(o => o.value),
      aggs: Array.from($1(ids.selAggs)?.options || []).map(o => o.value),
      crt: $$(ids.criteriaBox + ' input[type=checkbox][name="all_crt"]:checked').map(x => x.value),
      det: serializeDetails()
    };
    Object.keys(cfg).forEach(k => (cfg[k]==='' || cfg[k]==null || (Array.isArray(cfg[k]) && !cfg[k].length)) && delete cfg[k]);
    return cfg;
  }
  function serializeDetails() {
    const out = {};
    const nodes = $$('div[id^="div_crt_"] input, div[id^="div_crt_"] select, div[id^="div_crt_"] textarea');
    for (const n of nodes) {
      if (n.disabled) continue;
      const key = n.id ? `#${n.id}` : (n.name ? `n:${n.name}` : '');
      if (!key) continue;
      let v;
      if (n.type === 'checkbox' || n.type === 'radio') v = n.checked;
      else if (n.tagName.toLowerCase() === 'select' && n.multiple) v = Array.from(n.options).filter(o=>o.selected).map(o=>o.value);
      else v = n.value;
      out[key] = v;
    }
    return out;
  }

  /* ---------- restore into form ---------- */
  async function restoreConfig(cfg) {
    if (!cfg) return;

    setVal(ids.data_source, cfg.ds);
    setVal(ids.time_duration, cfg.td);
    setVal(ids.timeout, cfg.to);

    if (cfg.scope != null) {
      setVal(ids.scope_type, cfg.scope, true);
      fireChange(ids.scope_type);
      if (cfg.inst != null) {
        await waitFor(() => $1(ids.instance));
        enable(ids.instance);
        await waitFor(()=> {
          const i = $1(ids.instance);
          return i && Array.from(i.options).some(o=>o.value==cfg.inst);
        }, 6000);
        setVal(ids.instance, cfg.inst);
      }
      if (cfg.dir != null) { enable(ids.direction); setVal(ids.direction, cfg.dir); }
    }

    setVal(ids.topn, cfg.topn);
    setVal(ids.primaryCounter, cfg.pc);

    if (Array.isArray(cfg.crt)) {
      for (const val of cfg.crt) {
        const cb = $$(`${ids.criteriaBox} input[type=checkbox][name="all_crt"][value="${CSS.escape(val)}"]`)[0];
        if (cb && !cb.checked) { cb.click(); await sleep(20); }
      }
      await sleep(120);
    }

    if (cfg.det) {
      for (const [k, v] of Object.entries(cfg.det)) {
        const node = k.startsWith('#') ? $1(k) : (k.startsWith('n:') ? document.getElementsByName(k.slice(2))[0] : null);
        if (!node) continue;
        if (node.type === 'checkbox' || node.type === 'radio') node.checked = !!v;
        else if (node.tagName.toLowerCase()==='select' && node.multiple && Array.isArray(v)) {
          Array.from(node.options).forEach(o => o.selected = v.includes(o.value));
        } else node.value = v;
      }
    }

    await waitFor(()=> $1(ids.availAggs) && $1(ids.selAggs) && $1(ids.availCounters) && $1(ids.selCounters));
    if (Array.isArray(cfg.aggs)) {
      clearSel(ids.selAggs, ids.availAggs);
      moveByValue(cfg.aggs, ids.availAggs, ids.selAggs, true);
    }
    if (Array.isArray(cfg.c)) {
      clearSel(ids.selCounters, ids.availCounters);
      moveByValue(cfg.c, ids.availCounters, ids.selCounters, false);
    }
  }

  function setVal(sel, val, forceEnable=false) { const e = $1(sel); if (!e || val==null) return; if (forceEnable) enable(sel); e.value = String(val); }
  function enable(sel) { const e = $1(sel); if (e) e.disabled = false; }
  function fireChange(sel) { const e = $1(sel); if (e) e.dispatchEvent(new Event('change', {bubbles:true})); }

  function clearSel(selSelected, selAvailable) {
    const dst = $1(selSelected), src = $1(selAvailable);
    if (!dst || !src) return;
    if (typeof window.GroupMemberRemoveAll === 'function') {
      try { window.GroupMemberRemoveAll(dst, src); return; } catch(e){}
    }
    while (dst.options.length) dst.remove(0);
  }
  function moveByValue(values, selAvailable, selSelected, isAgg) {
    const src = $1(selAvailable), dst = $1(selSelected);
    if (!src || !dst) return;
    if (typeof window.GroupMemberAdd === 'function') {
      try {
        Array.from(src.options).forEach(o => { o.selected = values.includes(o.value); });
        window.GroupMemberAdd(4, dst, src, isAgg ? 1 : 0);
        return;
      } catch(e){}
    }
    for (const v of values) {
      const opt = Array.from(src.options).find(o=>o.value===v);
      if (!opt) continue;
      const clone = opt.cloneNode(true);
      clone.selected = true;
      dst.appendChild(clone);
    }
  }

  /* ---------- localStorage library ---------- */
  function loadLib() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch { return {}; }
  }
  function saveLib(lib) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lib));
  }
  function updateLibSelect() {
    const sel = $1('#snapLibSelect');
    if (!sel) return;
    const lib = loadLib();
    const names = Object.keys(lib).sort((a,b)=>a.localeCompare(b));
    sel.innerHTML = names.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
  }
  function toast(msg) {
    const n = document.createElement('div');
    n.textContent = msg;
    n.style.cssText = `position:fixed;z-index:99999;bottom:18px;right:18px;background:#222;color:#fff;
      padding:8px 12px;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,.2);font-size:12px;`;
    document.body.appendChild(n);
    setTimeout(()=>n.remove(), 1400);
  }

  /* ---------- top bar UI (native styles) ---------- */
  function addTopBar() {
    if ($1('#div_snapshot_library_top')) return;

    const anchor = $1(ids.formTop) || $1('#td_main_content') || document.body;
    const container = document.createElement('div');
    container.id = 'div_snapshot_library_top';
    container.style.position = 'static';
    container.innerHTML = `
      <table width="99%" border="0" align="center" cellpadding="1" cellspacing="1" style="margin-bottom:6px;">
        <tr height="24">
          <td class="atm" nowrap>
            <b>Snapshot Library:</b>
            <select id="snapLibSelect" style="min-width:240px; margin-right:6px;"></select>
            <input type="button" class="button" id="snapSaveAsBtn" value="Save As…">
            <input type="button" class="button" id="snapLoadBtn" value="Load">
            <input type="button" class="button" id="snapUpdateBtn" value="Update">
            <input type="button" class="button" id="snapDeleteBtn" value="Delete">
            <input type="button" class="button" id="snapExportBtn" value="Export">
            <input type="button" class="button" id="snapImportBtn" value="Import">
          </td>
        </tr>
      </table>
    `;
    if (anchor.firstChild) anchor.insertBefore(container, anchor.firstChild);
    else anchor.appendChild(container);

    updateLibSelect();

    $1('#snapSaveAsBtn')?.addEventListener('click', () => {
      const name = (prompt('Save current snapshot as (name):') || '').trim();
      if (!name) return;
      const lib = loadLib();
      if (lib[name] && !confirm(`"${name}" exists. Overwrite?`)) return;
      lib[name] = { ts: Date.now(), cfg: serializeConfig() };
      saveLib(lib);
      updateLibSelect();
      $1('#snapLibSelect').value = name;
      toast(`Saved "${name}"`);
    });

    $1('#snapLoadBtn')?.addEventListener('click', async () => {
      const sel = $1('#snapLibSelect'); if (!sel || !sel.value) return toast('Select a snapshot');
      const lib = loadLib(); const item = lib[sel.value]; if (!item) return;
      await restoreConfig(item.cfg);
      toast(`Loaded "${sel.value}"`);
    });

    $1('#snapUpdateBtn')?.addEventListener('click', () => {
      const sel = $1('#snapLibSelect'); if (!sel || !sel.value) return toast('Select a snapshot');
      const lib = loadLib(); if (!lib[sel.value]) return;
      lib[sel.value] = { ts: Date.now(), cfg: serializeConfig() };
      saveLib(lib);
      toast(`Updated "${sel.value}"`);
    });

    $1('#snapDeleteBtn')?.addEventListener('click', () => {
      const sel = $1('#snapLibSelect'); if (!sel || !sel.value) return toast('Select a snapshot');
      if (!confirm(`Delete "${sel.value}"?`)) return;
      const lib = loadLib(); delete lib[sel.value]; saveLib(lib);
      updateLibSelect();
      toast('Deleted');
    });

    $1('#snapExportBtn')?.addEventListener('click', () => {
      const sel = $1('#snapLibSelect'); if (!sel || !sel.value) return toast('Select a snapshot');
      const lib = loadLib(); const item = lib[sel.value]; if (!item) return;
      const json = JSON.stringify({ name: sel.value, ...item });
      prompt('Exported JSON (copy):', json);
    });

    $1('#snapImportBtn')?.addEventListener('click', () => {
      const txt = prompt('Paste snapshot JSON to import:');
      if (!txt) return;
      try {
        const obj = JSON.parse(txt);
        const lib = loadLib();
        if (obj && obj.name && obj.cfg) {
          const name = obj.name;
          if (lib[name] && !confirm(`"${name}" exists. Overwrite?`)) return;
          lib[name] = { ts: obj.ts || Date.now(), cfg: obj.cfg };
          saveLib(lib);
          updateLibSelect();
          $1('#snapLibSelect').value = name;
          toast(`Imported "${name}"`);
        } else {
          toast('Invalid JSON format');
        }
      } catch (e) { console.error(e); toast('Import failed'); }
    });
  }

  /* ---------- main ---------- */
  (async function main() {
    await waitFor(() => $1('#data_source') && $1('#sel_aggs') && $1('#sel_counters'), 10000);
    addTopBar();
