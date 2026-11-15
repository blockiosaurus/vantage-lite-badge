-- Get Vantage: the full Vantage terminal for this badge's owner. The server
-- mints a signed link (it knows the owner from the badge server's signature);
-- the phone scans it, signs in to Vantage, and that account gets access. One
-- account per badge owner. The link lasts 10 minutes; SELECT makes a new one.
local api = require("lib.api")
local nav = require("lib.nav")
local theme = require("lib.theme")

local V = {}
local w = {}
local expires = nil   -- sys.time() when the code stops working, if the clock is synced
local left = nil      -- else seconds left, counted down here

local function mmss(s)
  return string.format("%d:%02d", s // 60, s % 60)
end

local function load()
  w.status:text("Making your code...")
  w.status:color(theme.MUTED_FG)
  if w.qr then w.qr:show(false) end
  api.post("/v1/vantage-access", {}, function(ok, d)
    if not ok then
      w.status:text(d)
      w.status:color(theme.DOWN)
      return
    end
    local now = sys.time()
    expires = now and d.exp or nil
    left = 600
    if w.qr then
      w.qr:text(d.url)
      w.qr:show(true)
    elseif ui.qr then
      w.qr = ui.qr(8, 34, 160, d.url)
    else
      w.status:text("Needs Solana OS 0.5.3 for QR codes")
      return
    end
    w.status:text("Code works for " .. mmss(left))
  end)
end

local function tick()
  if not (w.qr and left) then return end
  local remaining = expires and (expires - (sys.time() or 0)) or (left - 1)
  left = math.max(0, remaining)
  if left > 0 then
    w.status:text("Code works for " .. mmss(left))
  else
    w.qr:show(false)
    w.status:text("Code expired. SELECT for a new one")
    w.status:color(theme.AMBER)
    left = nil
  end
end

function V.enter()
  w, expires, left = {}, nil, nil
  theme.chrome("Get Vantage", "full terminal")
  local x, cw = 176, ui.W - 184
  theme.label(x, 32, "Vantage on your phone", {size = 14, w = cw})
  theme.label(x, 70, "1  Scan this code", {size = 12, color = theme.MUTED_FG})
  theme.label(x, 88, "2  Sign in", {size = 12, color = theme.MUTED_FG})
  theme.label(x, 106, "3  You're in", {size = 12, color = theme.MUTED_FG})
  theme.label(x, 130, "One account per badge", {size = 12, color = theme.MUTED_FG, w = cw})
  w.status = theme.label(x, 166, "", {size = 12, w = cw})
  theme.hint("SELECT new code   CANCEL back")
  load()
  nav.every(1000, tick)
end

function V.key(k)
  if k == "select" then load() return true end
  return false
end

return V
