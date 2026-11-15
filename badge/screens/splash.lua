-- The launch screen: Metaplex, then Vantage Lite, with a Metaplex Blue sweep
-- across the LEDs. Any key, or 1.6 s, goes on to the menu.
local nav = require("lib.nav")
local theme = require("lib.theme")
local ticker = require("lib.ticker")

local SP = {}
local done = false

local function go()
  if done then return end
  done = true
  nav.replace(require("screens.home"), {})
  ticker.relight()
end

function SP.enter()
  done = false
  ui.bg(theme.FLOOR)
  if ui.image then
    ui.image((ui.W - 217) // 2, 58, "art/metaplex.png")
    ui.image((ui.W - 30) // 2 - 64, 112, "art/vantage-mark.png")
    theme.label((ui.W - 30) // 2 - 26, 114, "Vantage Lite", {size = 20})
  else
    theme.label(0, 56, "METAPLEX", {size = 32, w = ui.W, align = "center"})
    theme.label(0, 112, "Vantage Lite", {size = 20, w = ui.W, align = "center"})
  end
  theme.label(0, 150, "Markets, charts and swaps on your badge", {size = 12, color = theme.MUTED_FG, w = ui.W, align = "center"})
  ui.rect((ui.W - 120) // 2, 178, 120, 2, {color = theme.SECONDARY, radius = 1})
  local fill = ui.rect((ui.W - 120) // 2, 178, 2, 2, {color = theme.PRIMARY, radius = 1})
  local step = 0
  nav.every(80, function()
    step = step + 1
    fill:size(math.min(120, step * 6), 2)
    if led then
      led.off()
      local i = step % 8 + 1
      led.set(i, 0, 82, 255)
    end
  end)
  nav.after(1600, go)
end

function SP.key()
  go()
  return true
end

return SP
