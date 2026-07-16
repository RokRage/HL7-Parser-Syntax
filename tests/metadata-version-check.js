const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const context = { window: {} };
vm.createContext(context);

["assets/js/hl7-fields-2x.js", "assets/js/hl7-datatypes-2x.js"].forEach((file) => {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, {
    filename: file
  });
});

const fields = context.window.FIELD_NAMES_BY_VERSION;
const datatypes = context.window.DATATYPE_BY_FIELD;
const appSource = fs.readFileSync(path.join(root, "assets/js/app.js"), "utf8");
const cssSource = fs.readFileSync(path.join(root, "assets/css/styles.css"), "utf8");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function has(map, version, segment, field) {
  return !!(map[version] && map[version][segment] && map[version][segment][field]);
}

assert(!has(fields, "2.3", "MSH", 21), "v2.3 MSH-21 should not be labelled");
assert(has(fields, "2.4", "MSH", 21), "v2.4 MSH-21 should be labelled");
assert(!has(fields, "2.3", "EVN", 7), "v2.3 EVN-7 should not be labelled");
assert(has(fields, "2.4", "EVN", 7), "v2.4 EVN-7 should be labelled");
assert(!has(fields, "2.3", "PID", 31), "v2.3 PID-31 should not be labelled");
assert(has(fields, "2.4", "PID", 38), "v2.4 PID-38 should be labelled");
assert(!has(fields, "2.4", "PID", 39), "v2.4 PID-39 should not be labelled");
assert(!has(fields, "2.3", "ORC", 25), "v2.3 ORC-25 should not be labelled");
assert(has(fields, "2.4", "ORC", 25), "v2.4 ORC-25 should be labelled");
assert(!has(fields, "2.3", "OBR", 46), "v2.3 OBR-46 should not be labelled");
assert(has(fields, "2.4", "OBR", 47), "v2.4 OBR-47 should be labelled");
assert(!has(fields, "2.3", "OBX", 18), "v2.3 OBX-18 should not be labelled");
assert(has(fields, "2.4", "OBX", 19), "v2.4 OBX-19 should be labelled");

assert(datatypes["2.3"] !== datatypes["2.4"], "datatype maps should not be shared");
assert(datatypes["2.3"].MSH[9] === "CM", "v2.3 MSH-9 should be CM");
assert(datatypes["2.4"].MSH[9] === "MSG", "v2.4 MSH-9 should be MSG");
assert(datatypes["2.4"].OBR[6] === "TS", "v2.4 OBR-6 should be TS");
assert(datatypes["2.4"].PV1[25] === "DT", "v2.4 PV1-25 should be DT");
assert(datatypes["2.4"].PV1[46] === "NM", "v2.4 PV1-46 should be NM");
assert(appSource.includes("schema-unsupported"), "unsupported schema class should be rendered");
assert(
  appSource.includes("Not supported in current schema"),
  "unsupported schema note should be rendered"
);
assert(cssSource.includes(".segment-card tr.schema-unsupported"), "unsupported schema CSS should exist");
assert(appSource.includes('SELECTED_VERSION_KEY = "hl7_selected_version"'), "selected version storage key should exist");
assert(appSource.includes("saveSelectedVersion(currentVersion);"), "selected version should be persisted");

console.log("HL7 version metadata checks passed");
