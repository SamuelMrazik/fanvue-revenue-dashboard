OFM Revenue Dashboard — frontend files

This zip contains the browser UI only:
  index.html, app.js, chart.js, styles.css, logo.png

The UI expects the Node API server (server.js) on the same origin:
  /api/summary, /api/models, etc.

To run the full app locally:
  cd fanvue-revenue-dashboard-code-only
  npm install
  npm run seed:demo
  npm start
  open http://127.0.0.1:4000

Login (local .env): owner / preview
