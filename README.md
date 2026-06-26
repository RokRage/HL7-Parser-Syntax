# HL7 Message Explorer

Browser-based HL7 v2.x message viewer and field explorer.

## Features

- Paste or load an HL7 message and parse it automatically.
- View segments, fields, raw values, repeat/component breakdowns, and field descriptions.
- Edit field values directly in the breakdown.
- Load bundled sample messages for common ADT, ORU, and ORM workflows.
- Send the current HL7 message to an HTTP endpoint, such as a Mirth Connect HTTP Listener.
- Runs as a static web app with no build step.

## Run Locally

Open `index.html` directly in a browser, or serve the folder with any static file server:

```sh
python3 -m http.server 8766
```

Then open:

```text
http://127.0.0.1:8766/
```

## Sending to Mirth Connect

The app can send HL7 text with an HTTP `POST` from the browser. Configure a Mirth Connect HTTP Listener and use its URL in the Send HTTP dialog.

Browsers cannot open raw TCP sockets, so direct HL7 MLLP/TCP sending is not supported without a bridge/backend. If the Mirth endpoint is on a different origin, configure CORS on the listener/server.

## Project Structure

```text
index.html
assets/css/styles.css
assets/js/app.js
assets/js/samples.js
assets/js/hl7-fields-2x.js
assets/js/hl7-field-desc-2x.js
assets/js/hl7-datatypes-2x.js
```

## Notes

No patient data is sent anywhere unless you use the Send HTTP action. Parsing and field exploration run in the browser.
