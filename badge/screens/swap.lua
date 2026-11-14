-- The swap: the server builds it with Jupiter's public Swap API for whichever
-- wallet scans the QR code (a Solana Pay transaction request). The badge never
-- holds a key; it shows the code and watches for the transaction to land.
local api = require("lib.api")
local leds = require("lib.leds")
local nav = require("lib.nav")
local store = require("lib.store")
local text = require("lib.text")
local theme = require("lib.theme")

local SW = {}
local w = {}
local id = nil
local poll = nil
local finished = false

local function stop()
  if poll then timer.cancel(poll) poll = nil end
end

local function done(st)
  finished = true
  stop()
  if st.ok then
    leds.celebrate()
    w.status:text("Landed! Scan it")
    w.status:color(theme.UP)
    w.state:text("DONE")
    w.state:color(theme.UP)
    if w.qr then w.qr:text("https://solscan.io/tx/" .. st.sig) end
    if not store.wallet then
      store.wallet = st.w
      store.save()
      ui.toast("Wallet " .. text.short(st.w) .. " saved for Portfolio")
    end
  else
    leds.fail()
    w.status:text("Failed on chain. Only the fee was spent")
    w.status:color(theme.DOWN)
    w.state:text("FAILED")
    w.state:color(theme.DOWN)
    if w.qr then w.qr:text("https://solscan.io/tx/" .. st.sig) end
  end
end

local function check()
  api.get("/v1/swap/" .. id, function(ok, st)
    if finished or not ok then return end
    if st.st == "signing" then
      w.state:text("SIGNING")
      w.status:text("Approve in " .. text.short(st.w))
    elseif st.st == "done" then
      done(st)
    elseif st.st == "expired" then
      finished = true
      stop()
      w.state:text("EXPIRED")
      w.status:text("Nothing landed. Try again")
      leds.off()
    end
  end)
end

function SW.enter(p)
  local t = p.info
  w, id, finished = {}, nil, false
  stop()
  theme.chrome(p.side == "buy" and "Buy" or "Sell", t.s)
  -- QR on the left (160 px), a 136 px column on the right. Each line has
  -- room for what it holds: the route may take two lines, status up to three.
  local x, cw = 176, ui.W - 184
  w.side = ui.label(x, 32, (p.side == "buy" and "BUY " or "SELL ") .. t.s, {size = 20, color = theme.BLUE, w = cw})
  w.amount = ui.label(x, 58, p.side == "buy" and (text.sol(p.lamports) .. " SOL") or (p.percent .. "% of it"), {size = 14, w = cw})
  w.out = ui.label(x, 76, "", {size = 14, color = "dim", w = cw})
  w.route = ui.label(x, 96, "", {size = 12, color = "dim", w = cw})
  w.impact = ui.label(x, 126, "", {size = 12, color = "dim", w = cw})
  w.state = ui.label(x, 146, "PREPARING", {size = 14, color = theme.BLUE, w = cw})
  w.status = ui.label(x, 164, "Getting a quote...", {size = 12, w = cw})
  ui.hint("CANCEL back")
  leds.busy()

  local s = store.settings
  api.post("/v1/swap", {
    side = p.side,
    mint = t.m,
    lamports = p.lamports and tostring(p.lamports) or nil,
    percent = p.percent,
    slippageBps = s.slip,
    tier = s.tier,
  }, function(ok, d)
    leds.off()
    if not ok then
      w.state:text("NO QUOTE")
      w.state:color(theme.DOWN)
      w.status:text(d)
      leds.fail()
      return
    end
    id = d.id
    w.out:text(d.out)
    w.route:text(d.route)
    if d.impact ~= "-" then w.impact:text("Impact " .. d.impact) end
    w.state:text("SCAN")
    w.status:text("Scan in Phantom or Solflare")
    if ui.qr then
      w.qr = ui.qr(8, 34, 160, d.url)
    else
      w.status:text("Needs Solana OS 0.5.3 for QR codes")
      return
    end
    poll = nav.every(3000, check)
  end)
end

function SW.leave()
  stop()
end

return SW
