-- Where the Vantage Lite server runs (server/ in this repo). It has to match
-- "hosts" in app.json: the badge server refuses any other host.
return {
  SERVER = "https://vantage-lite.example.workers.dev",
  VERSION = "1.0.0",
}
