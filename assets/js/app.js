// app.js
(function () {
  var FIELD_NAMES_BY_VERSION = window.FIELD_NAMES_BY_VERSION || {};
  var DATATYPE_BY_FIELD = window.DATATYPE_BY_FIELD || {};
  var COMPONENT_NAMES_BY_DATATYPE = window.COMPONENT_NAMES_BY_DATATYPE || {};
  var FIELD_DESC_BY_SEGMENT = window.FIELD_DESC_BY_SEGMENT || {};
  var SAMPLES = window.HL7_SAMPLES || {};
  var SAMPLE_TITLES = window.HL7_SAMPLE_TITLES || {};

  var currentVersion = "2.4";
  var currentModel = { delims: null, segments: [] };

  // ================= CodeMirror setup (ESM via esm.sh) =================
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

    plainEditor.addEventListener("input", scheduleParse);
    plainEditor.addEventListener("keydown", function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        parseNow();
      }
    });

    function syncPlainSelection() {
      var head = plainEditor.selectionStart || 0;
      var lineNo = plainEditor.value.slice(0, head).split(/\r\n?|\n/).length;
      highlightSegment(segIndexForText(plainEditor.value, lineNo));
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
    if (!nm || !nm.trim()) return null;

    var label = seg + "-" + index + "  " + nm.trim();
    if (fieldStart == null || fieldEnd == null || fieldEnd <= fieldStart) {
      return { label: label, from: null, to: null };
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
      from: line.from + fieldStart + chunkStart,
      to: line.from + fieldStart + chunkEnd
    };
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

    // Use esm.sh for proper ESM URLs
    const [
      viewMod,
      stateMod,
      cmdsMod
    ] = await Promise.all([
      import("https://esm.sh/@codemirror/view@6"),
      import("https://esm.sh/@codemirror/state@6"),
      import("https://esm.sh/@codemirror/commands@6")
    ]);

    CM = {
      EditorView: viewMod.EditorView,
      keymap: viewMod.keymap,
      lineNumbers: viewMod.lineNumbers,
      highlightActiveLine: viewMod.highlightActiveLine,
      drawSelection: viewMod.drawSelection,
      Decoration: viewMod.Decoration,

      EditorState: stateMod.EditorState,
      RangeSetBuilder: stateMod.RangeSetBuilder,
      Compartment: stateMod.Compartment,
      StateField: stateMod.StateField,
      StateEffect: stateMod.StateEffect,

      defaultKeymap: cmdsMod.defaultKeymap,
      history: cmdsMod.history,
      historyKeymap: cmdsMod.historyKeymap,
      indentWithTab: cmdsMod.indentWithTab,

      lineWrapping: viewMod.EditorView.lineWrapping
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
        CM.history(),
        CM.keymap.of([
          ...CM.defaultKeymap,
          ...CM.historyKeymap,
          CM.indentWithTab,
          // Parse on Mod-Enter
          { key: "Mod-Enter", run: () => (parseNow(), true) }
        ]),
        CM.EditorView.updateListener.of(function (update) {
          if (update.docChanged) scheduleParse();
          if (update.selectionSet) {
            var head = update.state.selection.main.head;
            var lineNo = update.state.doc.lineAt(head).number;
            highlightSegment(segIndexForLine(update.state, lineNo));
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

  // ================= Right pane rendering =================
  function fieldName(seg, index) {
    var byVer = FIELD_NAMES_BY_VERSION[currentVersion] || {};
    var segMap = byVer[seg] || {};
    if (segMap[index]) return segMap[index];
    var altVer = currentVersion === "2.3" ? "2.4" : "2.3";
    var alt = FIELD_NAMES_BY_VERSION[altVer] || {};
    return alt[seg] && alt[seg][index] ? alt[seg][index] : " ";
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

  function renderTree(model) {
    var tree = document.getElementById("tree");
    tree.innerHTML = "";
    if (!model || model.segments.length === 0) {
      tree.innerHTML =
        '<p class="muted">Nothing to show yet. Paste an HL7 message to parse it automatically.</p>';
      document.getElementById("badgeSeg").textContent = "0 segments";
      document.getElementById("badgeFld").textContent = "0 fields";
      return;
    }

    var segCount = model.segments.length;
    var fieldCount = 0;
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
        fieldCount++;
        var tr = document.createElement("tr");
        tr.className = "field-row";
        tr.setAttribute("data-seg", seg.name);
        tr.setAttribute("data-field-index", String(field.index));
        tr.setAttribute(
          "data-field-name",
          (fieldName(seg.name, field.index) || "").toLowerCase()
        );
        tr.setAttribute("data-raw", (field.raw || "").toLowerCase());
        tr.innerHTML =
          "" +
          '<td style="vertical-align:top;padding:8px 10px;white-space:nowrap;">' +
          field.index +
          "</td>" +
          '<td style="vertical-align:top;padding:8px 10px;">' +
          (function () {
            var nm = fieldName(seg.name, field.index) || "";
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

    document.getElementById("badgeSeg").textContent =
      segCount + " segment" + (segCount === 1 ? "" : "s");
    document.getElementById("badgeFld").textContent =
      fieldCount + " field" + (fieldCount === 1 ? "" : "s");

    wireEditingHandlers();
    applySearchFilter();
  }

  // Highlight + scroll the breakdown card matching editor cursor line
  function highlightSegment(segIdx) {
    var tree = document.getElementById("tree");
    if (!tree) return;
    var cards = tree.getElementsByClassName("segment-card");
    for (var i = 0; i < cards.length; i++) {
      var on = String(i) === String(segIdx);
      cards[i].classList.toggle("active", on);
      if (on && cards[i].style.display !== "none") {
        cards[i].scrollIntoView({ block: "nearest", behavior: "smooth" });
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
    clearPathHits(tree);

    var cards = Array.prototype.slice.call(
      tree.getElementsByClassName("segment-card")
    );
    var visibleFields = 0;
    var visibleSegments = 0;
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

    document.getElementById("badgeSeg").textContent =
      visibleSegments + " segment" + (visibleSegments === 1 ? "" : "s");
    document.getElementById("badgeFld").textContent =
      visibleFields + " field" + (visibleFields === 1 ? "" : "s");

    if (scrollTarget)
      scrollTarget.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function applySearchFilter() {
    var input = document.getElementById("fldSearch");
    var rawVal = input ? input.value : "";

    var tree = document.getElementById("tree");
    if (!tree) return;

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
        if (ok) visibleFields++;
        anyVisible = anyVisible || ok;
      });
      card.style.display = anyVisible ? "" : "none";
      if (anyVisible) visibleSegments++;
    });

    document.getElementById("badgeSeg").textContent =
      visibleSegments + " segment" + (visibleSegments === 1 ? "" : "s");
    document.getElementById("badgeFld").textContent =
      visibleFields + " field" + (visibleFields === 1 ? "" : "s");
  }

  function wireEditingHandlers() {
    var tree = document.getElementById("tree");
    if (!tree) return;

    tree.addEventListener("input", function (e) {
      var t = e.target;
      var role = t.getAttribute("data-role");
      if (!role) return;

      if (role === "raw") {
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
      } else if (role === "sub") {
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

  function changeFontSize(delta) {
    fontSize = Math.max(FONT_MIN, Math.min(FONT_MAX, fontSize + delta));
    applyFontSize();
  }

  // ================= Settings =================
  var SETTINGS_KEY = "hl7_settings";
  var SETTINGS_DEFAULTS = {
    stripeOn: true,
    stripeLight: "#eef1f6",
    stripeDark: "#1b2433",
    pageGutter: 8,
    smoothScroll: true,
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
    return out;
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (_) {}
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
    var inSmooth = document.getElementById("setSmoothScroll");
    var inHint = document.getElementById("setHintMode");
    if (!overlay || !btnOpen) return;

    function syncInputs() {
      inOn.checked = settings.stripeOn !== false;
      inLight.value = settings.stripeLight;
      inDark.value = settings.stripeDark;
      if (inGutter) inGutter.value = String(settings.pageGutter);
      if (outGutter) outGutter.textContent = settings.pageGutter + "px";
      if (inSmooth) inSmooth.checked = settings.smoothScroll !== false;
      if (inHint) inHint.value = settings.hintMode || "float";
    }
    function open() {
      syncInputs();
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
    btnReset.addEventListener("click", function () {
      settings = JSON.parse(JSON.stringify(SETTINGS_DEFAULTS));
      saveSettings();
      syncInputs();
      applyStripe();
      applyLayoutSettings();
    });
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

  async function bindUI() {
    setupGutter();
    setupSettings();
    setupHttpSender();
    setupSmoothScroll();
    applyFontSize();
    applyStripe();
    applyLayoutSettings();

    var btnFontUp = document.getElementById("btnFontUp");
    var btnFontDown = document.getElementById("btnFontDown");
    if (btnFontUp) btnFontUp.addEventListener("click", function () { changeFontSize(1); });
    if (btnFontDown) btnFontDown.addEventListener("click", function () { changeFontSize(-1); });

    var btnWrap = document.getElementById("btnWrap");
    var selVersion = document.getElementById("selVersion");
    var selSample = document.getElementById("selSample");

    function populateSamples() {
      if (selSample && SAMPLE_TITLES) {
        selSample.innerHTML = "";
        Object.keys(SAMPLE_TITLES).forEach(function (key) {
          var opt = document.createElement("option");
          opt.value = key;
          opt.textContent = SAMPLE_TITLES[key];
          selSample.appendChild(opt);
        });
        if (selSample.options.length) selSample.selectedIndex = 0;
      }
    }

    function loadInitialMessage() {
      // Populate sample dropdown
      populateSamples();

      // Load initial
      var hash = window.location.hash.replace(/^#/, "");
      if (hash && SAMPLES && SAMPLES[hash]) {
        if (selSample) selSample.value = hash;
        loadSelectedSample();
      } else if (storedMsg && storedMsg.trim()) {
        setEditorText(storedMsg);
        parseNow();
      } else {
        loadSelectedSample();
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

    var fldSearch = document.getElementById("fldSearch");
    if (fldSearch) fldSearch.addEventListener("input", applySearchFilter);

    function loadSelectedSample() {
      var key = (selSample && selSample.value) || "a01_v24";
      var msg = (SAMPLES && SAMPLES[key]) || "";
      if (selVersion) {
        if (/_v23$/.test(key)) selVersion.value = "2.3";
        if (/_v24$/.test(key)) selVersion.value = "2.4";
        currentVersion = selVersion.value;
      }
      setEditorText(msg);
      parseNow();
    }

    if (selSample) selSample.addEventListener("change", loadSelectedSample);

    if (selVersion) {
      currentVersion = selVersion.value;
      selVersion.addEventListener("change", function () {
        currentVersion = selVersion.value;
        parseNow();
      });
    }

    // Initial empty state message
    var tree = document.getElementById("tree");
    if (tree)
      tree.innerHTML =
        '<p class="muted">Nothing to show yet. Paste an HL7 message to parse it automatically.</p>';
  }

  bindUI().catch(function (err) {
    console.error("UI bootstrap failed:", err);
    var tree = document.getElementById("tree");
    if (tree) {
      tree.innerHTML =
        '<p class="danger">The UI failed to start. Check the console for details.</p>';
    }
  });
})();
