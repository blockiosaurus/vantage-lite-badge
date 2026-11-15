-- Watched tokens with live prices. The first six are the six top LEDs.
local nav = require("lib.nav")
local store = require("lib.store")
local listui = require("lib.list")
local theme = require("lib.theme")
local ticker = require("lib.ticker")

local WL = {}
local list, status

local function rows()
  local out = {}
  for i, w in ipairs(store.watch) do
    local p = ticker.prices[w.m]
    local tag = i <= 6 and ("LED " .. i) or ""
    if store.alerts[w.m] then tag = tag .. (tag ~= "" and "  " or "") .. "alert set" end
    out[i] = {title = w.s .. "  " .. (p and p.p or "..."), sub = tag, right = p and p.c or "", rc = p and p.cn}
  end
  return out
end

function WL.enter()
  theme.chrome("Watchlist", #store.watch .. "/" .. store.MAX_WATCH)
  if #store.watch == 0 then
    theme.notice("Nothing watched yet.", 80)
    theme.notice("Open a token, press SELECT, Watch.", 104)
    theme.notice("Watched tokens light the LEDs.", 128)
    theme.hint("CANCEL back")
    return
  end
  list = listui.new(0, 30, ui.W, ui.H - 46, rows(), {on_select = function(i)
    local w = store.watch[i]
    if w then nav.push(require("screens.token"), {m = w.m, s = w.s}) end
  end})
  status = theme.label(8, 186, "", {size = 12, color = theme.MUTED_FG})
  theme.hint("SELECT open   CANCEL back")
  ticker.listen(function()
    local sel = list:selected()
    list:items(rows())
    if sel then list:select(sel) end
  end)
  ticker.refresh(nav.guard(function(ok, err)
    if not ok then ui.toast(err) end
  end))
end

function WL.leave()
  ticker.unlisten()
end

return WL
