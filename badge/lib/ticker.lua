-- The background price poll: every 30 s it prices the watchlist and SOL,
-- lights the LEDs and fires price alerts, whatever screen is showing.
local api = require("lib.api")
local leds = require("lib.leds")
local store = require("lib.store")
local text = require("lib.text")

local SOL = "So11111111111111111111111111111111111111112"
local K = {
  prices = {},   -- [mint] = {p = "$1.23", pn = 1.23, c = "+4.0%", cn = 4.0}
  at = nil,      -- sys.millis() of the last answer
}

local running = nil
local listeners = {}

local function mints()
  local list = {}
  for i, w in ipairs(store.watch) do
    if i <= store.MAX_WATCH then list[#list + 1] = w.m end
  end
  list[#list + 1] = SOL
  return list
end


local function check_alerts()
  for mint, a in pairs(store.alerts) do
    local p = K.prices[mint]
    if p and p.pn then
      local hit = (a.above and p.pn >= a.above) or (a.below and p.pn <= a.below)
      if hit then
        local line = a.s .. (a.above and " is above " or " is below ") .. text.price(a.above or a.below)
        store.set_alert(mint, nil)
        ui.toast(line)
        leds.alert()
      end
    end
  end
end

local function light()
  if not store.settings.ticker then return end
  local changes = {}
  for i = 1, 6 do
    local w = store.watch[i]
    local p = w and K.prices[w.m]
    changes[i] = p and p.cn or nil
  end
  local sol = K.prices[SOL]
  leds.ticker(changes, sol and sol.cn)
end

-- Price now; cb(ok, err) once the answer is in.
function K.refresh(cb)
  local ids = table.concat(mints(), ",")
  api.get("/v1/prices?m=" .. ids, function(ok, data)
    if ok then
      for _, it in ipairs(data.items or {}) do K.prices[it.m] = it end
      K.at = sys.millis()
      check_alerts()
      light()
      for _, fn in ipairs(listeners) do fn() end
    end
    if cb then cb(ok, data) end
  end, true)
end

-- Run fn after each refresh while the current screen shows (the screen's
-- leave() must call K.unlisten).
function K.listen(fn) listeners[#listeners + 1] = fn end
function K.unlisten() listeners = {} end

function K.start()
  if running then return end
  K.refresh()
  running = timer.every(30000, function() K.refresh() end)
end

function K.relight()
  if store.settings.ticker then light() else leds.off() end
end

K.SOL = SOL
return K
