-- A Vantage-like palette on the badge: one brand blue used scarcely, market green
-- and red for direction only, everything else from the badge's own theme so it
-- follows Dark/Light.
local T = {
  BLUE = 0x0052FF,
  UP = 0x05B169,
  DOWN = 0xE5394A, -- Vantage's #cf202f, lifted a step to read on the badge's panel
  UP_FILL = 0x06301F,
  DOWN_FILL = 0x3A1016,
  BLUE_FILL = 0x0A1E4D,
}

-- Colour for a change: a number (12.3, -4) or nil.
function T.dir(n)
  if n == nil then return "dim" end
  if n > 0 then return T.UP end
  if n < 0 then return T.DOWN end
  return "dim"
end

-- The bar every screen starts with: VANTAGE, the screen's name, a right-hand note.
-- Returns the right-hand label so a screen can update it.
function T.chrome(title, note)
  ui.bg("bg")
  ui.rect(0, 0, ui.W, 26, {color = "panel"})
  ui.rect(0, 25, ui.W, 1, {color = T.BLUE})
  ui.label(8, 5, "VANTAGE", {size = 14, color = T.BLUE})
  ui.label(84, 5, title or "", {size = 14, color = "text"})
  return ui.label(ui.W - 128, 6, note or "", {size = 12, color = "dim", w = 120, align = "right"})
end

-- A centred line in the body, for loading and empty states.
function T.notice(text, y)
  return ui.label(8, y or 96, text, {size = 14, color = "dim", w = ui.W - 16, align = "center"})
end

return T
