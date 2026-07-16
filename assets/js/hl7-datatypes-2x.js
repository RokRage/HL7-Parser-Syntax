/* HL7 v2.x Datatype component names + field->datatype maps
 * Used to label component breakdown (e.g. MSH.9.1 = "Message Code").
 * Coverage: common composite datatypes + common segments. Unknowns fall back
 * to a generic label (or the field name for single-component fields).
 */

/* Component (.1, .2, ...) names per HL7 composite datatype */
window.COMPONENT_NAMES_BY_DATATYPE = {
  MSG: { 1: "Message Code", 2: "Trigger Event", 3: "Message Structure" },
  HD: { 1: "Namespace ID", 2: "Universal ID", 3: "Universal ID Type" },
  EI: { 1: "Entity Identifier", 2: "Namespace ID", 3: "Universal ID", 4: "Universal ID Type" },
  CX: {
    1: "ID Number", 2: "Check Digit", 3: "Check Digit Scheme",
    4: "Assigning Authority", 5: "Identifier Type Code", 6: "Assigning Facility",
    7: "Effective Date", 8: "Expiration Date"
  },
  XPN: {
    1: "Family Name", 2: "Given Name", 3: "Second/Further Given Names",
    4: "Suffix", 5: "Prefix", 6: "Degree", 7: "Name Type Code",
    8: "Name Representation Code", 9: "Name Context", 10: "Name Validity Range",
    11: "Name Assembly Order"
  },
  XCN: {
    1: "ID Number", 2: "Family Name", 3: "Given Name",
    4: "Second/Further Given Names", 5: "Suffix", 6: "Prefix", 7: "Degree",
    8: "Source Table", 9: "Assigning Authority", 10: "Name Type Code",
    11: "Identifier Check Digit", 12: "Check Digit Scheme",
    13: "Identifier Type Code", 14: "Assigning Facility",
    15: "Name Representation Code"
  },
  XAD: {
    1: "Street Address", 2: "Other Designation", 3: "City",
    4: "State/Province", 5: "Zip/Postal Code", 6: "Country",
    7: "Address Type", 8: "Other Geographic Designation",
    9: "County/Parish Code", 10: "Census Tract"
  },
  SAD: { 1: "Street or Mailing Address", 2: "Street Name", 3: "Dwelling Number" },
  XTN: {
    1: "Telephone Number", 2: "Telecommunication Use Code",
    3: "Telecommunication Equipment Type", 4: "Email Address",
    5: "Country Code", 6: "Area/City Code", 7: "Local Number",
    8: "Extension", 9: "Any Text"
  },
  XON: {
    1: "Organization Name", 2: "Organization Name Type Code", 3: "ID Number",
    4: "Check Digit", 5: "Check Digit Scheme", 6: "Assigning Authority",
    7: "Identifier Type Code", 8: "Assigning Facility",
    9: "Name Representation Code", 10: "Organization Identifier"
  },
  CE: {
    1: "Identifier", 2: "Text", 3: "Name of Coding System",
    4: "Alternate Identifier", 5: "Alternate Text",
    6: "Name of Alternate Coding System"
  },
  CWE: {
    1: "Identifier", 2: "Text", 3: "Name of Coding System",
    4: "Alternate Identifier", 5: "Alternate Text",
    6: "Name of Alternate Coding System", 7: "Coding System Version ID",
    8: "Alternate Coding System Version ID", 9: "Original Text"
  },
  PL: {
    1: "Point of Care", 2: "Room", 3: "Bed", 4: "Facility",
    5: "Location Status", 6: "Person Location Type", 7: "Building",
    8: "Floor", 9: "Location Description"
  },
  TS: { 1: "Time", 2: "Degree of Precision" },
  DR: { 1: "Range Start Date/Time", 2: "Range End Date/Time" },
  DLN: { 1: "License Number", 2: "Issuing State/Province/Country", 3: "Expiration Date" },
  CQ: { 1: "Quantity", 2: "Units" },
  CP: {
    1: "Price", 2: "Price Type", 3: "From Value", 4: "To Value",
    5: "Range Units", 6: "Range Type"
  },
  MOC: { 1: "Monetary Amount", 2: "Charge Code" },
  VID: { 1: "Version ID", 2: "Internationalization Code", 3: "International Version ID" },
  PT: { 1: "Processing ID", 2: "Processing Mode" },
  FC: { 1: "Financial Class Code", 2: "Effective Date" },
  JCC: { 1: "Job Code", 2: "Job Class", 3: "Job Description Text" },
  NDL: {
    1: "Name", 2: "Start Date/Time", 3: "End Date/Time", 4: "Point of Care",
    5: "Room", 6: "Bed", 7: "Facility", 8: "Location Status",
    9: "Person Location Type", 10: "Building", 11: "Floor"
  }
};

/* field index -> datatype, per segment (v2.4). 2.3 reuses this map. */
var DT_24 = {
  MSH: {
    1: "ST", 2: "ST", 3: "HD", 4: "HD", 5: "HD", 6: "HD", 7: "TS", 8: "ST",
    9: "MSG", 10: "ST", 11: "PT", 12: "VID", 13: "NM", 14: "ST", 15: "ID",
    16: "ID", 17: "ID", 18: "ID", 19: "CE", 20: "ID", 21: "ID"
  },
  MSA: { 1: "ID", 2: "ST", 3: "ST", 4: "NM", 5: "ST", 6: "CE" },
  EVN: { 1: "ID", 2: "TS", 3: "TS", 4: "IS", 5: "XCN", 6: "TS", 7: "HD" },
  PID: {
    1: "SI", 2: "CX", 3: "CX", 4: "CX", 5: "XPN", 6: "XPN", 7: "TS", 8: "IS",
    9: "XPN", 10: "CE", 11: "XAD", 12: "IS", 13: "XTN", 14: "XTN", 15: "CE",
    16: "CE", 17: "CE", 18: "CX", 19: "ST", 20: "DLN", 21: "CX", 22: "CE",
    23: "ST", 24: "ID", 25: "NM", 26: "CE", 27: "CE", 28: "CE", 29: "TS",
    30: "ID", 31: "ID", 32: "IS", 33: "TS", 34: "HD", 35: "CE", 36: "CE",
    37: "ST", 38: "CE"
  },
  PD1: {
    1: "IS", 2: "IS", 3: "XON", 4: "XCN", 5: "IS", 6: "CE", 7: "CE", 8: "ID",
    9: "ID", 10: "IS", 11: "CE", 12: "ID", 13: "TS"
  },
  NK1: {
    1: "SI", 2: "XPN", 3: "CE", 4: "XAD", 5: "XTN", 6: "XTN", 7: "CE", 8: "DT",
    9: "DT", 10: "ST", 11: "JCC", 12: "CX", 13: "XON", 14: "CE", 15: "IS",
    16: "TS", 17: "IS", 18: "IS", 19: "IS", 20: "CE", 21: "CE", 22: "CE",
    23: "ID", 24: "CE", 25: "CE", 26: "CE", 27: "CE", 28: "CE", 29: "CE",
    30: "XPN", 31: "XTN", 32: "XAD", 33: "CX"
  },
  PV1: {
    1: "SI", 2: "IS", 3: "PL", 4: "IS", 5: "CX", 6: "PL", 7: "XCN", 8: "XCN",
    9: "XCN", 10: "IS", 11: "PL", 12: "IS", 13: "IS", 14: "IS", 15: "IS",
    16: "IS", 17: "XCN", 18: "IS", 19: "CX", 20: "FC", 21: "IS", 22: "IS",
    23: "IS", 24: "IS", 25: "DT", 26: "NM", 27: "NM", 28: "IS", 29: "IS",
    30: "DT", 31: "IS", 32: "NM", 33: "NM", 34: "IS", 35: "DT", 36: "IS",
    37: "DLD", 38: "CE", 39: "IS", 40: "IS", 41: "IS", 42: "PL", 43: "PL",
    44: "TS", 45: "TS", 46: "NM", 47: "NM", 48: "NM", 49: "NM", 50: "CX",
    51: "IS", 52: "XCN"
  },
  PV2: {
    1: "PL", 2: "CE", 3: "CE", 4: "CE", 5: "CE", 6: "CE", 7: "CE", 8: "TS",
    9: "TS", 10: "ST", 11: "NM", 12: "ST"
  },
  ORC: {
    1: "ID", 2: "EI", 3: "EI", 4: "EI", 5: "ID", 6: "ID", 7: "TQ", 8: "EIP",
    9: "TS", 10: "XCN", 11: "XCN", 12: "XCN", 13: "PL", 14: "XTN", 15: "TS",
    16: "CE", 17: "XON", 18: "CE", 19: "XCN", 20: "ID", 21: "XON", 22: "XAD",
    23: "XTN", 24: "XAD", 25: "CWE"
  },
  OBR: {
    1: "SI", 2: "EI", 3: "EI", 4: "CE", 5: "ID", 6: "TS", 7: "TS", 8: "TS",
    9: "CQ", 10: "XCN", 11: "ID", 12: "CE", 13: "ST", 14: "TS", 15: "CM",
    16: "XCN", 17: "XTN", 18: "ST", 19: "ST", 20: "ST", 21: "ST", 22: "TS",
    23: "MOC", 24: "ID", 25: "ID", 26: "CE", 27: "TQ", 28: "XCN", 29: "CM",
    30: "ID", 31: "CE", 32: "CM", 33: "CM", 34: "CM", 35: "CM",
    36: "TS", 37: "NM", 38: "CE", 39: "CE", 40: "CE", 41: "ID", 42: "ID",
    43: "CE", 44: "CE", 45: "CE", 46: "CE", 47: "CE"
  },
  OBX: {
    1: "SI", 2: "ID", 3: "CE", 4: "ST", 5: "Varies", 6: "CE", 7: "ST",
    8: "IS", 9: "NM", 10: "ID", 11: "ID", 12: "TS", 13: "ST", 14: "TS",
    15: "CE", 16: "XCN", 17: "CE", 18: "EI", 19: "TS"
  },
  AL1: { 1: "SI", 2: "CE", 3: "CE", 4: "CE", 5: "ID", 6: "DT" },
  DG1: {
    1: "SI", 2: "ID", 3: "CE", 4: "ST", 5: "TS", 6: "IS", 7: "CE", 8: "NM",
    9: "CE", 10: "ID", 11: "CE", 12: "ID", 13: "NM", 14: "ID", 15: "NM",
    16: "XCN", 17: "ID", 18: "EI", 19: "TS"
  },
  GT1: {
    1: "SI", 2: "CX", 3: "XPN", 4: "XPN", 5: "XAD", 6: "XTN", 7: "XTN",
    8: "TS", 9: "IS", 10: "IS", 11: "CE", 12: "ST", 13: "ID", 14: "ST"
  },
  IN1: {
    1: "SI", 2: "CE", 3: "CX", 4: "XON", 5: "XAD", 6: "XPN", 7: "XTN",
    8: "ST", 9: "XON", 10: "CX", 11: "XON", 12: "DT", 13: "DT", 14: "CE",
    15: "IS", 16: "XPN", 17: "CE", 18: "TS", 19: "XAD"
  }
};

var DT_23 = JSON.parse(JSON.stringify(DT_24));
DT_23.MSH[9] = "CM";
delete DT_23.MSH[21];
delete DT_23.EVN[7];
[31, 32, 33, 34, 35, 36, 37, 38].forEach(function (field) {
  delete DT_23.PID[field];
});
delete DT_23.ORC[25];
[46, 47].forEach(function (field) {
  delete DT_23.OBR[field];
});
[18, 19].forEach(function (field) {
  delete DT_23.OBX[field];
});

window.DATATYPE_BY_FIELD = { "2.4": DT_24, "2.3": DT_23 };
