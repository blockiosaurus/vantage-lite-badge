-- A QR code with a caption: links for a phone to open.
local theme = require("lib.theme")

local Q = {}

function Q.enter(p)
  theme.chrome(p.title or "", "scan me")
  if not ui.qr then
    theme.notice("Needs Solana OS 0.5.3 for QR codes", 96)
    return
  end
  ui.qr(8, 32, 168, p.text)
  ui.label(186, 40, p.caption or "", {size = 14, w = ui.W - 194})
  ui.hint("CANCEL back")
end

return Q
