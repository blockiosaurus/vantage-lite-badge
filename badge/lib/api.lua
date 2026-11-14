-- The Vantage Lite server, through the badge server's http. Every answer is
-- JSON; cb(true, data) or cb(false, "a short reason a person can read").
local config = require("lib.config")
local nav = require("lib.nav")

local A = {}

local REASONS = {
  offline = "Wi-Fi is off",
  ["not linked"] = "Claim this badge first",
  denied = "Not allowed (publish or test-run the app)",
  busy = "Busy, try again",
  timeout = "Server took too long",
  ["too fast"] = "Slow down a moment",
  ["host not allowed"] = "Server not in app.json hosts",
  unreachable = "Server unreachable",
  ["socket open"] = "Busy, try again",
}

local function finish(cb)
  return function(ok, res)
    if not ok then
      cb(false, REASONS[res] or tostring(res))
      return
    end
    local data = json.decode(res.body or "")
    if res.status ~= 200 then
      cb(false, (type(data) == "table" and data.error) or ("Server said " .. tostring(res.status)))
      return
    end
    if type(data) ~= "table" then
      cb(false, res.truncated and "Answer too big" or "Bad answer")
      return
    end
    cb(true, data)
  end
end

-- `cb` only runs if the screen that asked is still the one showing, unless
-- `keep` is true (the ticker keeps its answers whatever screen is up).
function A.get(path, cb, keep)
  local done = finish(cb)
  http.get(config.SERVER .. path, keep and done or nav.guard(done))
end

function A.post(path, body, cb, keep)
  local done = finish(cb)
  http.post(config.SERVER .. path, body, keep and done or nav.guard(done))
end

return A
