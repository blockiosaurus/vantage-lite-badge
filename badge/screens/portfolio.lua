-- What a wallet holds. The wallet is the one this badge last swapped from, or
-- the Solana address the owner linked at /profile.
local api = require("lib.api")
local nav = require("lib.nav")
local rowlib = require("lib.rows")
local store = require("lib.store")
local text = require("lib.text")
local theme = require("lib.theme")
local ticker = require("lib.ticker")

local PF = {}
local held = {}
local note, total, sol, list, status

local function load(wallet)
  note:text(text.short(wallet))
  status:text("Loading...")
  api.get("/v1/portfolio/" .. wallet, function(ok, d)
    if not ok then status:text(d) return end
    status:text("")
    total:text(d.total)
    sol:text(d.sol .. " SOL")
    held = d.items or {}
    local rows = {}
    for i, h in ipairs(held) do
      rows[i] = {title = h.s .. "  " .. h.v, sub = h.a .. " " .. h.s, right = h.cn and string.format("%+.1f%%", h.cn) or ""}
    end
    rowlib.set(list, rows)
  end)
end

function PF.enter()
  held = {}
  note = theme.chrome("Portfolio", "")
  total = ui.label(8, 30, "", {size = 32})
  sol = ui.label(200, 42, "", {size = 14, color = "dim", w = 112, align = "right"})
  list = ui.list(0, 70, ui.W, ui.H - 86, {}, {on_select = function(i)
    local h = held[i]
    if h and h.m ~= ticker.SOL then nav.push(require("screens.token"), {m = h.m, s = h.s}) end
  end})
  status = theme.notice("", 110)
  list:show(false)
  ui.hint("SELECT open   CANCEL back")

  if store.wallet then load(store.wallet) return end
  if not profile then
    status:text("Swap once from this badge and it remembers the wallet")
    return
  end
  status:text("Looking up your linked wallet...")
  profile.me(nav.guard(function(ok, me)
    if ok and me.solana then
      load(me.solana)
    else
      status:text("No wallet yet. Link one at /profile, or swap once from this badge.")
    end
  end))
end

return PF
