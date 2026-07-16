// app.js
(function () {
  var FIELD_NAMES_BY_VERSION = window.FIELD_NAMES_BY_VERSION || {};
  var DATATYPE_BY_FIELD = window.DATATYPE_BY_FIELD || {};
  var COMPONENT_NAMES_BY_DATATYPE = window.COMPONENT_NAMES_BY_DATATYPE || {};
  var FIELD_DESC_BY_SEGMENT = window.FIELD_DESC_BY_SEGMENT || {};
  var SAMPLES = window.HL7_SAMPLES || {};
  var SAMPLE_TITLES = window.HL7_SAMPLE_TITLES || {};
  var STORED_MESSAGE_KEY = "hl7_message";
  var MOBILE_VIEW_KEY = "hl7_mobile_view";
  var ORIGINAL_PID_MESSAGE_KEY = "hl7_original_pid_message";
  var ANON_CONFIG_KEY = "hl7_anonymize_config";
  var CUSTOM_SAMPLES_KEY = "hl7_custom_samples";
  var SELECTED_SAMPLE_KEY = "hl7_selected_sample";
  var SELECTED_VERSION_KEY = "hl7_selected_version";
  var APP_STATE_EXPORT_VERSION = 1;

  var currentVersion = "2.4";
  var currentModel = { delims: null, segments: [] };
  var unsupportedFilterOn = false;

  // ================= CodeMirror setup (local bundled ESM) =================
  let cmView = null;
  let plainEditor = null;
  let CM = null; // bucket for imported CM modules
  let parseTimer = null;

  // Compartment for toggling line wrapping
  let WrapCompartment = null;
  let wrapOn = true; // start with wrapping on

  function scheduleParse() {
    clearTimeout(parseTimer);
    parseTimer = setTimeout(parseNow, 180);
  }

  function loadStoredMessage() {
    try {
      return localStorage.getItem(STORED_MESSAGE_KEY) || "";
    } catch (_) {
      return "";
    }
  }

  function saveStoredMessage(text) {
    try {
      localStorage.setItem(STORED_MESSAGE_KEY, text || "");
    } catch (_) {}
  }

  function loadMobileView() {
    try {
      return localStorage.getItem(MOBILE_VIEW_KEY) || "input";
    } catch (_) {
      return "input";
    }
  }

  function saveMobileView(view) {
    try {
      localStorage.setItem(MOBILE_VIEW_KEY, view || "input");
    } catch (_) {}
  }

  function loadSelectedSampleKey() {
    try {
      return localStorage.getItem(SELECTED_SAMPLE_KEY) || "";
    } catch (_) {
      return "";
    }
  }

  function saveSelectedSampleKey(key) {
    try {
      if (key) localStorage.setItem(SELECTED_SAMPLE_KEY, key);
      else localStorage.removeItem(SELECTED_SAMPLE_KEY);
    } catch (_) {}
  }

  function loadSelectedVersion() {
    try {
      return localStorage.getItem(SELECTED_VERSION_KEY) || "";
    } catch (_) {
      return "";
    }
  }

  function saveSelectedVersion(version) {
    try {
      if (version) localStorage.setItem(SELECTED_VERSION_KEY, version);
      else localStorage.removeItem(SELECTED_VERSION_KEY);
    } catch (_) {}
  }

  function loadOriginalPidMessage() {
    try {
      return localStorage.getItem(ORIGINAL_PID_MESSAGE_KEY) || "";
    } catch (_) {
      return "";
    }
  }

  function saveOriginalPidMessage(text) {
    try {
      if (text) localStorage.setItem(ORIGINAL_PID_MESSAGE_KEY, text);
    } catch (_) {}
    syncRestorePidButton();
  }

  function clearOriginalPidMessage() {
    try {
      localStorage.removeItem(ORIGINAL_PID_MESSAGE_KEY);
    } catch (_) {}
    syncRestorePidButton();
  }

  function syncRestorePidButton() {
    var btn = document.getElementById("btnRestorePid");
    if (!btn) return;
    var hasOriginal = !!loadOriginalPidMessage();
    btn.disabled = !hasOriginal;
    btn.classList.toggle("is-disabled", !hasOriginal);
  }

  function normaliseCustomSamples(raw) {
    var out = {};
    if (!raw || typeof raw !== "object") return out;
    Object.keys(raw).forEach(function (key) {
      var item = raw[key];
      if (!item || typeof item !== "object") return;
      var title = String(item.title || "").trim();
      var message = String(item.message || "");
      if (!title || !message.trim()) return;
      out[key] = {
        title: title,
        message: message,
        version: String(item.version || "2.4"),
        createdAt: item.createdAt || new Date().toISOString()
      };
    });
    return out;
  }

  function loadCustomSamples() {
    try {
      return normaliseCustomSamples(JSON.parse(localStorage.getItem(CUSTOM_SAMPLES_KEY) || "{}"));
    } catch (_) {
      return {};
    }
  }

  function saveCustomSamples(samples) {
    try {
      localStorage.setItem(CUSTOM_SAMPLES_KEY, JSON.stringify(normaliseCustomSamples(samples)));
    } catch (_) {}
  }

  function customSampleKey() {
    return "custom_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
  }

  function getSampleMessage(key) {
    if (SAMPLES && SAMPLES[key]) return SAMPLES[key];
    var custom = loadCustomSamples();
    return custom[key] ? custom[key].message : "";
  }

  function getSampleVersion(key, message) {
    if (/_v23$/.test(key)) return "2.3";
    if (/_v24$/.test(key)) return "2.4";
    var custom = loadCustomSamples();
    if (custom[key] && custom[key].version) return custom[key].version;
    var msh = String(message || "").split(/\r\n?|\n/).find(function (line) {
      return line.slice(0, 3) === "MSH";
    });
    return msh ? (msh.split("|")[11] || "2.4") : "2.4";
  }

  var editorHintEl = null;

  function ensureEditorHint() {
    if (editorHintEl) return editorHintEl;
    editorHintEl = document.createElement("div");
    editorHintEl.className = "editor-field-hint";
    editorHintEl.hidden = true;
    document.body.appendChild(editorHintEl);
    return editorHintEl;
  }

  function hideEditorHint() {
    if (editorHintEl) editorHintEl.hidden = true;
    var headerBox = document.getElementById("headerHintBox");
    if (headerBox) headerBox.hidden = true;
    var footerBox = document.getElementById("footerHintBox");
    if (footerBox) footerBox.hidden = true;
    if (typeof cmView !== 'undefined' && cmView) updateTargetHighlight(cmView, null, null);
  }

  function createPlainEditor() {
    if (plainEditor) return plainEditor;
    var host = document.getElementById("cmEditor");
    if (!host) return null;

    host.innerHTML = "";
    plainEditor = document.createElement("textarea");
    plainEditor.className = "plain-editor";
    plainEditor.spellcheck = false;
    plainEditor.autocapitalize = "off";
    plainEditor.autocomplete = "off";
    plainEditor.autocorrect = "off";
    plainEditor.wrap = wrapOn ? "soft" : "off";

    plainEditor.addEventListener("input", function () {
      saveStoredMessage(plainEditor.value);
      scheduleParse();
    });
    plainEditor.addEventListener("keydown", function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        parseNow();
      }
    });

    function syncPlainSelection() {
      var head = plainEditor.selectionStart || 0;
      var lineNo = plainEditor.value.slice(0, head).split(/\r\n?|\n/).length;
      var segIdx = segIndexForText(plainEditor.value, lineNo);
      highlightSegment(segIdx);
      var info = fieldIndexAtPlainPos(plainEditor.value, lineNo, head);
      highlightBreakdownField(segIdx, info ? info.field : null);
    }

    plainEditor.addEventListener("click", syncPlainSelection);
    plainEditor.addEventListener("keyup", syncPlainSelection);
    plainEditor.addEventListener("select", syncPlainSelection);
    plainEditor.addEventListener("mousemove", hideEditorHint);
    plainEditor.addEventListener("mouseleave", hideEditorHint);
    plainEditor.addEventListener("mousedown", hideEditorHint);

    host.appendChild(plainEditor);
    return plainEditor;
  }

  function updateTargetHighlight(view, from, to) {
    if (!CM || !CM.hoverHighlightEffect) return;
    view.dispatch({
      effects: CM.hoverHighlightEffect.of({ from: from, to: to })
    });
  }

  function clearBreakdownFieldHighlight() {
    var tree = document.getElementById("tree");
    if (!tree) return;
    var active = tree.querySelectorAll("tr.field-row.editor-active-field");
    for (var i = 0; i < active.length; i++) {
      active[i].classList.remove("editor-active-field");
    }
  }

  function highlightBreakdownField(segIdx, fieldIndex) {
    clearBreakdownFieldHighlight();
    if (segIdx == null || fieldIndex == null || segIdx < 0) return;
    var tree = document.getElementById("tree");
    if (!tree) return;
    var row = tree.querySelector(
      'tr.field-row[data-seg-index="' + segIdx + '"][data-field-index="' + fieldIndex + '"]'
    );
    if (!row) return;
    row.classList.add("editor-active-field");
    if (row.offsetParent !== null) {
      row.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }

  function fieldAtEditorPos(state, pos) {
    var line = state.doc.lineAt(pos);
    var text = line.text;
    var offset = pos - line.from;
    var seg = text.slice(0, 3);
    if (!/^[A-Z0-9]{3}$/.test(seg)) return null;

    var fs = seg === "MSH" ? text.charAt(3) || "|" : "|";
    var compSep = "^";
    var repSep = "~";
    var subSep = "&";
    if (seg === "MSH") {
      var enc = text.slice(4).split(fs)[0] || "";
      compSep = enc.charAt(0) || compSep;
      repSep = enc.charAt(1) || repSep;
      subSep = enc.charAt(3) || subSep;
    }

    var index = null;
    var fieldStart = null;
    var fieldEnd = null;
    var i;

    if (seg === "MSH") {
      if (offset === 3) {
        index = 1;
        fieldStart = 3;
        fieldEnd = 4;
      }
      else if (offset >= 4) {
        index = 2;
        fieldStart = 4;
        for (i = 4; i < text.length; i++) {
          if (text.charAt(i) === fs) {
            if (i >= offset) {
              fieldEnd = i;
              break;
            }
            index++;
            fieldStart = i + 1;
          }
        }
        if (fieldEnd == null) fieldEnd = text.length;
      }
    } else if (offset >= 3) {
      index = 0;
      for (i = 3; i < text.length; i++) {
        if (text.charAt(i) === fs) {
          if (i >= offset && index > 0) {
            fieldEnd = i;
            break;
          }
          index++;
          fieldStart = i + 1;
        }
      }
      if (index > 0 && fieldEnd == null) fieldEnd = text.length;
    }

    if (!index) return null;
    var nm = fieldName(seg, index);
    var fieldLabel = nm && nm.trim() ? nm.trim() : "Not supported in current schema";

    var label = seg + "-" + index + "  " + fieldLabel;
    if (fieldStart == null || fieldEnd == null || fieldEnd <= fieldStart) {
      return { label: label, seg: seg, field: index, from: null, to: null };
    }

    var raw = text.slice(fieldStart, fieldEnd);
    var rel = Math.max(0, Math.min(offset - fieldStart, raw.length - 1));
    var repeatIndex = 1;
    var compIndex = 1;
    var subIndex = 1;
    for (i = 0; i < rel; i++) {
      var ch = raw.charAt(i);
      if (ch === repSep) {
        repeatIndex++;
        compIndex = 1;
        subIndex = 1;
      } else if (ch === compSep) {
        compIndex++;
        subIndex = 1;
      } else if (ch === subSep) {
        subIndex++;
      }
    }

    var compCount = raw.split(repSep)[repeatIndex - 1]
      ? raw.split(repSep)[repeatIndex - 1].split(compSep).length
      : 1;
    var compNm = componentName(seg, index, compIndex, compCount);
    var path = seg + "-" + index;
    if (raw.indexOf(repSep) >= 0) path += "(" + repeatIndex + ")";
    if (raw.indexOf(compSep) >= 0 || raw.indexOf(subSep) >= 0) path += "." + compIndex;
    if (raw.indexOf(subSep) >= 0) path += "." + subIndex;

    if (compNm && (raw.indexOf(compSep) >= 0 || raw.indexOf(subSep) >= 0)) {
      label += " / " + path + "  " + compNm;
    } else if (path !== seg + "-" + index) {
      label += " / " + path;
    }

    var chunkStart = 0;
    var chunkEnd = raw.length;
    var seps = [repSep, compSep, subSep];
    for (var j = rel - 1; j >= 0; j--) {
      if (seps.indexOf(raw.charAt(j)) >= 0) {
        chunkStart = j + 1;
        break;
      }
    }
    for (var k = rel; k < raw.length; k++) {
      if (seps.indexOf(raw.charAt(k)) >= 0) {
        chunkEnd = k;
        break;
      }
    }

    return {
      label: label,
      seg: seg,
      field: index,
      from: line.from + fieldStart + chunkStart,
      to: line.from + fieldStart + chunkEnd
    };
  }

  function fieldIndexAtPlainPos(text, lineNo, pos) {
    var lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
    var lineText = lines[lineNo - 1] || "";
    var offset = pos;
    for (var i = 0; i < lineNo - 1; i++) offset -= lines[i].length + 1;
    var seg = lineText.slice(0, 3);
    if (!/^[A-Z0-9]{3}$/.test(seg)) return null;
    var fs = seg === "MSH" ? lineText.charAt(3) || "|" : "|";
    var index = null;
    if (seg === "MSH") {
      if (offset === 3) index = 1;
      else if (offset >= 4) {
        index = 2;
        for (var m = 4; m < lineText.length && m < offset; m++) {
          if (lineText.charAt(m) === fs) index++;
        }
      }
    } else if (offset >= 3) {
      index = 0;
      for (var n = 3; n < lineText.length && n <= offset; n++) {
        if (lineText.charAt(n) === fs) index++;
      }
    }
    return index ? { seg: seg, field: index } : null;
  }

  function showEditorHint(view, event) {
    var pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos == null) {
      hideEditorHint();
      return;
    }
    var line = view.state.doc.lineAt(pos);
    var posRect = view.coordsAtPos(pos);
    var lineEndRect = view.coordsAtPos(line.to);
    if (
      !line.text ||
      !posRect ||
      !lineEndRect ||
      event.clientY < posRect.top - 4 ||
      event.clientY > posRect.bottom + 4 ||
      (pos >= line.to && event.clientX > lineEndRect.right + 6)
    ) {
      hideEditorHint();
      return;
    }
    var labelInfo = fieldAtEditorPos(view.state, pos);
    if (!labelInfo || !labelInfo.label) {
      hideEditorHint();
      return;
    }

    updateTargetHighlight(view, labelInfo.from, labelInfo.to);

    var floatEl = document.getElementById("editorHint");
    var headerBox = document.getElementById("headerHintBox");
    var footerBox = document.getElementById("footerHintBox");

    if (settings.hintMode === "header") {
      if (floatEl) floatEl.hidden = true;
      if (footerBox) footerBox.hidden = true;
      if (headerBox) {
        headerBox.textContent = labelInfo.label;
        headerBox.hidden = false;
      }
    } else if (settings.hintMode === "footer") {
      if (floatEl) floatEl.hidden = true;
      if (headerBox) headerBox.hidden = true;
      if (footerBox) {
        footerBox.textContent = labelInfo.label;
        footerBox.hidden = false;
      }
    } else {
      if (headerBox) headerBox.hidden = true;
      if (footerBox) footerBox.hidden = true;

      var el = ensureEditorHint();
      el.textContent = labelInfo.label;
      el.hidden = false;

      var pad = 12;
      var x = event.clientX + pad;
      var y = event.clientY + pad;
      var rect = el.getBoundingClientRect();
      var vw = document.documentElement.clientWidth;
      var vh = document.documentElement.clientHeight;
      if (x + rect.width + 8 > vw) x = event.clientX - rect.width - pad;
      if (y + rect.height + 8 > vh) y = event.clientY - rect.height - pad;
      el.style.left = Math.max(8, x) + "px";
      el.style.top = Math.max(8, y) + "px";
    }
  }

function createHL7Highlighter({ RangeSetBuilder, Decoration, EditorView }) {
  const cls = {
    seg: Decoration.mark({ class: "cm-hl7-seg" }),
    fs: Decoration.mark({ class: "cm-hl7-fs" }),
    comp: Decoration.mark({ class: "cm-hl7-comp" }),
    rep: Decoration.mark({ class: "cm-hl7-rep" }),
    sub: Decoration.mark({ class: "cm-hl7-sub" }),
    esc: Decoration.mark({ class: "cm-hl7-esc" }),
    dtm: Decoration.mark({ class: "cm-hl7-dtm" }),
    id: Decoration.mark({ class: "cm-hl7-id" })
  };

  function add(ranges, from, to, deco) {
    if (to > from) ranges.push({ from, to, deco });
  }

  function decorateLine(lineText, base, ranges) {
    const segMatch = lineText.match(/^([A-Z0-9]{3})(.)/);

    if (segMatch) {
      const segLen = segMatch[1].length;
      add(ranges, base, base + segLen, cls.seg);
      add(ranges, base + segLen, base + segLen + 1, cls.fs);

      // MSH encoding chars (field 2)
      if (segMatch[1] === "MSH") {
        const fs = segMatch[2];
        const rest = lineText.slice(4);
        const encEnd = rest.indexOf(fs);
        if (encEnd >= 0) {
          const encStart = base + 4;
          for (let i = 0; i < encEnd; i++) {
            const ch = rest[i];
            const p = encStart + i;
            if (ch === "^") add(ranges, p, p + 1, cls.comp);
            else if (ch === "~") add(ranges, p, p + 1, cls.rep);
            else if (ch === "&") add(ranges, p, p + 1, cls.sub);
            else if (ch === "\\") add(ranges, p, p + 1, cls.esc);
          }
        }
      }

      // Separators and escapes in remainder
      for (let i = 4; i < lineText.length; i++) {
        const ch = lineText[i];
        const p = base + i;
        if (ch === "^") add(ranges, p, p + 1, cls.comp);
        else if (ch === "~") add(ranges, p, p + 1, cls.rep);
        else if (ch === "&") add(ranges, p, p + 1, cls.sub);
        else if (ch === "|") add(ranges, p, p + 1, cls.fs);
        else if (ch === "\\") {
          // Mark just the backslash; long greedy spans can overlap tokens
          add(ranges, p, p + 1, cls.esc);
        }
      }

      // Timestamps (non-overlapping spans)
      const dtmRe =
        /\b\d{4}(?:\d{2}(?:\d{2}(?:\d{2}(?:\d{2}(?:\d{2}(?:\.\d{1,4})?)?)?)?)?)(?:[+-]\d{4})?\b/g;
      let m;
      while ((m = dtmRe.exec(lineText))) {
        add(ranges, base + m.index, base + m.index + m[0].length, cls.dtm);
      }

      // IDs/codes
      const idRe = /\b[A-Za-z0-9][A-Za-z0-9._:-]{2,}\b/g;
      while ((m = idRe.exec(lineText))) {
        add(ranges, base + m.index, base + m.index + m[0].length, cls.id);
      }
    } else {
      // Non-segment line: color basic separators
      for (let i = 0; i < lineText.length; i++) {
        const ch = lineText[i];
        const p = base + i;
        if (ch === "^") add(ranges, p, p + 1, cls.comp);
        else if (ch === "~") add(ranges, p, p + 1, cls.rep);
        else if (ch === "&") add(ranges, p, p + 1, cls.sub);
        else if (ch === "|") add(ranges, p, p + 1, cls.fs);
      }
    }
  }

  const decoSet = EditorView.decorations.compute(["doc"], (state) => {
    const builder = new RangeSetBuilder();
    const ranges = [];

    // Collect ranges per line
    for (let i = 1; i <= state.doc.lines; i++) {
      const line = state.doc.line(i);
      decorateLine(line.text, line.from, ranges);
    }

    // Sort by from, then to (ensures monotonic order)
    ranges.sort((a, b) => (a.from - b.from) || (a.to - b.to));

    // Add in order
    for (const r of ranges) builder.add(r.from, r.to, r.deco);

    return builder.finish();
  });

  // Alternating per-segment (per-line) background stripe
  const altLine = Decoration.line({ class: "cm-hl7-altline" });
  const stripeSet = EditorView.decorations.compute(["doc"], (state) => {
    const b = new RangeSetBuilder();
    for (let i = 1; i <= state.doc.lines; i++) {
      if (i % 2 === 0) {
        const line = state.doc.line(i);
        b.add(line.from, line.from, altLine);
      }
    }
    return b.finish();
  });

  return [stripeSet, decoSet];
}

  async function ensureCodeMirror() {
    if (cmView) return cmView;

    var cmMod = window.CodeMirrorBundle;
    if (!cmMod) throw new Error("Local CodeMirror bundle did not load.");

    CM = {
      EditorView: cmMod.EditorView,
      keymap: cmMod.keymap,
      lineNumbers: cmMod.lineNumbers,
      highlightActiveLine: cmMod.highlightActiveLine,
      drawSelection: cmMod.drawSelection,
      Decoration: cmMod.Decoration,

      EditorState: cmMod.EditorState,
      RangeSetBuilder: cmMod.RangeSetBuilder,
      Compartment: cmMod.Compartment,
      StateField: cmMod.StateField,
      StateEffect: cmMod.StateEffect,

      defaultKeymap: cmMod.defaultKeymap,
      history: cmMod.history,
      historyKeymap: cmMod.historyKeymap,
      indentWithTab: cmMod.indentWithTab,

      lineWrapping: cmMod.EditorView.lineWrapping
    };

    WrapCompartment = new CM.Compartment();

    CM.hoverHighlightEffect = CM.StateEffect.define();
    CM.hoverHighlightField = CM.StateField.define({
      create() { return CM.Decoration.none; },
      update(decos, tr) {
        decos = decos.map(tr.changes);
        for (let e of tr.effects) {
          if (e.is(CM.hoverHighlightEffect)) {
            if (e.value.from == null || e.value.from === e.value.to) return CM.Decoration.none;
            return CM.Decoration.set([
              CM.Decoration.mark({class: "cm-hl7-hover"}).range(e.value.from, e.value.to)
            ]);
          }
        }
        return decos;
      },
      provide: f => CM.EditorView.decorations.from(f)
    });
    CM.unsupportedFlashEffect = CM.StateEffect.define();
    CM.unsupportedFlashField = CM.StateField.define({
      create() { return CM.Decoration.none; },
      update(decos, tr) {
        decos = decos.map(tr.changes);
        for (let e of tr.effects) {
          if (e.is(CM.unsupportedFlashEffect)) {
            if (!e.value || !e.value.length) return CM.Decoration.none;
            return CM.Decoration.set(
              e.value.map(function (range) {
                return CM.Decoration.mark({ class: "cm-hl7-unsupported-flash" })
                  .range(range.from, range.to);
              }),
              true
            );
          }
        }
        return decos;
      },
      provide: f => CM.EditorView.decorations.from(f)
    });

    const host = document.getElementById("cmEditor");
    const startDoc = "";

    const hl7Ext = createHL7Highlighter({
      RangeSetBuilder: CM.RangeSetBuilder,
      Decoration: CM.Decoration,
      EditorView: CM.EditorView
    });

    const state = CM.EditorState.create({
      doc: startDoc,
      extensions: [
        CM.lineNumbers(),
        CM.highlightActiveLine(),
        CM.drawSelection(),
        CM.hoverHighlightField,
        CM.unsupportedFlashField,
        CM.history(),
        CM.keymap.of([
          ...CM.defaultKeymap,
          ...CM.historyKeymap,
          CM.indentWithTab,
          // Parse on Mod-Enter
          { key: "Mod-Enter", run: () => (parseNow(), true) }
        ]),
        CM.EditorView.updateListener.of(function (update) {
          if (update.docChanged) {
            saveStoredMessage(update.state.doc.toString());
            scheduleParse();
          }
          if (update.selectionSet) {
            var head = update.state.selection.main.head;
            var lineNo = update.state.doc.lineAt(head).number;
            var segIdx = segIndexForLine(update.state, lineNo);
            highlightSegment(segIdx);
            var info = fieldAtEditorPos(update.state, head);
            highlightBreakdownField(segIdx, info ? info.field : null);
          }
        }),
        CM.EditorView.domEventHandlers({
          mousemove: function (event, view) {
            showEditorHint(view, event);
          },
          mouseleave: function () {
            hideEditorHint();
          },
          mousedown: function () {
            hideEditorHint();
          }
        }),
        WrapCompartment.of(CM.lineWrapping), // start with wrapping on
        CM.EditorView.theme({
          "&": { backgroundColor: "var(--input-bg)" },
          ".cm-content": { fontFamily: "var(--mono)" }
        }),
        hl7Ext
      ]
    });

    cmView = new CM.EditorView({ state, parent: host });
    return cmView;
  }

  function getEditorText() {
    if (cmView) return cmView.state.doc.toString();
    if (plainEditor) return plainEditor.value;
    return "";
  }

  function setEditorText(text) {
    saveStoredMessage(text || "");
    if (cmView) {
      cmView.dispatch({
        changes: { from: 0, to: cmView.state.doc.length, insert: text || "" }
      });
      return;
    }
    if (plainEditor) plainEditor.value = text || "";
  }

  function toggleWrap() {
    wrapOn = !wrapOn;
    if (cmView && WrapCompartment) {
      cmView.dispatch({
        effects: WrapCompartment.reconfigure(wrapOn ? CM.lineWrapping : [])
      });
    }
    if (plainEditor) plainEditor.wrap = wrapOn ? "soft" : "off";
  }

  // ================= HL7 Parse/Serialize =================
  function splitSegments(text) {
    var normalized = String(text).replace(/\r\n?/g, "\n");
    return normalized
      .split("\n")
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
  }

  function detectDelimiters(lines) {
    var defaults = { field: "|", comp: "^", rep: "~", esc: "\\", sub: "&" };
    var mshLine = lines.find(function (l) {
      return l.slice(0, 3) === "MSH";
    });
    if (!mshLine || mshLine.length < 4) return defaults;
    var field = mshLine.charAt(3);
    var rest = mshLine.slice(4);
    var firstFieldEnd = rest.indexOf(field);
    var enc = firstFieldEnd >= 0 ? rest.slice(0, firstFieldEnd) : rest;
    return {
      field: field,
      comp: enc.charAt(0) || defaults.comp,
      rep: enc.charAt(1) || defaults.rep,
      esc: enc.charAt(2) || defaults.esc,
      sub: enc.charAt(3) || defaults.sub
    };
  }

  function hl7Escape(val, delims) {
    if (!val) return val === 0 ? "0" : "";
    var d = delims;
    return String(val)
      .replaceAll(d.esc, d.esc + "E" + d.esc)
      .replaceAll(d.field, d.esc + "F" + d.esc)
      .replaceAll(d.comp, d.esc + "S" + d.esc)
      .replaceAll(d.rep, d.esc + "R" + d.esc)
      .replaceAll(d.sub, d.esc + "T" + d.esc);
  }

  function fieldToRaw(field, delims) {
    if (!field || !field.repeats) return "";
    var rep = delims.rep,
      comp = delims.comp,
      sub = delims.sub;

    var repStrings = field.repeats.map(function (rpt) {
      var compStrings = rpt.components.map(function (cmp) {
        var subs = cmp.subs || [];
        var subStrings = subs.map(function (s) {
          return hl7Escape(s, delims);
        });
        return subStrings.join(sub);
      });
      return compStrings.join(comp);
    });

    return repStrings.join(rep);
  }

  function parseField(raw, index, delims) {
    var comp = delims.comp,
      rep = delims.rep,
      sub = delims.sub;
    var reps = raw.split(rep);
    var repeats = reps.map(function (repStr) {
      var compVals = repStr.split(comp);
      return {
        components: compVals.map(function (cv) {
          return { subs: cv.split(sub) };
        })
      };
    });
    return { index: index, raw: raw, repeats: repeats };
  }

  function parseHL7(text) {
    var segmentsRaw = splitSegments(text);
    if (segmentsRaw.length === 0) return { delims: null, segments: [] };
    var delims = detectDelimiters(segmentsRaw);
    var fieldSep = delims.field;

    var segments = segmentsRaw.map(function (seg) {
      var name = seg.slice(0, 3);
      if (name === "MSH") {
        var fs = seg.charAt(3);
        var tail = seg.slice(4);
        var fields = tail.split(fs);
        var logical = [];
        logical.push({
          index: 1,
          raw: fs,
          repeats: [{ components: [{ subs: [fs] }] }]
        });
        var enc = fields[0] || "";
        logical.push({
          index: 2,
          raw: enc,
          repeats: [{ components: [{ subs: [enc] }] }]
        });
        for (var i = 1; i < fields.length; i++) {
          logical.push(parseField(fields[i], i + 2, delims));
        }
        return { name: name, fields: logical };
      } else {
        var parts = seg.split(fieldSep);
        var f = [];
        for (var j = 1; j < parts.length; j++) {
          f.push(parseField(parts[j], j, delims));
        }
        return { name: name, fields: f };
      }
    });

    return { delims: delims, segments: segments };
  }

  function serializeHL7(model) {
    if (!model || !model.segments.length) return "";
    var d = model.delims;
    var lines = model.segments.map(function (seg) {
      if (seg.name === "MSH") {
        var fs = (seg.fields[0] && seg.fields[0].raw) || d.field;
        var enc =
          (seg.fields[1] && seg.fields[1].raw) ||
          d.comp + d.rep + d.esc + d.sub;
        var rest = [];
        for (var f = 2; f < seg.fields.length; f++) {
          rest.push(fieldToRaw(seg.fields[f], d));
        }
        return "MSH" + fs + [enc].concat(rest).join(fs);
      } else {
        var parts = [seg.name];
        for (var f2 = 0; f2 < seg.fields.length; f2++) {
          parts.push(fieldToRaw(seg.fields[f2], d));
        }
        return parts.join(d.field);
      }
    });
    return lines.join("\r\n");
  }

  // ================= PID anonymisation =================
  var FAKE_GIVEN_NAMES = [
    "Amelia", "Arthur", "Ava", "Benjamin", "Charlotte", "Daniel", "Eleanor", "Ethan",
    "Florence", "Freddie", "Grace", "Harrison", "Iris", "Isaac", "Isla", "Jack",
    "Jasmine", "Leo", "Lily", "Logan", "Maisie", "Mason", "Matilda", "Mia",
    "Noah", "Olivia", "Oscar", "Phoebe", "Poppy", "Reuben", "Ruby", "Samuel",
    "Sienna", "Sophia", "Theo", "Thomas", "Willow", "Zachary", "Aaron", "Alice",
    "Brooke", "Caleb", "Daisy", "Elijah", "Eva", "Felix", "Georgia", "Harriet",
    "Imogen", "Jacob", "Layla", "Lucas", "Maya", "Nathan", "Orla", "Rory",
    "Scarlett", "Toby", "Violet", "William"
  ];
  var FAKE_FAMILY_NAMES = [
    "Adams", "Allen", "Baker", "Bennett", "Brooks", "Brown", "Campbell", "Carter",
    "Clark", "Cole", "Collins", "Cook", "Cooper", "Davies", "Dixon", "Edwards",
    "Evans", "Fisher", "Foster", "Green", "Griffiths", "Hall", "Harris", "Hill",
    "Hughes", "Jackson", "James", "Jenkins", "Johnson", "Jones", "Kelly", "King",
    "Lewis", "Lloyd", "Marshall", "Martin", "Mason", "Miller", "Mitchell", "Moore",
    "Morgan", "Morris", "Murphy", "Parker", "Patel", "Phillips", "Powell", "Price",
    "Reed", "Roberts", "Robinson", "Scott", "Smith", "Taylor", "Thomas", "Thompson",
    "Turner", "Walker", "Ward", "Williams"
  ];
  var FAKE_STREET_NAMES = [
    "Abbey Road", "Ash Grove", "Baker Street", "Beech Avenue", "Birch Close",
    "Bridge Street", "Brook Lane", "Cedar Avenue", "Church Road", "Clifton Drive",
    "College Street", "Cooper Close", "Cromwell Road", "Derwent Way", "Elm Grove",
    "Fairfield Road", "Field View", "Garden Street", "Glen Road", "Granby Street",
    "Green Lane", "Grove Park", "Hamilton Road", "Hawthorn Close", "High Street",
    "Hillcrest Road", "King Street", "Kingsway", "Lakeside Drive", "Laurel Close",
    "Lime Tree Avenue", "Long Lane", "Manor Road", "Maple Drive", "Market Street",
    "Meadow Lane", "Mill Road", "New Road", "North Street", "Oak Road",
    "Orchard Way", "Park Avenue", "Poplar Close", "Queens Road", "River View",
    "Rosemary Lane", "Rowan Court", "School Lane", "South Street", "Station Road",
    "Sycamore Drive", "The Crescent", "Victoria Road", "Walnut Close", "Water Lane",
    "Westfield Road", "Willow Drive", "Woodland Avenue", "York Road", "Yew Tree Close"
  ];
  var FAKE_ADDRESS_LINES = [
    "Flat 1", "Flat 2", "Flat 3", "Flat 4", "Flat 5", "Apartment 6", "Apartment 7",
    "Apartment 8", "Suite 9", "Unit 10", "The Old Rectory", "Rose Cottage",
    "Ivy Cottage", "Meadow View", "Brook House", "Oak House", "Maple House",
    "Cedar House", "Willow House", "Rowan House", "The Coach House", "Garden Flat",
    "Top Floor", "Lower Ground", "First Floor", "Second Floor", "North Wing",
    "South Wing", "East Wing", "West Wing", "Annexe A", "Annexe B", "Building C",
    "Block D", "Block E", "Court 6", "House 7", "Lodge 8", "Mews 9", "Studio 10",
    "Room 11", "Room 12", "Bay 13", "Plot 14", "Plot 15", "Unit 16", "Unit 17",
    "Suite 18", "Flat 19", "Flat 20", "Apartment 21", "Apartment 22", "The Barn",
    "The Granary", "The Lodge", "Mill House", "Park View", "Hill View", "Riverbank",
    "Orchard House"
  ];
  var FAKE_CITIES = [
    "Aberdeen", "Arundel", "Ashford", "Aylesbury", "Bangor", "Barnsley", "Bath",
    "Bedford", "Belfast", "Birmingham", "Blackburn", "Blackpool", "Bolton",
    "Bournemouth", "Bradford", "Brighton", "Bristol", "Cambridge", "Canterbury",
    "Cardiff", "Carlisle", "Chelmsford", "Cheltenham", "Chester", "Colchester",
    "Coventry", "Derby", "Doncaster", "Dundee", "Durham", "Edinburgh", "Exeter",
    "Glasgow", "Gloucester", "Guildford", "Harrogate", "Ipswich", "Lancaster",
    "Leeds", "Leicester", "Lincoln", "Liverpool", "London", "Luton", "Manchester",
    "Newcastle", "Norwich", "Nottingham", "Oxford", "Peterborough", "Plymouth",
    "Portsmouth", "Preston", "Reading", "Sheffield", "Southampton", "Swansea",
    "Truro", "Winchester"
  ];
  var FAKE_COUNTIES = [
    "Avon", "Bedfordshire", "Berkshire", "Buckinghamshire", "Cambridgeshire",
    "Cheshire", "Cornwall", "Cumbria", "Derbyshire", "Devon", "Dorset", "Durham",
    "East Sussex", "Essex", "Gloucestershire", "Greater London", "Greater Manchester",
    "Hampshire", "Hertfordshire", "Kent", "Lancashire", "Leicestershire",
    "Lincolnshire", "Merseyside", "Norfolk", "North Yorkshire", "Northamptonshire",
    "Nottinghamshire", "Oxfordshire", "Shropshire", "Somerset", "South Yorkshire",
    "Staffordshire", "Suffolk", "Surrey", "Tyne and Wear", "Warwickshire",
    "West Midlands", "West Sussex", "West Yorkshire", "Wiltshire", "Worcestershire",
    "Antrim", "Armagh", "Down", "Fermanagh", "Londonderry", "Tyrone", "Clwyd",
    "Dyfed", "Gwent", "Gwynedd", "Powys", "Mid Glamorgan", "South Glamorgan",
    "West Glamorgan", "Aberdeenshire", "Angus", "Fife", "Highland", "Lothian"
  ];
  var FAKE_POSTCODE_AREAS = [
    "AB", "AL", "B", "BA", "BB", "BD", "BH", "BL", "BN", "BR", "BS", "BT", "CA",
    "CB", "CF", "CH", "CM", "CO", "CR", "CT", "CV", "CW", "DA", "DD", "DE", "DG",
    "DH", "DL", "DN", "DT", "DY", "E", "EC", "EH", "EN", "EX", "FK", "FY", "G",
    "GL", "GU", "HA", "HD", "HG", "HP", "HR", "HU", "HX", "IG", "IP", "IV", "KT",
    "L", "LA", "LE", "LL", "LN", "LS", "LU", "M"
  ];
  var FAKE_SEXES = ["F", "M", "U", "O"];
  var FAKE_LANDLINE_CODES = [
    "0113", "0114", "0115", "0116", "0117", "0118", "0121", "0131", "0141", "0151",
    "0161", "0191", "020", "023", "024", "028", "029", "01382", "01452", "01522",
    "01603", "01752", "01865", "01904", "01223", "01225", "01273", "01392", "01483",
    "01582", "01604", "01733", "01872", "01908", "01962", "01978", "01244", "01274",
    "01302", "01482", "01524", "01642", "01772", "01823", "01925", "01935", "01202",
    "01245", "01332", "01432", "01536", "01633", "01707", "01895", "01926", "01952",
    "01256", "01384", "01494", "01527"
  ];
  var FAMOUS_GIVEN_NAMES = [
    "Adele", "Beyonce", "Billie", "Bruno", "Calvin", "Chris", "Daniel", "David",
    "Dua", "Ed", "Elton", "Emma", "Florence", "Freddie", "George", "Harry",
    "Hugh", "Idris", "Jude", "Kate", "Keira", "Lewis", "Lionel", "Margot",
    "Mo", "Naomi", "Olivia", "Paul", "Ringo", "Sam", "Serena", "Stormzy",
    "Taylor", "Tom", "Venus", "Zendaya"
  ];
  var FAMOUS_FAMILY_NAMES = [
    "Adkins", "Beckham", "Bolt", "Bowie", "Capaldi", "Craig", "Dench", "Dylan",
    "Eilish", "Fury", "Goulding", "Hamilton", "Holland", "John", "Kane", "Lipa",
    "McCartney", "Mercury", "Murray", "Radcliffe", "Redmayne", "Rihanna", "Sheeran",
    "Smith", "Styles", "Swift", "Watson", "Williams", "Winslet", "Wonder"
  ];
  var SILLY_STREET_NAMES = [
    "Banana Boulevard", "Biscuit Crescent", "Bubblegum Lane", "Bumblebee Road",
    "Custard Close", "Doodle Drive", "Dragonfly Street", "Flapjack Avenue",
    "Gigglewick Gardens", "Gingerbread Grove", "Hobnob Hill", "Jellybean Road",
    "Kipper Lane", "Lollipop Mews", "Marshmallow Street", "Marmalade Way",
    "Noodle Close", "Pancake Parade", "Pickle Place", "Pudding Lane",
    "Rainbow Road", "Scone Street", "Sherbet Avenue", "Snickerdoodle Drive",
    "Sprocket Street", "Teacake Terrace", "Toffee Court", "Waffle Way",
    "Wobbleton Road", "Yoyo Yard"
  ];
  var SILLY_ADDRESS_LINES = [
    "Flat Over The Chip Shop", "The Wonky Attic", "Cupboard Under The Stairs",
    "Top Floor Turret", "Blue Door Basement", "The Left-Hand Annexe",
    "Garden Shed Suite", "Moonlight Mezzanine", "The Old Sweet Tin",
    "Room Behind The Bookcase", "The Sunny Nook", "Studio By The Kettle",
    "Loft Above The Larder", "The Cosy Cubby", "The Round Window Room",
    "West Wing-ish", "The Secret Snug", "The Polka Dot Flat", "The Tiny Tower",
    "The Grand Sock Drawer", "The Biscuit Annex", "The Purple Porch",
    "The Smallest Lodge", "The Nearly New Nook", "The Teapot Flat",
    "The Button Box", "The Clockwork Room", "The Zigzag Landing",
    "The Jolly Alcove", "The Marmalade Loft"
  ];
  var SILLY_CITIES = [
    "Bumbleford", "Crumpet-on-Sea", "Doodleham", "Giggleswick", "Jamchester",
    "Muffinfield", "Noodlebury", "Pickleton", "Puddington", "Scone Regis",
    "Snugglewick", "Teacup Wells", "Toffeeton", "Wobbleford", "Yumbridge"
  ];
  var SILLY_COUNTIES = [
    "Custardshire", "Doodleshire", "Fizzyshire", "Jellyshire", "Mirthshire",
    "Nibbleshire", "Puddingshire", "Sherbetshire", "Sillyshire", "Wobbletonshire"
  ];
  var STAR_WARS_GIVEN_NAMES = [
    "Luke", "Leia", "Han", "Lando", "Rey", "Finn", "Poe", "Padme", "Anakin",
    "Obi-Wan", "Qui-Gon", "Mace", "Ahsoka", "Sabine", "Ezra", "Hera", "Kanan",
    "Cassian", "Jyn", "Bodhi", "Wedge", "Biggs", "Mon", "Nien", "Rose", "Maz",
    "Din", "Grogu", "Bo-Katan", "Fennec", "Bail", "Beru", "Owen", "C-3PO", "R2-D2"
  ];
  var STAR_WARS_FAMILY_NAMES = [
    "Skywalker", "Organa", "Solo", "Calrissian", "Kenobi", "Jinn", "Windu",
    "Tano", "Wren", "Bridger", "Syndulla", "Andor", "Erso", "Rook", "Antilles",
    "Darklighter", "Mothma", "Nunb", "Tico", "Kanata", "Djarin", "Kryze",
    "Shand", "Bane", "Fett", "Lars", "Amidala", "Secura", "Koon", "Tarkin"
  ];
  var STAR_WARS_STREET_NAMES = [
    "Tatooine Terrace", "Alderaan Avenue", "Coruscant Crescent", "Naboo Lane",
    "Endor Road", "Hoth Hill", "Bespin Boulevard", "Dagobah Drive", "Yavin Yard",
    "Jakku Junction", "Scarif Street", "Lothal Lane", "Mandalore Mews",
    "Kamino Quay", "Kashyyyk Close", "Mustafar Way", "Dantooine Drive",
    "Corellia Court", "Jedha Street", "Kessel Road", "Felucia Fields",
    "Geonosis Gardens", "Ryloth Road", "Ahch-To Avenue", "Crait Crescent"
  ];
  var STAR_WARS_ADDRESS_LINES = [
    "Moisture Farm Unit", "Jedi Archive Annex", "Rebel Hangar Bay", "Droid Workshop",
    "Cantina Upstairs", "Docking Bay 94", "Cloud City Suite", "Ewok Village Hut",
    "Echo Base Room", "The Senate Rotunda", "Podracer Garage", "Temple Training Room",
    "Smuggler's Nook", "Resistance Bunker", "Mandalorian Forge", "Clone Barracks",
    "Astromech Alcove", "Holocron Store", "Blue Milk Flat", "Hyperdrive Loft",
    "Sarlacc View", "Bantha Barn", "Wookiee Treehouse", "Kyber Crystal Room"
  ];
  var STAR_WARS_CITIES = [
    "Mos Eisley", "Mos Espa", "Theed", "Cloud City", "Anchorhead", "Niima Outpost",
    "Sundari", "Tipoca City", "Coronet City", "Jedha City", "Lothal Capital",
    "Kachirho", "Canto Bight", "Galactic City", "Pau City"
  ];
  var STAR_WARS_COUNTIES = [
    "Outer Rim", "Mid Rim", "Core Worlds", "Western Reaches", "Anoat Sector",
    "Arkanis Sector", "Lothal Sector", "Mandalore Sector", "Naboo System",
    "Tatoo System"
  ];

  var ANON_FIELD_IDS = [
    1, 2, 3, 5, 6, 7, 8, 10, 11, 13, 14, 16, 17, 18, 19, 22, 29, 30
  ];

  function defaultAnonConfig() {
    var fields = {};
    for (var i = 0; i < ANON_FIELD_IDS.length; i++) fields[String(ANON_FIELD_IDS[i])] = true;
    return {
      specialMode: "standard",
      useFamousSilly: false,
      fields: fields,
      ranges: {
        dobMinYear: 1928,
        dobMaxYear: 2024,
        deathMinYear: 2020,
        deathMaxYear: 2026,
        setIdMin: 1,
        setIdMax: 9999,
        pasDigits: 8,
        mrnDigits: 8,
        accountPrefix: "ACCT",
        accountDigits: 9
      },
      lists: {
        givenNames: FAKE_GIVEN_NAMES.slice(),
        familyNames: FAKE_FAMILY_NAMES.slice(),
        streetNames: FAKE_STREET_NAMES.slice(),
        addressLines: FAKE_ADDRESS_LINES.slice(),
        cities: FAKE_CITIES.slice(),
        counties: FAKE_COUNTIES.slice(),
        postcodeAreas: FAKE_POSTCODE_AREAS.slice(),
        landlineCodes: FAKE_LANDLINE_CODES.slice()
      }
    };
  }

  function cleanList(values, fallback) {
    var out = (values || [])
      .map(function (v) { return String(v || "").trim(); })
      .filter(Boolean);
    return out.length ? out : fallback.slice();
  }

  function numberInRange(value, fallback, min, max) {
    var n = Number(value);
    if (!Number.isFinite(n)) n = fallback;
    return Math.max(min, Math.min(max, Math.round(n)));
  }

  function normalizeAnonConfig(config) {
    var d = defaultAnonConfig();
    var c = config || {};
    var specialMode = c.specialMode || (c.useFamousSilly ? "famous-silly" : "standard");
    if (["standard", "famous-silly", "star-wars"].indexOf(specialMode) < 0) {
      specialMode = "standard";
    }
    var fields = {};
    for (var i = 0; i < ANON_FIELD_IDS.length; i++) {
      var id = String(ANON_FIELD_IDS[i]);
      fields[id] = c.fields && Object.prototype.hasOwnProperty.call(c.fields, id)
        ? !!c.fields[id]
        : d.fields[id];
    }
    var r = c.ranges || {};
    var ranges = {
      dobMinYear: numberInRange(r.dobMinYear, d.ranges.dobMinYear, 1900, 2100),
      dobMaxYear: numberInRange(r.dobMaxYear, d.ranges.dobMaxYear, 1900, 2100),
      deathMinYear: numberInRange(r.deathMinYear, d.ranges.deathMinYear, 1900, 2100),
      deathMaxYear: numberInRange(r.deathMaxYear, d.ranges.deathMaxYear, 1900, 2100),
      setIdMin: numberInRange(r.setIdMin, d.ranges.setIdMin, 1, 999999),
      setIdMax: numberInRange(r.setIdMax, d.ranges.setIdMax, 1, 999999),
      pasDigits: numberInRange(r.pasDigits, d.ranges.pasDigits, 4, 16),
      mrnDigits: numberInRange(r.mrnDigits, d.ranges.mrnDigits, 4, 16),
      accountPrefix: String(r.accountPrefix || d.ranges.accountPrefix).slice(0, 10),
      accountDigits: numberInRange(r.accountDigits, d.ranges.accountDigits, 4, 16)
    };
    if (ranges.dobMinYear > ranges.dobMaxYear) ranges.dobMaxYear = ranges.dobMinYear;
    if (ranges.deathMinYear > ranges.deathMaxYear) ranges.deathMaxYear = ranges.deathMinYear;
    if (ranges.setIdMin > ranges.setIdMax) ranges.setIdMax = ranges.setIdMin;
    var lists = c.lists || {};
    return {
      specialMode: specialMode,
      useFamousSilly: specialMode === "famous-silly",
      fields: fields,
      ranges: ranges,
      lists: {
        givenNames: cleanList(lists.givenNames, FAKE_GIVEN_NAMES),
        familyNames: cleanList(lists.familyNames, FAKE_FAMILY_NAMES),
        streetNames: cleanList(lists.streetNames, FAKE_STREET_NAMES),
        addressLines: cleanList(lists.addressLines, FAKE_ADDRESS_LINES),
        cities: cleanList(lists.cities, FAKE_CITIES),
        counties: cleanList(lists.counties, FAKE_COUNTIES),
        postcodeAreas: cleanList(lists.postcodeAreas, FAKE_POSTCODE_AREAS),
        landlineCodes: cleanList(lists.landlineCodes, FAKE_LANDLINE_CODES)
      }
    };
  }

  function loadAnonConfig() {
    try {
      return normalizeAnonConfig(JSON.parse(localStorage.getItem(ANON_CONFIG_KEY) || "null"));
    } catch (_) {
      return normalizeAnonConfig(null);
    }
  }

  function saveAnonConfig(config) {
    var normalized = normalizeAnonConfig(config);
    try {
      localStorage.setItem(ANON_CONFIG_KEY, JSON.stringify(normalized));
    } catch (_) {}
    return normalized;
  }

  function resetAnonConfig() {
    try {
      localStorage.removeItem(ANON_CONFIG_KEY);
    } catch (_) {}
    return normalizeAnonConfig(null);
  }

  function randomItem(items) {
    return items[Math.floor(Math.random() * items.length)];
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function padNumber(value, width) {
    return String(value).padStart(width, "0");
  }

  function randomDigits(width, firstMin) {
    var out = String(randomInt(firstMin == null ? 0 : firstMin, 9));
    while (out.length < width) out += String(randomInt(0, 9));
    return out;
  }

  function randomDateYmd(minYear, maxYear) {
    var year = randomInt(minYear, maxYear);
    var month = randomInt(1, 12);
    var maxDay = new Date(year, month, 0).getDate();
    return String(year) + padNumber(month, 2) + padNumber(randomInt(1, maxDay), 2);
  }

  function randomPostcode(config) {
    var areas = (config && config.lists && config.lists.postcodeAreas) || FAKE_POSTCODE_AREAS;
    return (
      randomItem(areas) +
      randomInt(1, 99) +
      " " +
      randomInt(1, 9) +
      randomItem("ABCDEFGHJKPSTUWXYZ".split("")) +
      randomItem("ABCDEFGHJKPSTUWXYZ".split(""))
    );
  }

  function randomUkPhone(kind, config) {
    if (kind === "mobile") return "077009" + randomDigits(5);
    var codes = (config && config.lists && config.lists.landlineCodes) || FAKE_LANDLINE_CODES;
    return randomItem(codes) + "960" + randomDigits(3);
  }

  function randomNhsNumber() {
    var base = randomDigits(9, 4);
    var total = 0;
    for (var i = 0; i < 9; i++) total += Number(base.charAt(i)) * (10 - i);
    var check = 11 - (total % 11);
    if (check === 11) check = 0;
    if (check === 10) return randomNhsNumber();
    return base + String(check);
  }

  function randomPasId(config) {
    var r = (config && config.ranges) || defaultAnonConfig().ranges;
    return randomDigits(r.pasDigits, 1);
  }

  function randomMrn(config) {
    var r = (config && config.ranges) || defaultAnonConfig().ranges;
    return randomDigits(r.mrnDigits, 1);
  }

  function randomAccount(config) {
    var r = (config && config.ranges) || defaultAnonConfig().ranges;
    return r.accountPrefix + randomDigits(r.accountDigits, 1);
  }

  function specialAnonLists(config) {
    if (!config || config.specialMode === "standard") return null;
    if (config.specialMode === "star-wars") {
      return {
        givenNames: STAR_WARS_GIVEN_NAMES,
        familyNames: STAR_WARS_FAMILY_NAMES,
        streetNames: STAR_WARS_STREET_NAMES,
        addressLines: STAR_WARS_ADDRESS_LINES,
        cities: STAR_WARS_CITIES,
        counties: STAR_WARS_COUNTIES,
        postcodeAreas: ["SW"],
        landlineCodes: config.lists.landlineCodes
      };
    }
    return {
      givenNames: FAMOUS_GIVEN_NAMES,
      familyNames: FAMOUS_FAMILY_NAMES,
      streetNames: SILLY_STREET_NAMES,
      addressLines: SILLY_ADDRESS_LINES,
      cities: SILLY_CITIES,
      counties: SILLY_COUNTIES,
      postcodeAreas: config.lists.postcodeAreas,
      landlineCodes: config.lists.landlineCodes
    };
  }

  function makeFakePatient(config) {
    var c = config || loadAnonConfig();
    var lists = specialAnonLists(c) || c.lists;
    var ranges = c.ranges;
    var given = randomItem(lists.givenNames);
    return {
      family: randomItem(lists.familyNames),
      given: given,
      middle: randomItem(lists.givenNames),
      dob: randomDateYmd(ranges.dobMinYear, ranges.dobMaxYear),
      sex: randomItem(FAKE_SEXES),
      street: randomInt(1, 240) + " " + randomItem(lists.streetNames),
      address2: randomItem(lists.addressLines),
      city: randomItem(lists.cities),
      county: randomItem(lists.counties),
      postcode: randomPostcode(c),
      mobile: randomUkPhone("mobile", c),
      phone: randomUkPhone("landline", c),
      pasId: randomPasId(c),
      nhs: randomNhsNumber(),
      mrn: randomMrn(c),
      account: randomAccount(c)
    };
  }

  function hasPidValue(value) {
    return value != null && String(value).trim() !== "";
  }

  function pidFakeValue(fieldIndex, compIndex, subIndex, repeatIndex, patientIndex, patient, config) {
    var c = config || loadAnonConfig();
    var p = patient || makeFakePatient(c);
    var specialLists = specialAnonLists(c);
    var activeLists = specialLists
      ? { givenNames: specialLists.givenNames, addressLines: specialLists.addressLines }
      : { givenNames: c.lists.givenNames, addressLines: c.lists.addressLines };
    var ranges = c.ranges;
    var repSuffix = repeatIndex ? String(repeatIndex + 1) : "";
    switch (fieldIndex) {
      case 1:
        return String(randomInt(ranges.setIdMin, ranges.setIdMax));
      case 2:
        if (compIndex === 1) return p.pasId + repSuffix;
        if (compIndex === 4) return "PAS";
        if (compIndex === 5) return "PI";
        return "PAS" + String(compIndex) + randomDigits(3);
      case 3:
        if (compIndex === 1) return repeatIndex % 2 === 0 ? p.nhs : p.mrn + repSuffix;
        if (compIndex === 4) return repeatIndex % 2 === 0 ? "NHS" : "PAS";
        if (compIndex === 5) return repeatIndex % 2 === 0 ? "NH" : "MR";
        return compIndex === 2 ? String(randomInt(1, 9)) : "ID" + randomDigits(4);
      case 5:
      case 6:
        if (compIndex === 1) return p.family;
        if (compIndex === 2) return p.given;
        if (compIndex === 3) return p.middle;
        if (compIndex === 7) return fieldIndex === 6 ? "M" : "L";
        return compIndex === 4 ? "Mx" : compIndex === 5 ? "Dr" : randomItem(activeLists.givenNames);
      case 7:
        return randomDateYmd(ranges.dobMinYear, ranges.dobMaxYear);
      case 8:
        return p.sex;
      case 10:
        return compIndex === 1 ? "A" : compIndex === 2 ? "White British" : compIndex === 3 ? "UKETH" : "ETH" + randomDigits(3);
      case 11:
        if (compIndex === 1) return p.street;
        if (compIndex === 2) return p.address2;
        if (compIndex === 3) return p.city;
        if (compIndex === 4) return p.county;
        if (compIndex === 5) return p.postcode;
        if (compIndex === 6) return c.specialMode === "star-wars" ? "GAL" : "GBR";
        if (compIndex === 7) return "H";
        return randomItem(activeLists.addressLines);
      case 13:
      case 14:
        if (compIndex === 1) return fieldIndex === 13 ? p.mobile : p.phone;
        if (compIndex === 2) return fieldIndex === 13 ? "PRN" : "WPN";
        if (compIndex === 3) return "PH";
        return randomDigits(6);
      case 16:
        return compIndex === 1 ? randomItem(["S", "M", "D", "W", "P"]) : compIndex === 2 ? "Unknown" : "HL70002";
      case 17:
        return compIndex === 1 ? randomItem(["ATH", "CHR", "MOS", "OTH", "UNK"]) : compIndex === 2 ? "Other" : compIndex === 3 ? "HL70006" : "REL" + randomDigits(2);
      case 18:
        return compIndex === 1 ? p.account : "";
      case 19:
        return randomDigits(9, 1);
      case 22:
        return compIndex === 1 ? randomItem(["A", "B", "C", "N", "U"]) : compIndex === 2 ? "Not stated" : "UKETH";
      case 29:
      case 30:
        return fieldIndex === 29 ? randomDateYmd(ranges.deathMinYear, ranges.deathMaxYear) : randomItem(["N", "Y"]);
      default:
        return "ANON" + String(fieldIndex).padStart(2, "0") + randomDigits(6);
    }
  }

  function anonymizePidField(field, patientIndex, patient, config) {
    if (!field || !hasPidValue(field.raw)) return false;
    if (!config.fields[String(field.index)]) return false;
    var changed = false;
    for (var r = 0; r < field.repeats.length; r++) {
      var rep = field.repeats[r];
      for (var c = 0; c < rep.components.length; c++) {
        var comp = rep.components[c];
        for (var s = 0; s < comp.subs.length; s++) {
          if (!hasPidValue(comp.subs[s])) continue;
          comp.subs[s] = pidFakeValue(field.index, c + 1, s + 1, r, patientIndex, patient, config);
          changed = true;
        }
      }
    }
    if (changed) field.raw = fieldToRaw(field, currentModel.delims);
    return changed;
  }

  function anonymizeCurrentPid() {
    var originalText = getEditorText().trim();
    currentModel = parseHL7(originalText);
    if (!currentModel || !currentModel.segments.length) {
      showCopied("No message loaded");
      return;
    }
    var changedFields = 0;
    var pidCount = 0;
    var anonConfig = loadAnonConfig();
    for (var i = 0; i < currentModel.segments.length; i++) {
      var seg = currentModel.segments[i];
      if (seg.name !== "PID") continue;
      var patientIndex = pidCount++;
      var patient = makeFakePatient(anonConfig);
      for (var f = 0; f < seg.fields.length; f++) {
        if (anonymizePidField(seg.fields[f], patientIndex, patient, anonConfig)) changedFields++;
      }
    }
    if (!pidCount) {
      showCopied("No PID segment found");
      return;
    }
    if (!loadOriginalPidMessage()) saveOriginalPidMessage(originalText);
    serializeAndRefresh();
    showCopied(
      "Anonymised " + changedFields + " PID field" + (changedFields === 1 ? "" : "s")
    );
  }

  function restoreOriginalPidData() {
    var originalText = loadOriginalPidMessage();
    if (!originalText) {
      showCopied("No original PID data saved");
      return;
    }
    setEditorText(originalText);
    currentModel = parseHL7(originalText.trim());
    renderTree(currentModel);
    clearOriginalPidMessage();
    showCopied("Restored original PID data");
  }

  // ================= Right pane rendering =================
  function fieldName(seg, index) {
    var byVer = FIELD_NAMES_BY_VERSION[currentVersion] || {};
    var segMap = byVer[seg] || {};
    if (segMap[index]) return segMap[index];
    return " ";
  }

  function gvCall(path) {
    return 'doc.GetValueAt("' + path + '")';
  }

  // Field-level call; includes repeat index only for repeating fields.
  function fieldCopyCall(segName, fieldIndex, repNum, multi) {
    return gvCall(segName + ":" + fieldIndex + (multi ? "(" + repNum + ")" : ""));
  }

  function copyText(text) {
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(showCopied, function () {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      showCopied();
    } catch (_) {}
    document.body.removeChild(ta);
  }

  function showCopied(msg) {
    var t = document.getElementById("copyToast");
    if (!t) {
      t = document.createElement("div");
      t.id = "copyToast";
      t.className = "copy-toast";
      document.body.appendChild(t);
    }
    t.textContent = msg || "Copied to clipboard";
    t.classList.add("show");
    clearTimeout(showCopied._t);
    showCopied._t = setTimeout(function () {
      t.classList.remove("show");
    }, 1300);
  }

  // ---- Field info popover (click the ⓘ) ----
  var infoPopEl = null;
  var infoAnchor = null;

  function hideInfo() {
    if (infoPopEl) infoPopEl.style.display = "none";
    infoAnchor = null;
  }

  function ensureInfoPop() {
    if (infoPopEl) return infoPopEl;
    infoPopEl = document.createElement("div");
    infoPopEl.className = "info-pop";
    infoPopEl.style.display = "none";
    document.body.appendChild(infoPopEl);

    document.addEventListener("mousedown", function (e) {
      if (!infoPopEl || infoPopEl.style.display === "none") return;
      if (
        e.target.closest &&
        (e.target.closest(".info-pop") || e.target.closest('[data-action="info"]'))
      )
        return;
      hideInfo();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") hideInfo();
    });
    document.addEventListener("scroll", hideInfo, true);
    window.addEventListener("resize", hideInfo);
    return infoPopEl;
  }

  function showInfo(btn) {
    var pop = ensureInfoPop();
    if (infoAnchor === btn && pop.style.display !== "none") {
      hideInfo();
      return;
    }
    infoAnchor = btn;
    var title = btn.getAttribute("data-title") || "";
    var desc = btn.getAttribute("data-desc") || "";
    pop.innerHTML =
      '<div class="info-pop-title">' + escText(title) + "</div>" +
      '<div class="info-pop-body">' + escText(desc) + "</div>";

    pop.style.display = "block";
    pop.style.visibility = "hidden";
    var r = btn.getBoundingClientRect();
    var pw = pop.offsetWidth;
    var ph = pop.offsetHeight;
    var vw = document.documentElement.clientWidth;
    var vh = document.documentElement.clientHeight;
    var left = r.left;
    if (left + pw + 8 > vw) left = vw - pw - 8;
    if (left < 8) left = 8;
    var top = r.bottom + 6;
    if (top + ph + 8 > vh) top = r.top - ph - 6;
    pop.style.left = left + "px";
    pop.style.top = top + "px";
    pop.style.visibility = "visible";
  }

  function datatypeFor(seg, fieldIndex) {
    var byVer = DATATYPE_BY_FIELD[currentVersion] || DATATYPE_BY_FIELD["2.4"] || {};
    var segMap = byVer[seg] || {};
    return segMap[fieldIndex] || null;
  }

  // Component name from the field's datatype; for single-value fields fall back
  // to the field name itself so component 1 still reads meaningfully.
  function componentName(seg, fieldIndex, compIndex, compCount) {
    var dt = datatypeFor(seg, fieldIndex);
    if (dt && COMPONENT_NAMES_BY_DATATYPE[dt]) {
      var nm = COMPONENT_NAMES_BY_DATATYPE[dt][compIndex];
      if (nm) return nm;
    }
    if (compIndex === 1 && compCount === 1) {
      var fn = fieldName(seg, fieldIndex);
      if (fn && fn.trim()) return fn.trim();
    }
    return null;
  }

  function escAttr(v) {
    return v == null ? "" : String(v).replace(/"/g, "&quot;");
  }
  function escText(v) {
    return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  }

  function fieldDesc(seg, index) {
    var segMap = FIELD_DESC_BY_SEGMENT[seg] || {};
    if (segMap[index]) return segMap[index];

    var nm = fieldName(seg, index);
    if (nm && nm.trim()) {
      return (
        seg +
        "-" +
        index +
        " (" +
        nm.trim() +
        ") — field defined by the HL7 " +
        seg +
        " segment."
      );
    }
    return "";
  }

  function renderBreakdown(field, segIdx, segName) {
    var multiRep = field.repeats.length > 1;
    var blocks = "";

    for (var r = 0; r < field.repeats.length; r++) {
      var rep = field.repeats[r];
      var compCount = rep.components.length;
      var rows = "";

      for (var c = 0; c < compCount; c++) {
        var comp = rep.components[c];
        var subs = comp.subs || [];
        var repTag = multiRep ? "(" + (r + 1) + ")" : "";
        var compPath = segName + ":" + field.index + repTag + "." + (c + 1);
        var compCall = gvCall(compPath).replace(/"/g, "&quot;");
        var compNm = componentName(segName, field.index, c + 1, compCount);
        var nameHtml = compNm
          ? '<span class="comp-name">' + escText(compNm) + "</span>"
          : "";

        function subAttrs(sIdx) {
          return (
            'data-role="sub" data-seg-index="' + segIdx +
            '" data-field-index="' + field.index +
            '" data-repeat-index="' + r +
            '" data-comp-index="' + c +
            '" data-sub-index="' + sIdx + '"'
          );
        }

        var valHtml;
        if (subs.length <= 1) {
          // Single subcomponent: the value IS the component — one inline input.
          valHtml =
            '<input class="comp-val" ' + subAttrs(0) +
            ' value="' + escAttr(subs.length ? subs[0] : "") + '" />';
        } else {
          valHtml = "";
          for (var s = 0; s < subs.length; s++) {
            valHtml +=
              '<span class="sub-chip"><span class="sub-tag">S' + (s + 1) + "</span>" +
              '<input class="comp-val sub-val" ' + subAttrs(s) +
              ' value="' + escAttr(subs[s]) + '" /></span>';
          }
        }

        var subCtrl =
          'data-seg-index="' + segIdx + '" data-field-index="' + field.index +
          '" data-repeat-index="' + r + '" data-comp-index="' + c + '"';
        var ctrlHtml =
          '<span class="comp-ctrl">' +
          '<button class="icon-btn" title="Add subcomponent" data-action="add-sub" ' +
          subCtrl + ">+</button>" +
          (subs.length > 1
            ? '<button class="icon-btn" title="Remove last subcomponent" data-action="remove-sub" ' +
              subCtrl + ">−</button>"
            : "") +
          "</span>";

        rows +=
          '<div class="comp-row">' +
          '<button type="button" class="copy-path" data-action="copy" ' +
          'data-field="' + field.index + '" data-comp="' + (c + 1) +
          '" data-rep="' + (r + 1) + '" data-copy="' + compCall +
          '" title="Copy ' + compCall + '">.' + (c + 1) +
          ' <span class="copy-ic">⧉</span></button>' +
          nameHtml +
          '<span class="comp-val-wrap">' + valHtml + "</span>" +
          ctrlHtml +
          "</div>";
      }

      if (multiRep) {
        blocks +=
          '<div class="rep-block multi-block' + (r === 0 ? " is-active" : "") +
          '" data-rep-index="' + r + '">' +
          rows +
          "</div>";
      } else {
        blocks +=
          '<div class="rep-block">' +
          '<div class="rep-head">' +
          '<span class="rep-label">Repeat 1</span>' +
          '<span class="rep-actions">' +
          '<button class="icon-btn" title="Add repeat" data-action="add-repeat" ' +
          'data-seg-index="' + segIdx + '" data-field-index="' + field.index + '">+</button>' +
          '<button class="icon-btn" title="Remove this repeat" data-action="remove-repeat" ' +
          'data-seg-index="' + segIdx + '" data-field-index="' + field.index +
          '" data-repeat-index="0">−</button>' +
          "</span></div>" +
          rows +
          "</div>";
      }
    }

    if (!multiRep) return blocks;

    var n = field.repeats.length;
    return (
      '<div class="field-breakdown">' +
      '<div class="rep-nav">' +
      '<button class="icon-btn rep-chev" title="Previous repeat" data-action="rep-prev">▲</button>' +
      '<button class="icon-btn rep-chev" title="Next repeat" data-action="rep-next">▼</button>' +
      '<span class="rep-counter">1 / ' + n + "</span>" +
      '<span class="rep-actions-nav">' +
      '<button class="icon-btn" title="Add repeat" data-action="add-repeat" ' +
      'data-seg-index="' + segIdx + '" data-field-index="' + field.index + '">+</button>' +
      '<button class="icon-btn" title="Remove current repeat" data-action="remove-repeat" ' +
      'data-seg-index="' + segIdx + '" data-field-index="' + field.index + '">−</button>' +
      "</span></div>" +
      '<div class="repeats multi">' + blocks + "</div>" +
      "</div>"
    );
  }

  function cycleRepeat(btn, dir) {
    var wrap = btn.closest(".field-breakdown");
    if (!wrap) return;
    var reps = wrap.querySelector(".repeats");
    var blocks = reps ? reps.children : null;
    if (!blocks || !blocks.length) return;
    var n = blocks.length;
    var cur = 0;
    for (var i = 0; i < n; i++) {
      if (blocks[i].classList.contains("is-active")) {
        cur = i;
        break;
      }
    }
    var next = (cur + dir + n) % n;
    blocks[cur].classList.remove("is-active");
    blocks[next].classList.add("is-active");
    var counter = wrap.querySelector(".rep-counter");
    if (counter) counter.textContent = next + 1 + " / " + n;
    syncFieldCopy(wrap, next + 1);
  }

  // Point the field-level copy snippet at the currently shown repeat.
  function syncFieldCopy(wrap, repNum) {
    var tr = wrap.closest && wrap.closest("tr.field-row");
    if (!tr) return;
    var btn = tr.querySelector(".copy-field");
    if (!btn || btn.getAttribute("data-multi") !== "1") return;
    var call = fieldCopyCall(
      btn.getAttribute("data-seg"),
      btn.getAttribute("data-field-index"),
      repNum,
      true
    );
    btn.setAttribute("data-copy", call);
    btn.setAttribute("title", "Copy " + call);
    var txt = btn.querySelector(".copy-field-txt");
    if (txt) txt.textContent = call;
  }

  function updateBreakdownBadges(segmentCount, fieldCount, unsupportedCount) {
    var segBadge = document.getElementById("badgeSeg");
    var fldBadge = document.getElementById("badgeFld");
    var unsupportedBadge = document.getElementById("badgeUnsupported");
    if (segBadge) {
      segBadge.textContent = segmentCount + " segment" + (segmentCount === 1 ? "" : "s");
    }
    if (fldBadge) {
      fldBadge.textContent = fieldCount + " field" + (fieldCount === 1 ? "" : "s");
    }
    if (unsupportedBadge) {
      unsupportedBadge.hidden = !unsupportedCount;
      if (!unsupportedCount) {
        unsupportedFilterOn = false;
        unsupportedBadge.classList.remove("active");
      }
      unsupportedBadge.textContent = unsupportedCount + " unsupported";
      unsupportedBadge.title =
        unsupportedCount + " field" + (unsupportedCount === 1 ? "" : "s") +
        " not supported in the current HL7 schema";
    }
  }

  function fieldRangeInLine(lineText, fieldIndex, delims) {
    var sep = (delims && delims.field) || "|";
    var seps = [];
    for (var i = 0; i < lineText.length; i++) {
      if (lineText.charAt(i) === sep) seps.push(i);
    }
    if (lineText.slice(0, 3) === "MSH") {
      if (fieldIndex === 1) return { from: 3, to: Math.min(4, lineText.length) };
      if (fieldIndex >= 2) {
        var mshStartSep = seps[fieldIndex - 2];
        if (mshStartSep == null) return null;
        return {
          from: mshStartSep + 1,
          to: seps[fieldIndex - 1] == null ? lineText.length : seps[fieldIndex - 1]
        };
      }
    }
    var startSep = seps[fieldIndex - 1];
    if (startSep == null) return null;
    return {
      from: startSep + 1,
      to: seps[fieldIndex] == null ? lineText.length : seps[fieldIndex]
    };
  }

  function unsupportedEditorRanges(rows) {
    if (!cmView || !rows || !rows.length) return [];
    var doc = cmView.state.doc;
    var lineBySegIndex = {};
    var segIndex = -1;
    for (var lineNo = 1; lineNo <= doc.lines; lineNo++) {
      var line = doc.line(lineNo);
      if (!line.text.trim()) continue;
      segIndex++;
      lineBySegIndex[String(segIndex)] = line;
    }
    var ranges = [];
    rows.forEach(function (row) {
      var line = lineBySegIndex[row.getAttribute("data-seg-index") || ""];
      if (!line) return;
      var fieldIndex = parseInt(row.getAttribute("data-field-index"), 10);
      var local = fieldRangeInLine(line.text, fieldIndex, currentModel.delims);
      if (!local || local.to <= local.from) return;
      ranges.push({ from: line.from + local.from, to: line.from + local.to });
    });
    return ranges;
  }

  function setUnsupportedEditorHighlight(rows) {
    if (!cmView || !CM || !CM.unsupportedFlashEffect) return;
    var ranges = rows && rows.length ? unsupportedEditorRanges(rows) : [];
    cmView.dispatch({ effects: CM.unsupportedFlashEffect.of(ranges) });
  }

  function renderTree(model) {
    var tree = document.getElementById("tree");
    tree.innerHTML = "";
    if (!model || model.segments.length === 0) {
      tree.innerHTML =
        '<p class="muted">Nothing to show yet. Paste an HL7 message to parse it automatically.</p>';
      updateBreakdownBadges(0, 0, 0);
      return;
    }

    var segCount = model.segments.length;
    var fieldCount = 0;
    var unsupportedCount = 0;
    var segmentTotals = {};
    var segmentSeen = {};
    for (var st = 0; st < model.segments.length; st++) {
      var stName = model.segments[st].name;
      segmentTotals[stName] = (segmentTotals[stName] || 0) + 1;
    }

    for (var si = 0; si < model.segments.length; si++) {
      var seg = model.segments[si];
      segmentSeen[seg.name] = (segmentSeen[seg.name] || 0) + 1;
      var segIteration = segmentSeen[seg.name];
      var card = document.createElement("div");
      card.className = "segment-card";
      card.setAttribute("data-seg-index", String(si));

      var head = document.createElement("div");
      head.style.display = "flex";
      head.style.justifyContent = "space-between";
      head.style.alignItems = "center";
      head.style.padding = "12px 14px";
      head.style.fontWeight = "800";
      head.innerHTML =
        '<span class="seg-title" data-seg="' +
        seg.name +
        '">' +
        seg.name +
        (segmentTotals[seg.name] > 1
          ? ' <span class="seg-iter-badge" title="' +
            escAttr(seg.name + " segment " + segIteration + " of " + segmentTotals[seg.name]) +
            '">' +
            segIteration +
            "</span>"
          : "") +
        '</span><span class="path">SEG: ' +
        seg.name +
        "</span>";
      card.appendChild(head);

      var table = document.createElement("table");

      var thead = document.createElement("thead");
      thead.innerHTML =
        "<tr>" +
        '<th style="text-align:left;padding:8px 10px;border-top:1px solid var(--border);border-bottom:1px solid var(--border);">#</th>' +
        '<th style="text-align:left;padding:8px 10px;border-top:1px solid var(--border);border-bottom:1px solid var(--border);">Field Name</th>' +
        '<th style="text-align:left;padding:8px 10px;border-top:1px solid var(--border);border-bottom:1px solid var(--border);">Raw Value</th>' +
        '<th style="text-align:left;padding:8px 10px;border-top:1px solid var(--border);border-bottom:1px solid var(--border);">Breakdown</th>' +
        "</tr>";
      table.appendChild(thead);

      var tbody = document.createElement("tbody");

      for (var fi = 0; fi < seg.fields.length; fi++) {
        var field = seg.fields[fi];
        var nm = fieldName(seg.name, field.index) || "";
        var unsupported = !nm.trim();
        fieldCount++;
        if (unsupported) unsupportedCount++;
        var tr = document.createElement("tr");
        tr.className = "field-row" + (unsupported ? " schema-unsupported" : "");
        tr.setAttribute("data-seg", seg.name);
        tr.setAttribute("data-seg-index", String(si));
        tr.setAttribute("data-field-index", String(field.index));
        tr.setAttribute(
          "data-field-name",
          nm.toLowerCase()
        );
        tr.setAttribute("data-raw", (field.raw || "").toLowerCase());
        tr.innerHTML =
          "" +
          '<td style="vertical-align:top;padding:8px 10px;white-space:nowrap;">' +
          field.index +
          "</td>" +
          '<td style="vertical-align:top;padding:8px 10px;">' +
          (function () {
            if (unsupported) {
              return (
                '<span class="field-name schema-unsupported-name">' +
                escText(seg.name + "-" + field.index) +
                '</span><span class="schema-note">Not supported in current schema</span>'
              );
            }
            var desc = fieldDesc(seg.name, field.index);
            if (!desc) return escText(nm);
            return (
              '<span class="field-name">' +
              escText(nm) +
              ' <button type="button" class="desc-ic" data-action="info" ' +
              'data-desc="' + escAttr(desc) +
              '" data-title="' + escAttr(seg.name + "-" + field.index + "  " + nm) +
              '" title="Show details" aria-label="Show field details">ⓘ</button></span>'
            );
          })() +
          "</td>" +
          '<td style="vertical-align:top;padding:8px 10px;max-width:420px;word-break:break-word;">' +
          '<input class="editable-raw" ' +
          'data-role="raw" ' +
          'data-seg-index="' +
          si +
          '" ' +
          'data-field-index="' +
          field.index +
          '" ' +
          'value="' +
          (field.raw == null
            ? ""
            : String(field.raw).replace(/"/g, "&quot;")) +
          '" />' +
          (function () {
            var multi = field.repeats.length > 1;
            var call = fieldCopyCall(seg.name, field.index, 1, multi).replace(/"/g, "&quot;");
            return (
              '<div class="field-copy-wrap">' +
              '<button type="button" class="copy-field" data-action="copy" ' +
              'data-seg="' + seg.name + '" data-field-index="' + field.index +
              '" data-multi="' + (multi ? "1" : "0") +
              '" data-copy="' + call +
              '" title="Copy ' + call +
              '"><span class="copy-ic">⧉</span> <span class="copy-field-txt">' +
              call +
              "</span></button>" +
              "</div>"
            );
          })() +
          "</td>" +
          '<td style="vertical-align:top;padding:8px 10px;">' +
          renderBreakdown(field, si, seg.name) +
          "</td>";
        tbody.appendChild(tr);
      }

      table.appendChild(tbody);
      card.appendChild(table);
      tree.appendChild(card);
    }

    updateBreakdownBadges(segCount, fieldCount, unsupportedCount);

    wireEditingHandlers();
    applySearchFilter();
  }

  // Highlight + scroll the breakdown card matching editor cursor line
  function scrollRightPaneToSegment(card) {
    var rightPanel = document.querySelector(".right");
    if (!rightPanel || !card) return;

    var paneRect = rightPanel.getBoundingClientRect();
    var cardRect = card.getBoundingClientRect();
    var top = rightPanel.scrollTop + (cardRect.top - paneRect.top);

    rightPanel.scrollTo({
      top: Math.max(0, top - 8),
      behavior: "smooth"
    });
  }

  function highlightSegment(segIdx) {
    var tree = document.getElementById("tree");
    if (!tree) return;
    var cards = tree.getElementsByClassName("segment-card");
    for (var i = 0; i < cards.length; i++) {
      var on = String(i) === String(segIdx);
      cards[i].classList.toggle("active", on);
      if (on && cards[i].style.display !== "none") {
        scrollRightPaneToSegment(cards[i]);
      }
    }
  }

  function segIndexForLine(state, lineNo) {
    var idx = -1;
    for (var i = 1; i <= lineNo; i++) {
      if (state.doc.line(i).text.trim()) idx++;
    }
    return idx;
  }

  function segIndexForText(text, lineNo) {
    var idx = -1;
    var lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
    for (var i = 0; i < Math.min(lineNo, lines.length); i++) {
      if (lines[i].trim()) idx++;
    }
    return idx;
  }

  // ================= Actions & events =================
  function serializeAndRefresh() {
    var txt = serializeHL7(currentModel);
    setEditorText(txt);
    renderTree(currentModel);
  }

  function parseNow() {
    try {
      var txt = getEditorText().trim();
      currentModel = parseHL7(txt);
      renderTree(currentModel);
    } catch (err) {
      var tree = document.getElementById("tree");
      tree.innerHTML =
        '<p class="danger">Parse error: ' +
        (err && err.message ? err.message : String(err)) +
        "</p>";
    }
  }

  // Detect "SEG.F[.C[.S]]" path queries (dot or colon, optional repeat (n))
  function parsePathQuery(raw) {
    var m = String(raw)
      .trim()
      .match(/^([A-Za-z][A-Za-z0-9]{2})[.:](\d+)(?:\((\d+)\))?(?:[.:](\d+))?(?:[.:]\d+)?$/);
    if (!m) return null;
    return {
      seg: m[1].toLowerCase(),
      field: m[2],
      rep: m[3] || null,
      comp: m[4] || null
    };
  }

  function clearPathHits(tree) {
    var hits = tree.querySelectorAll(".path-hit");
    for (var i = 0; i < hits.length; i++) hits[i].classList.remove("path-hit");
  }

  function applyPathFilter(p) {
    var tree = document.getElementById("tree");
    if (!tree) return;
    unsupportedFilterOn = false;
    setUnsupportedEditorHighlight([]);
    var unsupportedBadge = document.getElementById("badgeUnsupported");
    if (unsupportedBadge) unsupportedBadge.classList.remove("active");
    clearPathHits(tree);

    var cards = Array.prototype.slice.call(
      tree.getElementsByClassName("segment-card")
    );
    var visibleFields = 0;
    var visibleSegments = 0;
    var visibleUnsupported = 0;
    var scrollTarget = null;

    cards.forEach(function (card) {
      var rows = Array.prototype.slice.call(card.querySelectorAll("tr.field-row"));
      var anyVisible = false;
      rows.forEach(function (tr) {
        var seg = (tr.getAttribute("data-seg") || "").toLowerCase();
        var idx = tr.getAttribute("data-field-index") || "";
        var ok = seg === p.seg && idx === p.field;
        tr.style.display = ok ? "" : "none";
        if (ok) {
          visibleFields++;
          if (tr.classList.contains("schema-unsupported")) visibleUnsupported++;
          anyVisible = true;
          tr.classList.add("path-hit");
          scrollTarget = scrollTarget || tr;
          if (p.comp) {
            var sel = '.copy-path[data-field="' + p.field + '"][data-comp="' + p.comp + '"]';
            if (p.rep) sel += '[data-rep="' + p.rep + '"]';
            var btns = tr.querySelectorAll(sel);
            for (var b = 0; b < btns.length; b++) {
              btns[b].classList.add("path-hit");
              scrollTarget = btns[b];
              // If inside a repeat carousel, reveal the matching repeat
              var blk = btns[b].closest(".repeats.multi > .rep-block");
              if (blk) {
                var fb = btns[b].closest(".field-breakdown");
                var sib = fb.querySelectorAll(".repeats.multi > .rep-block");
                for (var k = 0; k < sib.length; k++) sib[k].classList.remove("is-active");
                blk.classList.add("is-active");
                var repNum = +blk.getAttribute("data-rep-index") + 1;
                var cnt = fb.querySelector(".rep-counter");
                if (cnt) cnt.textContent = repNum + " / " + sib.length;
                syncFieldCopy(fb, repNum);
              }
            }
          }
        }
      });
      card.style.display = anyVisible ? "" : "none";
      if (anyVisible) visibleSegments++;
    });

    updateBreakdownBadges(visibleSegments, visibleFields, visibleUnsupported);

    if (scrollTarget)
      scrollTarget.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function applyUnsupportedFilter(shouldFlash) {
    var tree = document.getElementById("tree");
    if (!tree) return;
    clearPathHits(tree);

    var cards = Array.prototype.slice.call(
      tree.getElementsByClassName("segment-card")
    );
    var visibleFields = 0;
    var visibleSegments = 0;
    var unsupportedRows = [];

    cards.forEach(function (card) {
      var rows = Array.prototype.slice.call(card.querySelectorAll("tr.field-row"));
      var anyVisible = false;
      rows.forEach(function (tr) {
        var ok = tr.classList.contains("schema-unsupported");
        tr.style.display = ok ? "" : "none";
        tr.classList.toggle("path-hit", ok);
        if (ok) {
          visibleFields++;
          anyVisible = true;
          unsupportedRows.push(tr);
        }
      });
      card.style.display = anyVisible ? "" : "none";
      if (anyVisible) visibleSegments++;
    });

    updateBreakdownBadges(visibleSegments, visibleFields, visibleFields);
    if (unsupportedRows.length) {
      unsupportedRows[0].scrollIntoView({ block: "center", behavior: "smooth" });
    }
    if (shouldFlash || unsupportedFilterOn) setUnsupportedEditorHighlight(unsupportedRows);
  }

  function applySearchFilter() {
    var input = document.getElementById("fldSearch");
    var rawVal = input ? input.value : "";

    var tree = document.getElementById("tree");
    if (!tree) return;
    if (unsupportedFilterOn) {
      applyUnsupportedFilter(false);
      return;
    }
    setUnsupportedEditorHighlight([]);

    var pathQ = parsePathQuery(rawVal);
    if (pathQ) {
      applyPathFilter(pathQ);
      return;
    }
    clearPathHits(tree);

    var q = rawVal.toLowerCase();

    var cards = Array.prototype.slice.call(
      tree.getElementsByClassName("segment-card")
    );

    var visibleFields = 0;
    var visibleSegments = 0;
    var visibleUnsupported = 0;

    cards.forEach(function (card) {
      var rows = Array.prototype.slice.call(
        card.querySelectorAll("tr.field-row")
      );
      var anyVisible = false;
      rows.forEach(function (tr) {
        var seg = (tr.getAttribute("data-seg") || "").toLowerCase();
        var idx = (tr.getAttribute("data-field-index") || "").toLowerCase();
        var name = (tr.getAttribute("data-field-name") || "").toLowerCase();
        var raw = (tr.getAttribute("data-raw") || "").toLowerCase();

        var breakdownCell = tr.cells[3];
        var breakdownText = breakdownCell
          ? breakdownCell.textContent.toLowerCase()
          : "";

        var ok =
          seg.includes(q) ||
          idx.includes(q) ||
          name.includes(q) ||
          raw.includes(q) ||
          breakdownText.includes(q);

        tr.style.display = ok ? "" : "none";
        if (ok) {
          visibleFields++;
          if (tr.classList.contains("schema-unsupported")) visibleUnsupported++;
        }
        anyVisible = anyVisible || ok;
      });
      card.style.display = anyVisible ? "" : "none";
      if (anyVisible) visibleSegments++;
    });

    updateBreakdownBadges(visibleSegments, visibleFields, visibleUnsupported);
  }

  function wireEditingHandlers() {
    var tree = document.getElementById("tree");
    if (!tree) return;

    tree.addEventListener("input", function (e) {
      var t = e.target;
      var role = t.getAttribute("data-role");
      if (!role || role !== "raw") return;

      var si = +t.getAttribute("data-seg-index");
      var fi = +t.getAttribute("data-field-index");
      var seg = currentModel.segments[si];
      var field = seg.fields.find(function (f) {
        return f.index === fi;
      });
      if (!field) return;
      field.raw = t.value;
      var updated = parseField(t.value, fi, currentModel.delims);
      field.repeats = updated.repeats;

      if (seg.name === "MSH" && (fi === 1 || fi === 2)) {
        serializeAndRefresh();
        return;
      }
      setEditorText(serializeHL7(currentModel));
      applySearchFilter();
    });

    tree.addEventListener("change", function (e) {
      var t = e.target;
      var role = t.getAttribute("data-role");
      if (role === "sub") {
        var si2 = +t.getAttribute("data-seg-index");
        var fi2 = +t.getAttribute("data-field-index");
        var ri2 = +t.getAttribute("data-repeat-index");
        var ci2 = +t.getAttribute("data-comp-index");
        var siSub = +t.getAttribute("data-sub-index");

        var seg2 = currentModel.segments[si2];
        var field2 = seg2.fields.find(function (f) {
          return f.index === fi2;
        });
        if (!field2) return;
        var rep = field2.repeats[ri2];
        if (!rep) return;
        var comp = rep.components[ci2];
        if (!comp) return;

        comp.subs[siSub] = t.value;

        field2.raw = fieldToRaw(field2, currentModel.delims);
        setEditorText(serializeHL7(currentModel));
        applySearchFilter();
      }
    });

    tree.addEventListener("keydown", function (e) {
      var t = e.target;
      if (e.key === "Enter" && t && t.getAttribute("data-role") === "sub") {
        t.blur();
      }
    });

    tree.addEventListener("click", function (e) {
      var btn = e.target.closest("button");
      if (!btn) return;
      var action = btn.getAttribute("data-action");
      if (!action) return;

      if (action === "copy") {
        copyText(btn.getAttribute("data-copy"));
        return;
      }

      if (action === "rep-prev" || action === "rep-next") {
        cycleRepeat(btn, action === "rep-next" ? 1 : -1);
        return;
      }

      if (action === "info") {
        showInfo(btn);
        return;
      }

      var si = +btn.getAttribute("data-seg-index");
      var fi = +btn.getAttribute("data-field-index");
      var seg = currentModel.segments[si];
      var field = seg.fields.find(function (f) {
        return f.index === fi;
      });
      if (!field) return;

      if (action === "add-sub" || action === "remove-sub") {
        var ri = +btn.getAttribute("data-repeat-index");
        var ci = +btn.getAttribute("data-comp-index");
        var rep = field.repeats[ri];
        if (!rep) return;
        var comp = rep.components[ci];
        if (!comp) return;
        if (action === "add-sub") {
          comp.subs.push("");
        } else if (action === "remove-sub" && comp.subs.length > 0) {
          comp.subs.pop();
        }
        field.raw = fieldToRaw(field, currentModel.delims);
        serializeAndRefresh();
      } else if (action === "add-repeat") {
        var template = field.repeats[0] || { components: [{ subs: [""] }] };
        var newRepeat = {
          components: template.components.map(function (cmp) {
            return { subs: cmp.subs.map(function () { return ""; }) };
          })
        };
        field.repeats.push(newRepeat);
        field.raw = fieldToRaw(field, currentModel.delims);
        serializeAndRefresh();
      } else if (action === "remove-repeat") {
        var riRemove;
        if (btn.hasAttribute("data-repeat-index")) {
          riRemove = +btn.getAttribute("data-repeat-index");
        } else {
          // Nav remove: target the currently shown repeat
          var fb = btn.closest(".field-breakdown");
          var active = fb && fb.querySelector(".rep-block.is-active");
          riRemove = active ? +active.getAttribute("data-rep-index") : 0;
        }
        if (field.repeats.length > 0) {
          field.repeats.splice(riRemove, 1);
          field.raw = fieldToRaw(field, currentModel.delims);
          serializeAndRefresh();
        }
      }
    });
  }

  // ================= Font size control =================
  var FONT_MIN = 9;
  var FONT_MAX = 28;
  var fontSize = 13;
  try {
    var savedFs = parseInt(localStorage.getItem("hl7_font_size"), 10);
    if (savedFs >= FONT_MIN && savedFs <= FONT_MAX) fontSize = savedFs;
  } catch (_) {}

  function applyFontSize() {
    document.documentElement.style.setProperty("--cm-font-size", fontSize + "px");
    var label = document.getElementById("fontSizeLabel");
    if (label) label.textContent = fontSize + "px";
    try {
      localStorage.setItem("hl7_font_size", String(fontSize));
    } catch (_) {}
    if (cmView) cmView.requestMeasure();
  }

  function reloadStoredFontSize() {
    try {
      var savedFs = parseInt(localStorage.getItem("hl7_font_size"), 10);
      if (savedFs >= FONT_MIN && savedFs <= FONT_MAX) fontSize = savedFs;
    } catch (_) {}
    applyFontSize();
  }

  function changeFontSize(delta) {
    fontSize = Math.max(FONT_MIN, Math.min(FONT_MAX, fontSize + delta));
    applyFontSize();
  }

  // ================= Anonymisation settings =================
  function listToTextarea(values) {
    return (values || []).join("\n");
  }

  function textareaToList(id) {
    var el = document.getElementById(id);
    return el ? el.value.split(/\r?\n|,/).map(function (v) { return v.trim(); }).filter(Boolean) : [];
  }

  function setAnonNumber(id, value) {
    var el = document.getElementById(id);
    if (el) el.value = String(value);
  }

  function getAnonNumber(id, fallback) {
    var el = document.getElementById(id);
    return el ? Number(el.value || fallback) : fallback;
  }

  function populateAnonSettingsForm(config) {
    var c = normalizeAnonConfig(config || loadAnonConfig());
    var mode = document.getElementById("anonSpecialMode");
    if (mode) mode.value = c.specialMode || "standard";
    var boxes = document.querySelectorAll("[data-anon-field]");
    for (var i = 0; i < boxes.length; i++) {
      var id = boxes[i].getAttribute("data-anon-field");
      boxes[i].checked = !!c.fields[id];
    }
    setAnonNumber("anonDobMin", c.ranges.dobMinYear);
    setAnonNumber("anonDobMax", c.ranges.dobMaxYear);
    setAnonNumber("anonDeathMin", c.ranges.deathMinYear);
    setAnonNumber("anonDeathMax", c.ranges.deathMaxYear);
    setAnonNumber("anonSetIdMin", c.ranges.setIdMin);
    setAnonNumber("anonSetIdMax", c.ranges.setIdMax);
    var simple = [
      ["anonPasDigits", c.ranges.pasDigits],
      ["anonMrnDigits", c.ranges.mrnDigits],
      ["anonAccountPrefix", c.ranges.accountPrefix],
      ["anonAccountDigits", c.ranges.accountDigits],
      ["anonGivenNames", listToTextarea(c.lists.givenNames)],
      ["anonFamilyNames", listToTextarea(c.lists.familyNames)],
      ["anonStreetNames", listToTextarea(c.lists.streetNames)],
      ["anonAddressLines", listToTextarea(c.lists.addressLines)],
      ["anonCities", listToTextarea(c.lists.cities)],
      ["anonCounties", listToTextarea(c.lists.counties)],
      ["anonPostcodeAreas", listToTextarea(c.lists.postcodeAreas)],
      ["anonLandlineCodes", listToTextarea(c.lists.landlineCodes)]
    ];
    simple.forEach(function (pair) {
      var el = document.getElementById(pair[0]);
      if (el) el.value = pair[1];
    });
  }

  function readAnonSettingsForm() {
    var fields = {};
    var boxes = document.querySelectorAll("[data-anon-field]");
    for (var i = 0; i < boxes.length; i++) {
      fields[boxes[i].getAttribute("data-anon-field")] = boxes[i].checked;
    }
    return normalizeAnonConfig({
      specialMode: (document.getElementById("anonSpecialMode") || {}).value || "standard",
      fields: fields,
      ranges: {
        dobMinYear: getAnonNumber("anonDobMin", 1928),
        dobMaxYear: getAnonNumber("anonDobMax", 2024),
        deathMinYear: getAnonNumber("anonDeathMin", 2020),
        deathMaxYear: getAnonNumber("anonDeathMax", 2026),
        setIdMin: getAnonNumber("anonSetIdMin", 1),
        setIdMax: getAnonNumber("anonSetIdMax", 9999),
        pasDigits: getAnonNumber("anonPasDigits", 8),
        mrnDigits: getAnonNumber("anonMrnDigits", 8),
        accountPrefix: (document.getElementById("anonAccountPrefix") || {}).value,
        accountDigits: getAnonNumber("anonAccountDigits", 9)
      },
      lists: {
        givenNames: textareaToList("anonGivenNames"),
        familyNames: textareaToList("anonFamilyNames"),
        streetNames: textareaToList("anonStreetNames"),
        addressLines: textareaToList("anonAddressLines"),
        cities: textareaToList("anonCities"),
        counties: textareaToList("anonCounties"),
        postcodeAreas: textareaToList("anonPostcodeAreas"),
        landlineCodes: textareaToList("anonLandlineCodes")
      }
    });
  }

  function bindAnonSettingsUI() {
    var overlay = document.getElementById("anonSettingsOverlay");
    var btnOpen = document.getElementById("btnAnonSettings");
    var btnClose = document.getElementById("anonSettingsClose");
    var btnSave = document.getElementById("anonSettingsSave");
    var btnReset = document.getElementById("anonSettingsReset");
    if (!overlay || !btnOpen) return;

    function open() {
      populateAnonSettingsForm(loadAnonConfig());
      overlay.hidden = false;
    }
    function close() {
      overlay.hidden = true;
    }

    btnOpen.addEventListener("click", open);
    if (btnClose) btnClose.addEventListener("click", close);
    if (btnSave) {
      btnSave.addEventListener("click", function () {
        saveAnonConfig(readAnonSettingsForm());
        close();
        showCopied("Anonymisation settings saved");
      });
    }
    if (btnReset) {
      btnReset.addEventListener("click", function () {
        populateAnonSettingsForm(resetAnonConfig());
        showCopied("Anonymisation settings reset");
      });
    }
    overlay.addEventListener("mousedown", function (e) {
      if (e.target === overlay) close();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !overlay.hidden) close();
    });
  }

  // ================= Settings =================
  var SETTINGS_KEY = "hl7_settings";
  var LAST_STATE_SAVE_KEY = "hl7_state_last_saved";
  var SETTINGS_DEFAULTS = {
    stripeOn: true,
    stripeLight: "#eef1f6",
    stripeDark: "#1b2433",
    pageGutter: 8,
    uiStyle: "default",
    uiDensity: "default",
    smoothScroll: true,
    motionEffects: true,
    hintMode: "float"
  };
  var settings = loadSettings();

  function loadSettings() {
    var s = {};
    try {
      s = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    } catch (_) {}
    var out = {};
    for (var k in SETTINGS_DEFAULTS) {
      out[k] = k in s ? s[k] : SETTINGS_DEFAULTS[k];
    }
    if ((out.uiStyle === "compact" || out.uiStyle === "spacious") && !("uiDensity" in s)) {
      out.uiDensity = out.uiStyle;
      out.uiStyle = "default";
    }
    return out;
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (_) {}
  }

  function readStorageJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || "null") || fallback;
    } catch (_) {
      return fallback;
    }
  }

  function exportAppState() {
    return {
      app: "HL7 Message Explorer",
      version: APP_STATE_EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      settings: loadSettings(),
      anonymisation: loadAnonConfig(),
      send: loadSendSettings(),
      customSamples: loadCustomSamples(),
      currentMessage: getEditorText() || loadStoredMessage(),
      originalPidMessage: loadOriginalPidMessage(),
      mobileView: loadMobileView(),
      selectedSample: loadSelectedSampleKey(),
      selectedVersion: loadSelectedVersion(),
      theme: localStorage.getItem("hl7_theme") || "light",
      fontSize: localStorage.getItem("hl7_font_size") || ""
    };
  }

  function downloadAppState() {
    var state = exportAppState();
    var blob = new Blob([JSON.stringify(state, null, 2)], {
      type: "application/json"
    });
    var a = document.createElement("a");
    var stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    a.href = URL.createObjectURL(blob);
    a.download = "hl7-viewer-state-" + stamp + ".json";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      document.body.removeChild(a);
    }, 0);
    try {
      localStorage.setItem(LAST_STATE_SAVE_KEY, state.exportedAt);
    } catch (_) {}
  }

  function loadLastStateSaveTime() {
    try {
      return localStorage.getItem(LAST_STATE_SAVE_KEY) || "";
    } catch (_) {
      return "";
    }
  }

  function formatSavedDateTime(value) {
    if (!value) return "";
    var d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function importAppState(state) {
    if (!state || typeof state !== "object") throw new Error("Invalid state file.");
    settings = normalizeSettingsObject(state.settings || readStorageJson(SETTINGS_KEY, SETTINGS_DEFAULTS));
    saveSettings();
    saveAnonConfig(state.anonymisation || state.anonymization || loadAnonConfig());
    saveSendSettings(state.send || {});
    saveCustomSamples(state.customSamples || {});
    saveStoredMessage(state.currentMessage || "");
    if (state.originalPidMessage) saveOriginalPidMessage(state.originalPidMessage);
    else clearOriginalPidMessage();
    saveMobileView(state.mobileView || "input");
    saveSelectedSampleKey(state.selectedSample || "");
    saveSelectedVersion(state.selectedVersion || "");
    try {
      if (state.theme) localStorage.setItem("hl7_theme", state.theme === "dark" ? "dark" : "light");
      if (state.fontSize) localStorage.setItem("hl7_font_size", String(state.fontSize));
      if (state.exportedAt) localStorage.setItem(LAST_STATE_SAVE_KEY, state.exportedAt);
    } catch (_) {}
  }

  function normalizeSettingsObject(source) {
    var s = source && typeof source === "object" ? source : {};
    var out = {};
    for (var k in SETTINGS_DEFAULTS) {
      out[k] = k in s ? s[k] : SETTINGS_DEFAULTS[k];
    }
    if ((out.uiStyle === "compact" || out.uiStyle === "spacious") && !("uiDensity" in s)) {
      out.uiDensity = out.uiStyle;
      out.uiStyle = "default";
    }
    return out;
  }

  // Applies the alternating-row colour for the current theme.
  function applyStripe() {
    var col = document.body.classList.contains("dark")
      ? settings.stripeDark
      : settings.stripeLight;
    document.documentElement.style.setProperty(
      "--stripe",
      settings.stripeOn ? col : "transparent"
    );
  }

  function applyLayoutSettings() {
    var gutter = Math.max(0, Math.min(48, parseInt(settings.pageGutter, 10) || 0));
    document.documentElement.style.setProperty("--page-gutter", gutter + "px");
  }

  function applyUiStyle() {
    var style = settings.uiStyle || "default";
    var styles = ["clinical", "clinical-blue", "paper", "lab-light", "console"];
    styles.forEach(function (name) {
      document.body.classList.remove("ui-style-" + name);
    });
    if (styles.indexOf(style) >= 0) {
      document.body.classList.add("ui-style-" + style);
    }
    applyStripe();
  }

  function applyUiDensity() {
    var density = settings.uiDensity || "default";
    document.body.classList.remove("ui-density-compact", "ui-density-spacious");
    if (density === "compact" || density === "spacious") {
      document.body.classList.add("ui-density-" + density);
    }
  }

  function applyMotionSettings() {
    document.documentElement.classList.toggle("reduced-motion", settings.motionEffects === false);
  }

  function setupSettings() {
    var overlay = document.getElementById("settingsOverlay");
    var btnOpen = document.getElementById("btnSettings");
    var btnClose = document.getElementById("settingsClose");
    var btnDone = document.getElementById("settingsDone");
    var btnReset = document.getElementById("settingsReset");
    var inOn = document.getElementById("setStripeOn");
    var inLight = document.getElementById("setStripeLight");
    var inDark = document.getElementById("setStripeDark");
    var inGutter = document.getElementById("setPageGutter");
    var outGutter = document.getElementById("setPageGutterValue");
    var inStyle = document.getElementById("setUiStyle");
    var inDensity = document.getElementById("setUiDensity");
    var inSmooth = document.getElementById("setSmoothScroll");
    var inMotion = document.getElementById("setMotionEffects");
    var inHint = document.getElementById("setHintMode");
    var btnExportState = document.getElementById("settingsExportState");
    var btnImportState = document.getElementById("settingsImportState");
    var importFile = document.getElementById("settingsImportFile");
    var lastSaved = document.getElementById("settingsLastSaved");
    var stateStatus = document.getElementById("settingsStateStatus");
    if (!overlay || !btnOpen) return;

    function setStateStatus(text, cls) {
      if (!stateStatus) return;
      stateStatus.textContent = text || "";
      stateStatus.className = "settings-state-status" + (cls ? " " + cls : "");
    }

    function syncLastSaved() {
      if (!lastSaved) return;
      var formatted = formatSavedDateTime(loadLastStateSaveTime());
      lastSaved.hidden = !formatted;
      lastSaved.textContent = formatted ? "Last saved: " + formatted : "";
    }

    function syncInputs() {
      inOn.checked = settings.stripeOn !== false;
      inLight.value = settings.stripeLight;
      inDark.value = settings.stripeDark;
      if (inGutter) inGutter.value = String(settings.pageGutter);
      if (outGutter) outGutter.textContent = settings.pageGutter + "px";
      if (inStyle) inStyle.value = settings.uiStyle || "default";
      if (inDensity) inDensity.value = settings.uiDensity || "default";
      if (inSmooth) inSmooth.checked = settings.smoothScroll !== false;
      if (inMotion) inMotion.checked = settings.motionEffects !== false;
      if (inHint) inHint.value = settings.hintMode || "float";
      syncLastSaved();
    }
    function open() {
      syncInputs();
      setStateStatus("", "");
      overlay.hidden = false;
    }
    function close() {
      overlay.hidden = true;
    }

    btnOpen.addEventListener("click", open);
    btnClose.addEventListener("click", close);
    btnDone.addEventListener("click", close);
    overlay.addEventListener("mousedown", function (e) {
      if (e.target === overlay) close();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !overlay.hidden) close();
    });

    inOn.addEventListener("change", function () {
      settings.stripeOn = inOn.checked;
      saveSettings();
      applyStripe();
    });
    if (inSmooth) {
      inSmooth.addEventListener("change", function () {
        settings.smoothScroll = inSmooth.checked;
        saveSettings();
      });
    }
    if (inMotion) {
      inMotion.addEventListener("change", function () {
        settings.motionEffects = inMotion.checked;
        saveSettings();
        applyMotionSettings();
      });
    }
    if (inHint) {
      inHint.addEventListener("change", function () {
        settings.hintMode = inHint.value;
        saveSettings();
      });
    }
    inLight.addEventListener("input", function () {
      settings.stripeLight = inLight.value;
      saveSettings();
      applyStripe();
    });
    inDark.addEventListener("input", function () {
      settings.stripeDark = inDark.value;
      saveSettings();
      applyStripe();
    });
    if (inGutter) {
      inGutter.addEventListener("input", function () {
        settings.pageGutter = parseInt(inGutter.value, 10) || 0;
        if (outGutter) outGutter.textContent = settings.pageGutter + "px";
        saveSettings();
        applyLayoutSettings();
      });
    }
    if (inStyle) {
      inStyle.addEventListener("change", function () {
        settings.uiStyle = inStyle.value || "default";
        saveSettings();
        applyUiStyle();
      });
    }
    if (inDensity) {
      inDensity.addEventListener("change", function () {
        settings.uiDensity = inDensity.value || "default";
        saveSettings();
        applyUiDensity();
      });
    }
    btnReset.addEventListener("click", function () {
      settings = JSON.parse(JSON.stringify(SETTINGS_DEFAULTS));
      saveSettings();
      syncInputs();
      applyStripe();
      applyLayoutSettings();
      applyUiStyle();
      applyUiDensity();
      applyMotionSettings();
    });
    if (btnExportState) {
      btnExportState.addEventListener("click", function () {
        downloadAppState();
        syncLastSaved();
        setStateStatus("State saved to a JSON file.", "ok");
      });
    }
    if (btnImportState && importFile) {
      btnImportState.addEventListener("click", function () {
        importFile.value = "";
        importFile.click();
      });
      importFile.addEventListener("change", function () {
        var file = importFile.files && importFile.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          try {
            importAppState(JSON.parse(String(reader.result || "{}")));
            syncInputs();
            applyStripe();
            applyLayoutSettings();
            applyUiStyle();
            applyUiDensity();
            applyMotionSettings();
            reloadStoredFontSize();
            setEditorText(loadStoredMessage());
            parseNow();
            window.dispatchEvent(new CustomEvent("hl7-theme-changed"));
            window.dispatchEvent(new CustomEvent("hl7-custom-samples-changed"));
            syncLastSaved();
            setStateStatus("State loaded.", "ok");
            showCopied("State loaded");
          } catch (err) {
            setStateStatus(err && err.message ? err.message : "Could not load state file.", "err");
          }
        };
        reader.readAsText(file);
      });
    }
  }

  // ================= HTTP sender =================
  var SEND_SETTINGS_KEY = "hl7_http_send";

  function loadSendSettings() {
    try {
      return JSON.parse(localStorage.getItem(SEND_SETTINGS_KEY)) || {};
    } catch (_) {
      return {};
    }
  }

  function saveSendSettings(values) {
    try {
      localStorage.setItem(SEND_SETTINGS_KEY, JSON.stringify(values));
    } catch (_) {}
  }

  function setupHttpSender() {
    var overlay = document.getElementById("sendOverlay");
    var btnOpen = document.getElementById("btnSendHttp");
    var btnClose = document.getElementById("sendClose");
    var btnCancel = document.getElementById("sendCancel");
    var btnSend = document.getElementById("sendNow");
    var inUrl = document.getElementById("sendUrl");
    var inType = document.getElementById("sendContentType");
    var inTimeout = document.getElementById("sendTimeout");
    var status = document.getElementById("sendStatus");
    var response = document.getElementById("sendResponse");
    if (!overlay || !btnOpen || !btnSend || !inUrl || !inType || !inTimeout) return;

    function setStatus(text, cls) {
      status.textContent = text || "";
      status.className = "send-status" + (cls ? " " + cls : "");
    }

    function setResponse(text) {
      if (!text) {
        response.hidden = true;
        response.textContent = "";
        return;
      }
      response.hidden = false;
      response.textContent = text;
    }

    function syncInputs() {
      var saved = loadSendSettings();
      inUrl.value = saved.url || "";
      inType.value = saved.contentType || "text/plain";
      inTimeout.value = saved.timeoutSeconds || "15";
      setStatus("", "");
      setResponse("");
    }

    function close() {
      overlay.hidden = true;
    }

    btnOpen.addEventListener("click", function () {
      syncInputs();
      overlay.hidden = false;
      inUrl.focus();
    });
    btnClose.addEventListener("click", close);
    btnCancel.addEventListener("click", close);
    overlay.addEventListener("mousedown", function (e) {
      if (e.target === overlay) close();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !overlay.hidden) close();
    });

    btnSend.addEventListener("click", async function () {
      var url = inUrl.value.trim();
      var body = getEditorText();
      var timeoutSeconds = Math.max(1, Math.min(120, parseInt(inTimeout.value, 10) || 15));

      setResponse("");
      if (!url) {
        setStatus("Enter a Mirth HTTP Listener URL.", "err");
        return;
      }
      if (!/^https?:\/\//i.test(url)) {
        setStatus("URL must start with http:// or https://.", "err");
        return;
      }
      if (!body.trim()) {
        setStatus("There is no HL7 message to send.", "err");
        return;
      }

      saveSendSettings({
        url: url,
        contentType: inType.value,
        timeoutSeconds: String(timeoutSeconds)
      });

      var controller = new AbortController();
      var timer = setTimeout(function () {
        controller.abort();
      }, timeoutSeconds * 1000);

      btnSend.disabled = true;
      setStatus("Sending...", "");
      try {
        var res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": inType.value
          },
          body: body,
          signal: controller.signal
        });
        var text = await res.text();
        setStatus("HTTP " + res.status + " " + (res.statusText || ""), res.ok ? "ok" : "err");
        setResponse(text.slice(0, 4000));
      } catch (err) {
        var msg =
          err && err.name === "AbortError"
            ? "Request timed out."
            : "Send failed. Check the URL, listener status, and CORS settings.";
        setStatus(msg, "err");
        setResponse(err && err.message ? err.message : String(err));
      } finally {
        clearTimeout(timer);
        btnSend.disabled = false;
      }
    });
  }

  // ================= Draggable splitter =================
  function setupGutter() {
    var grid = document.querySelector(".grid");
    var gutter = document.getElementById("gutter");
    if (!grid || !gutter) return;

    var GUTTER_W = 10;
    var MIN = 220; // min px per pane
    var dragging = false;
    var splitRatio = 2 / 5;

    function applySplitRatio() {
      grid.style.gridTemplateColumns =
        "minmax(" +
        MIN +
        "px, " +
        splitRatio +
        "fr) " +
        GUTTER_W +
        "px minmax(" +
        MIN +
        "px, " +
        (1 - splitRatio) +
        "fr)";
    }

    function onMove(e) {
      if (!dragging) return;
      var clientX = e.touches ? e.touches[0].clientX : e.clientX;
      var rect = grid.getBoundingClientRect();
      var available = Math.max(1, rect.width - GUTTER_W);
      var left = clientX - rect.left - GUTTER_W / 2;
      var max = available - MIN;
      left = Math.max(MIN, Math.min(left, max));
      splitRatio = Math.max(0.15, Math.min(0.85, left / available));
      applySplitRatio();
      if (e.cancelable) e.preventDefault();
    }

    function onUp() {
      if (!dragging) return;
      dragging = false;
      gutter.classList.remove("dragging");
      document.body.classList.remove("dragging-col");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onUp);
    }

    function onDown(e) {
      dragging = true;
      gutter.classList.add("dragging");
      document.body.classList.add("dragging-col");
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      document.addEventListener("touchmove", onMove, { passive: false });
      document.addEventListener("touchend", onUp);
      if (e.cancelable) e.preventDefault();
    }

    gutter.addEventListener("mousedown", onDown);
    gutter.addEventListener("touchstart", onDown, { passive: false });

    // Double-click resets to default ratio
    gutter.addEventListener("dblclick", function () {
      splitRatio = 2 / 5;
      applySplitRatio();
    });
  }

  // ================= Theme & UI wiring =================
  (function setupTheme() {
    var btnTheme = document.getElementById("btnTheme");
    var saved = null;
    try {
      saved = localStorage.getItem("hl7_theme");
    } catch (_) {}

    function applyTheme(mode) {
      if (mode === "dark") {
        document.body.classList.add("dark");
        if (btnTheme) {
          btnTheme.innerHTML =
            '<span class="material-symbols-rounded" aria-hidden="true">light_mode</span>';
          btnTheme.setAttribute("title", "Toggle Light Mode");
          btnTheme.setAttribute("aria-label", "Toggle light mode");
        }
      } else {
        document.body.classList.remove("dark");
        if (btnTheme) {
          btnTheme.innerHTML =
            '<span class="material-symbols-rounded" aria-hidden="true">dark_mode</span>';
          btnTheme.setAttribute("title", "Toggle Dark Mode");
          btnTheme.setAttribute("aria-label", "Toggle dark mode");
        }
      }
    }

    applyTheme(saved || "light");

    window.addEventListener("hl7-theme-changed", function () {
      var mode = "light";
      try {
        mode = localStorage.getItem("hl7_theme") || "light";
      } catch (_) {}
      applyTheme(mode);
      applyStripe();
    });

    if (btnTheme) {
      btnTheme.addEventListener("click", function () {
        var isDark = document.body.classList.toggle("dark");
        try {
          localStorage.setItem("hl7_theme", isDark ? "dark" : "light");
        } catch (_) {}
        applyTheme(isDark ? "dark" : "light");
        applyStripe();
      });
    }

  })();

  function setupSmoothScroll() {
    var rightPanel = document.querySelector('.right');
    if (!rightPanel) return;

    var targetY = 0;
    var currentY = 0;
    var isAnimating = false;

    rightPanel.addEventListener('wheel', function(e) {
      // If setting is disabled, let browser handle normally
      if (settings.smoothScroll === false) return;

      // Ignore horizontal scrolling
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      
      // Ignore trackpads (they have small deltaY and deltaMode 0)
      if (e.deltaMode === 0 && Math.abs(e.deltaY) < 40) return;

      e.preventDefault();
      
      if (!isAnimating) {
        targetY = rightPanel.scrollTop;
        currentY = rightPanel.scrollTop;
      }

      // Normalize scroll wheel modes and give it a slight inertia boost
      var multiplier = e.deltaMode === 1 ? 40 : 1;
      targetY += (e.deltaY * multiplier * 1.2);
      
      var maxScroll = rightPanel.scrollHeight - rightPanel.clientHeight;
      targetY = Math.max(0, Math.min(targetY, maxScroll));

      if (!isAnimating) {
        isAnimating = true;
        requestAnimationFrame(updateScroll);
      }
    }, { passive: false });

    // Cancel animation if user grabs the scrollbar
    rightPanel.addEventListener('mousedown', function() {
      isAnimating = false;
      targetY = rightPanel.scrollTop;
    });

    function updateScroll() {
      if (!isAnimating) return;
      
      // Lerp for smooth inertia easing
      currentY += (targetY - currentY) * 0.12;

      // Snap and stop if very close
      if (Math.abs(targetY - currentY) < 0.5) {
        currentY = targetY;
        rightPanel.scrollTop = targetY;
        isAnimating = false;
        return;
      }

      rightPanel.scrollTop = currentY;
      requestAnimationFrame(updateScroll);
    }
  }

  function setupMobilePaneTabs() {
    var panes = {
      input: document.querySelector('[data-pane="input"]'),
      breakdown: document.querySelector('[data-pane="breakdown"]')
    };
    var tabs = {
      input: document.getElementById("btnTabInput"),
      breakdown: document.getElementById("btnTabBreakdown")
    };

    function render(view) {
      var active = view === "breakdown" ? "breakdown" : "input";
      Object.keys(panes).forEach(function (key) {
        if (panes[key]) panes[key].classList.toggle("mobile-active", key === active);
        if (tabs[key]) {
          tabs[key].classList.toggle("active", key === active);
          tabs[key].setAttribute("aria-selected", key === active ? "true" : "false");
        }
      });
    }

    var currentView = loadMobileView();
    render(currentView);

    Object.keys(tabs).forEach(function (key) {
      if (!tabs[key]) return;
      tabs[key].addEventListener("click", function () {
        currentView = key;
        render(currentView);
        saveMobileView(currentView);
      });
    });
  }

  function setupHelpGuide() {
    var btn = document.getElementById("btnHelp");
    if (!btn) return;

    var overlay = null;
    var stepIndex = 0;
    var renderQueued = false;
    var pages = [
      { title: "Essentials", items: [
        { selector: "#btnTheme", title: "Theme", text: "Switch light/dark mode." },
        { selector: "#selVersion", title: "HL7 Version", text: "Choose the schema used by Breakdown." },
        { selector: "#btnSettings", title: "Settings", text: "Open display, layout, and saved-state settings." }
      ] },
      { title: "Mobile navigation", mobileOnly: true, items: [
        { selector: "#btnTabInput", title: "HL7 Input tab", text: "Show the message editor.", pane: "input" },
        { selector: "#btnTabBreakdown", title: "Breakdown tab", text: "Show parsed field details.", pane: "breakdown" }
      ] },
      { title: "Input samples", pane: "input", items: [
        { selector: "#btnToggleInputPane", title: "Focus input", text: "Expand HL7 Input." },
        { selector: "#selSample", title: "Sample", text: "Load a built-in or saved message." },
        { selector: "#customSampleTitle", title: "Sample name", text: "Name a new sample or overwrite the selected user sample." },
        { selector: "#btnAddSample", title: "Save sample", text: "Save the current message." },
        { selector: "#btnDeleteSample", title: "Delete sample", text: "Delete the selected user sample." }
      ] },
      { title: "Input actions", pane: "input", items: [
        { selector: "#btnWrap", title: "Word wrap", text: "Toggle editor wrapping." },
        { selector: "#btnSendHttp", title: "Send HTTP", text: "Send the current message to an endpoint." },
        { selector: "#btnAnonymizePid", title: "Anonymise PID", text: "Replace PID data with configured fake data." },
        { selector: "#btnAnonSettings", title: "Anonymisation settings", text: "Configure anonymisation behaviour." },
        { selector: "#btnRestorePid", title: "Restore PID", text: "Restore original PID data." }
      ] },
      { title: "Message editor", pane: "input", items: [
        { selector: "#cmEditor", title: "HL7 Input", text: "Edit raw HL7. Selecting a field highlights it in Breakdown." },
        { selector: ".font-controls", title: "Editor font size", text: "Increase or decrease the HL7 editor font." }
      ] },
      { title: "Breakdown header", pane: "breakdown", items: [
        { selector: "#btnToggleBreakdownPane", title: "Focus Breakdown", text: "Expand Breakdown." },
        { selector: "#badgeSeg", title: "Segments", text: "Visible segment count." },
        { selector: "#badgeFld", title: "Fields", text: "Visible field count." },
        { selector: "#badgeUnsupported", title: "Unsupported fields", text: "Filter fields unsupported by the selected schema." }
      ] },
      { title: "Breakdown tools", pane: "breakdown", items: [
        { selector: "#fldSearch", title: "Search", text: "Filter by segment, field, value, or path." },
        { selector: "#tree", title: "Breakdown", text: "View parsed segments, edit values, and copy paths." }
      ] }
    ];

    function isVisible(el) {
      if (!el || el.hidden) return false;
      var style = window.getComputedStyle(el);
      var rect = el.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 2 && rect.height > 2;
    }

    function getSteps() {
      var availablePages = pages.filter(function (page) {
        return !page.mobileOnly || window.innerWidth <= 1200;
      });
      if (window.innerWidth > 700) return availablePages;
      var mobileSteps = [];
      availablePages.forEach(function (page) {
        page.items.forEach(function (item) {
          mobileSteps.push({
            title: page.title + " · " + item.title,
            pane: item.pane || page.pane,
            items: [item]
          });
        });
      });
      return mobileSteps;
    }

    function overlapArea(a, b) {
      var width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
      var height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      return width * height;
    }

    function asRect(left, top, width, height) {
      return { left: left, top: top, right: left + width, bottom: top + height, width: width, height: height };
    }

    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    function paddedRect(rect, padding) {
      return asRect(rect.left - padding, rect.top - padding, rect.width + padding * 2, rect.height + padding * 2);
    }

    function showPane(pane) {
      if (!pane || window.innerWidth > 1200) return;
      var tab = document.getElementById(pane === "breakdown" ? "btnTabBreakdown" : "btnTabInput");
      if (tab && !tab.classList.contains("active")) tab.click();
    }

    function placeCallout(card, target, blocked, placed, reserved) {
      var margin = 12;
      var gap = 18;
      var width = card.offsetWidth;
      var height = card.offsetHeight;
      var cx = target.left + target.width / 2;
      var cy = target.top + target.height / 2;
      var candidates = [
        { left: cx - width / 2, top: target.top - gap - height },
        { left: cx - width / 2, top: target.bottom + gap },
        { left: target.left - gap - width, top: cy - height / 2 },
        { left: target.right + gap, top: cy - height / 2 },
        { left: target.left, top: target.top - gap - height },
        { left: target.right - width, top: target.top - gap - height },
        { left: target.left, top: target.bottom + gap },
        { left: target.right - width, top: target.bottom + gap }
      ];
      for (var scanTop = margin; scanTop <= window.innerHeight - height - margin; scanTop += 28) {
        for (var scanLeft = margin; scanLeft <= window.innerWidth - width - margin; scanLeft += 36) {
          candidates.push({ left: scanLeft, top: scanTop, free: true });
        }
      }
      var best = null;
      candidates.forEach(function (candidate, preference) {
        var left = clamp(candidate.left, margin, window.innerWidth - width - margin);
        var top = clamp(candidate.top, margin, window.innerHeight - height - margin);
        var rect = asRect(left, top, width, height);
        var score = candidate.free
          ? 220 + Math.hypot((left + width / 2) - cx, (top + height / 2) - cy) * 0.3
          : Math.abs(left - candidate.left) * 30 + Math.abs(top - candidate.top) * 30 + preference * 8;
        blocked.forEach(function (blockedRect) { score += overlapArea(rect, blockedRect) * 80; });
        placed.forEach(function (placedRect) { score += overlapArea(rect, placedRect) * 140; });
        reserved.forEach(function (reservedRect) { score += overlapArea(rect, reservedRect) * 180; });
        if (!candidate.free) score += Math.hypot((left + width / 2) - cx, (top + height / 2) - cy) * 0.08;
        if (!best || score < best.score) best = { rect: rect, score: score };
      });
      card.style.left = best.rect.left + "px";
      card.style.top = best.rect.top + "px";
      card.style.visibility = "visible";
      return best.rect;
    }

    function addLine(svg, cardRect, targetRect) {
      var targetX = targetRect.left + targetRect.width / 2;
      var targetY = targetRect.top + targetRect.height / 2;
      var cardX = clamp(targetX, cardRect.left, cardRect.right);
      var cardY = clamp(targetY, cardRect.top, cardRect.bottom);
      if (cardX > cardRect.left && cardX < cardRect.right && cardY > cardRect.top && cardY < cardRect.bottom) {
        var distances = [
          { value: Math.abs(targetY - cardRect.top), x: targetX, y: cardRect.top },
          { value: Math.abs(targetY - cardRect.bottom), x: targetX, y: cardRect.bottom },
          { value: Math.abs(targetX - cardRect.left), x: cardRect.left, y: targetY },
          { value: Math.abs(targetX - cardRect.right), x: cardRect.right, y: targetY }
        ].sort(function (a, b) { return a.value - b.value; });
        cardX = clamp(distances[0].x, cardRect.left, cardRect.right);
        cardY = clamp(distances[0].y, cardRect.top, cardRect.bottom);
      }
      var targetEdgeX = clamp(cardX, targetRect.left, targetRect.right);
      var targetEdgeY = clamp(cardY, targetRect.top, targetRect.bottom);
      var line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("class", "help-tour-line");
      line.setAttribute("x1", String(cardX));
      line.setAttribute("y1", String(cardY));
      line.setAttribute("x2", String(targetEdgeX));
      line.setAttribute("y2", String(targetEdgeY));
      line.setAttribute("marker-end", "url(#helpTourArrow)");
      svg.appendChild(line);
    }

    function renderStep() {
      if (!overlay) return;
      var steps = getSteps();
      stepIndex = clamp(stepIndex, 0, steps.length - 1);
      var step = steps[stepIndex];
      showPane(step.pane);
      overlay.querySelectorAll(".help-tour-ring, .help-tour-callout").forEach(function (node) { node.remove(); });
      var svg = overlay.querySelector(".help-tour-lines");
      svg.querySelectorAll(".help-tour-line").forEach(function (node) { node.remove(); });
      overlay.querySelector(".help-tour-status").textContent = step.title + "  " + (stepIndex + 1) + "/" + steps.length;
      var entries = step.items.map(function (item) {
        var el = document.querySelector(item.selector);
        return isVisible(el) ? { item: item, el: el, rect: el.getBoundingClientRect() } : null;
      }).filter(Boolean);
      var blocked = entries.map(function (entry) { return paddedRect(entry.rect, 9); });
      var navRect = overlay.querySelector(".help-tour-nav").getBoundingClientRect();
      var closeRect = overlay.querySelector(".help-tour-close").getBoundingClientRect();
      var reserved = [paddedRect(navRect, 8), paddedRect(closeRect, 8)];
      var placed = [];

      entries.forEach(function (entry) {
        var ring = document.createElement("div");
        ring.className = "help-tour-ring";
        ring.style.left = Math.max(2, entry.rect.left - 5) + "px";
        ring.style.top = Math.max(2, entry.rect.top - 5) + "px";
        ring.style.width = entry.rect.width + 10 + "px";
        ring.style.height = entry.rect.height + 10 + "px";
        overlay.appendChild(ring);

        var card = document.createElement("div");
        card.className = "help-tour-callout";
        card.style.visibility = "hidden";
        card.innerHTML = "<strong>" + escText(entry.item.title) + "</strong><span>" + escText(entry.item.text) + "</span>";
        overlay.appendChild(card);
        var cardRect = placeCallout(card, entry.rect, blocked, placed, reserved);
        placed.push(paddedRect(cardRect, 6));
        addLine(svg, cardRect, entry.rect);
      });
    }

    function activateStep(nextIndex) {
      var steps = getSteps();
      stepIndex = (nextIndex + steps.length) % steps.length;
      showPane(steps[stepIndex].pane);
      requestAnimationFrame(renderStep);
    }

    function scheduleRender() {
      if (!overlay || renderQueued) return;
      renderQueued = true;
      requestAnimationFrame(function () {
        renderQueued = false;
        renderStep();
      });
    }

    function close() {
      if (!overlay) return;
      overlay.remove();
      overlay = null;
      btn.setAttribute("aria-pressed", "false");
      btn.classList.remove("active");
      btn.setAttribute("title", "Open help");
      btn.setAttribute("aria-label", "Open help");
      window.removeEventListener("resize", scheduleRender);
      window.removeEventListener("scroll", scheduleRender, true);
      document.removeEventListener("click", scheduleRender, true);
      document.removeEventListener("keydown", onKeydown);
    }

    function onKeydown(e) {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") activateStep(stepIndex + 1);
      if (e.key === "ArrowLeft") activateStep(stepIndex - 1);
    }

    function open() {
      if (overlay) return;
      overlay = document.createElement("div");
      overlay.className = "help-tour-overlay";
      overlay.innerHTML =
        '<svg class="help-tour-lines" aria-hidden="true"><defs><marker id="helpTourArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="var(--accent)"></path></marker></defs></svg>' +
        '<button type="button" class="help-tour-close ghost" aria-label="Close help">×</button>' +
        '<div class="help-tour-nav" role="group" aria-label="Help pages">' +
          '<button type="button" class="help-tour-prev ghost" aria-label="Previous help page">←</button>' +
          '<span class="help-tour-status" aria-live="polite"></span>' +
          '<button type="button" class="help-tour-next ghost" aria-label="Next help page">→</button>' +
        '</div>';
      document.body.appendChild(overlay);
      overlay.querySelector(".help-tour-close").addEventListener("click", close);
      overlay.querySelector(".help-tour-prev").addEventListener("click", function () { activateStep(stepIndex - 1); });
      overlay.querySelector(".help-tour-next").addEventListener("click", function () { activateStep(stepIndex + 1); });
      btn.setAttribute("aria-pressed", "true");
      btn.classList.add("active");
      btn.setAttribute("title", "Close help");
      btn.setAttribute("aria-label", "Close help");
      window.addEventListener("resize", scheduleRender);
      window.addEventListener("scroll", scheduleRender, true);
      document.addEventListener("click", scheduleRender, true);
      document.addEventListener("keydown", onKeydown);
      renderStep();
    }

    btn.addEventListener("click", function () {
      if (overlay) close();
      else open();
    });
  }

  function setupPaneFocusControls() {
    var grid = document.querySelector(".grid");
    var btnInput = document.getElementById("btnToggleInputPane");
    var btnBreakdown = document.getElementById("btnToggleBreakdownPane");
    if (!grid || !btnInput || !btnBreakdown) return;

    function setButtonState(button, focused, paneName) {
      button.setAttribute("aria-pressed", focused ? "true" : "false");
      button.setAttribute("title", focused ? "Restore split panes" : "Focus " + paneName);
      button.setAttribute("aria-label", focused ? "Restore split panes" : "Focus " + paneName);
      var glyph = button.querySelector(".pane-toggle-glyph");
      if (glyph) glyph.textContent = focused ? "↔" : "⛶";
    }

    function render(focus) {
      var inputFocused = focus === "input";
      var breakdownFocused = focus === "breakdown";
      grid.classList.toggle("pane-focus-input", inputFocused);
      grid.classList.toggle("pane-focus-breakdown", breakdownFocused);
      setButtonState(btnInput, inputFocused, "HL7 Input");
      setButtonState(btnBreakdown, breakdownFocused, "Breakdown");
      if (cmView) requestAnimationFrame(function () { cmView.requestMeasure(); });
    }

    btnInput.addEventListener("click", function () {
      render(grid.classList.contains("pane-focus-input") ? "" : "input");
    });
    btnBreakdown.addEventListener("click", function () {
      render(grid.classList.contains("pane-focus-breakdown") ? "" : "breakdown");
    });
    render("");
  }

  async function bindUI() {
    setupGutter();
    setupSettings();
    setupHttpSender();
    bindAnonSettingsUI();
    setupSmoothScroll();
    setupMobilePaneTabs();
    setupPaneFocusControls();
    setupHelpGuide();
    applyFontSize();
    applyStripe();
    applyLayoutSettings();
    applyUiStyle();
    applyUiDensity();
    applyMotionSettings();

    var btnFontUp = document.getElementById("btnFontUp");
    var btnFontDown = document.getElementById("btnFontDown");
    if (btnFontUp) btnFontUp.addEventListener("click", function () { changeFontSize(1); });
    if (btnFontDown) btnFontDown.addEventListener("click", function () { changeFontSize(-1); });

    var btnWrap = document.getElementById("btnWrap");
    var selVersion = document.getElementById("selVersion");
    var selSample = document.getElementById("selSample");
    var customSampleTitle = document.getElementById("customSampleTitle");
    var btnAddSample = document.getElementById("btnAddSample");
    var btnDeleteSample = document.getElementById("btnDeleteSample");

    function syncSampleControls() {
      if (!btnDeleteSample || !selSample) return;
      btnDeleteSample.disabled = !/^custom_/.test(selSample.value || "");
    }

    function addSampleOption(group, key, title) {
      var opt = document.createElement("option");
      opt.value = key;
      opt.textContent = title;
      group.appendChild(opt);
    }

    function populateSamples(preferredKey) {
      if (selSample && SAMPLE_TITLES) {
        var current = preferredKey || selSample.value;
        selSample.innerHTML = "";
        var builtInGroup = document.createElement("optgroup");
        builtInGroup.label = "Built-in samples";
        Object.keys(SAMPLE_TITLES).forEach(function (key) {
          addSampleOption(builtInGroup, key, SAMPLE_TITLES[key]);
        });
        selSample.appendChild(builtInGroup);

        var custom = loadCustomSamples();
        var customKeys = Object.keys(custom).sort(function (a, b) {
          return custom[a].title.localeCompare(custom[b].title);
        });
        if (customKeys.length) {
          var customGroup = document.createElement("optgroup");
          customGroup.label = "User samples";
          customKeys.forEach(function (key) {
            addSampleOption(customGroup, key, custom[key].title);
          });
          selSample.appendChild(customGroup);
        }

        if (current && getSampleMessage(current)) {
          selSample.value = current;
        } else if (selSample.options.length) {
          selSample.selectedIndex = 0;
        }
        syncSampleControls();
      }
    }

    function saveCurrentAsSample() {
      var message = getEditorText();
      if (!message || !message.trim()) {
        showCopied("No message loaded");
        return;
      }
      var title = customSampleTitle ? customSampleTitle.value.trim() : "";
      var custom = loadCustomSamples();
      var selectedKey = selSample ? selSample.value || "" : "";
      if (!title && /^custom_/.test(selectedKey) && custom[selectedKey]) {
        var existingTitle = custom[selectedKey].title || "selected sample";
        var ok = window.confirm(
          'Overwrite "' + existingTitle + '" with the current HL7 message?'
        );
        if (!ok) return;
        custom[selectedKey] = {
          title: existingTitle,
          message: message,
          version: selVersion ? selVersion.value : currentVersion,
          createdAt: custom[selectedKey].createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        saveCustomSamples(custom);
        populateSamples(selectedKey);
        saveSelectedSampleKey(selectedKey);
        if (selVersion) saveSelectedVersion(selVersion.value);
        window.location.hash = selectedKey;
        showCopied("Sample overwritten");
        return;
      }
      if (!title) {
        title = "Custom sample " + (Object.keys(custom).length + 1);
      }
      var key = customSampleKey();
      custom[key] = {
        title: title,
        message: message,
        version: selVersion ? selVersion.value : currentVersion,
        createdAt: new Date().toISOString()
      };
      saveCustomSamples(custom);
      populateSamples(key);
      saveSelectedSampleKey(key);
      if (selVersion) saveSelectedVersion(selVersion.value);
      if (customSampleTitle) customSampleTitle.value = "";
      window.location.hash = key;
      showCopied("Sample saved");
    }

    function deleteSelectedCustomSample() {
      if (!selSample || !/^custom_/.test(selSample.value || "")) return;
      var custom = loadCustomSamples();
      if (!custom[selSample.value]) return;
      delete custom[selSample.value];
      saveCustomSamples(custom);
      saveSelectedSampleKey("");
      populateSamples();
      loadSelectedSample();
      showCopied("Sample deleted");
    }

    window.addEventListener("hl7-custom-samples-changed", function () {
      populateSamples(loadSelectedSampleKey() || (selSample ? selSample.value : ""));
      if (selSample) saveSelectedSampleKey(selSample.value || "");
    });

    function loadInitialMessage() {
      var storedMsg = loadStoredMessage();
      var savedVersion = loadSelectedVersion();

      // Populate sample dropdown
      populateSamples(loadSelectedSampleKey());

      // Load initial
      var hash = window.location.hash.replace(/^#/, "");
      if (hash && getSampleMessage(hash)) {
        if (selSample) selSample.value = hash;
        saveSelectedSampleKey(hash);
        loadSelectedSample();
        if (savedVersion && selVersion) {
          selVersion.value = savedVersion;
          currentVersion = selVersion.value;
          parseNow();
        }
      } else if (storedMsg && storedMsg.trim()) {
        var savedSample = loadSelectedSampleKey();
        if (savedSample && selSample && getSampleMessage(savedSample)) {
          selSample.value = savedSample;
          syncSampleControls();
        }
        if (savedVersion && selVersion) {
          selVersion.value = savedVersion;
          currentVersion = selVersion.value;
        }
        setEditorText(storedMsg);
        parseNow();
      } else {
        loadSelectedSample();
        if (savedVersion && selVersion) {
          selVersion.value = savedVersion;
          currentVersion = selVersion.value;
          saveSelectedVersion(currentVersion);
          parseNow();
        }
      }
    }

    ensureCodeMirror().then(function (view) {
      cmView = view;
      cmView.dom.addEventListener("mouseleave", function () {
        hideEditorHint();
      });
      cmView.dom.addEventListener("keydown", function (e) {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          parseNow();
        }
      });
      loadInitialMessage();
    }).catch(function(err) {
      console.error("CodeMirror failed to load:", err);
      createPlainEditor();
      loadInitialMessage();
    });

    if (btnWrap) btnWrap.addEventListener("click", toggleWrap);
    if (btnAddSample) btnAddSample.addEventListener("click", saveCurrentAsSample);
    if (btnDeleteSample) btnDeleteSample.addEventListener("click", deleteSelectedCustomSample);
    if (customSampleTitle) {
      customSampleTitle.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          saveCurrentAsSample();
        }
      });
    }

    var btnAnonymizePid = document.getElementById("btnAnonymizePid");
    if (btnAnonymizePid) btnAnonymizePid.addEventListener("click", anonymizeCurrentPid);
    var btnRestorePid = document.getElementById("btnRestorePid");
    if (btnRestorePid) btnRestorePid.addEventListener("click", restoreOriginalPidData);
    syncRestorePidButton();

    var fldSearch = document.getElementById("fldSearch");
    if (fldSearch) {
      fldSearch.addEventListener("input", function () {
        unsupportedFilterOn = false;
        var badge = document.getElementById("badgeUnsupported");
        if (badge) badge.classList.remove("active");
        applySearchFilter();
      });
    }
    var badgeUnsupported = document.getElementById("badgeUnsupported");
    if (badgeUnsupported) {
      function toggleUnsupportedFilter() {
        if (badgeUnsupported.hidden) return;
        unsupportedFilterOn = !unsupportedFilterOn;
        badgeUnsupported.classList.toggle("active", unsupportedFilterOn);
        if (unsupportedFilterOn && fldSearch) fldSearch.value = "";
        if (unsupportedFilterOn) applyUnsupportedFilter(true);
        else {
          setUnsupportedEditorHighlight([]);
          applySearchFilter();
        }
      }
      badgeUnsupported.addEventListener("click", toggleUnsupportedFilter);
      badgeUnsupported.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleUnsupportedFilter();
        }
      });
    }

    function loadSelectedSample() {
      clearOriginalPidMessage();
      var key = (selSample && selSample.value) || "a01_v24";
      var msg = getSampleMessage(key);
      saveSelectedSampleKey(key);
      if (selVersion) {
        selVersion.value = getSampleVersion(key, msg);
        currentVersion = selVersion.value;
        saveSelectedVersion(currentVersion);
      }
      setEditorText(msg);
      parseNow();
      syncSampleControls();
    }

    if (selSample) selSample.addEventListener("change", function () {
      loadSelectedSample();
      window.location.hash = selSample.value || "";
    });

    if (selVersion) {
      var savedVersion = loadSelectedVersion();
      if (savedVersion) selVersion.value = savedVersion;
      currentVersion = selVersion.value;
      selVersion.addEventListener("change", function () {
        currentVersion = selVersion.value;
        saveSelectedVersion(currentVersion);
        parseNow();
      });
    }

    // Initial empty state message
    var tree = document.getElementById("tree");
    if (tree)
      tree.innerHTML =
        '<p class="muted">Nothing to show yet. Paste an HL7 message to parse it automatically.</p>';
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    if (window.location.protocol !== "https:" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
      return;
    }
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("./sw.js").catch(function (err) {
        console.warn("Service worker registration failed:", err);
      });
    });
  }

  registerServiceWorker();

  bindUI().catch(function (err) {
    console.error("UI bootstrap failed:", err);
    var tree = document.getElementById("tree");
    if (tree) {
      tree.innerHTML =
        '<p class="danger">The UI failed to start. Check the console for details.</p>';
    }
  });
})();
