-- A price line on a canvas, from the server's 0..100 points.
local theme = require("lib.theme")

local C = {}

-- Draws into a new canvas at (x, y), w x h pixels; returns the canvas.
function C.draw(x, y, w, h, pts, up)
  local c = ui.canvas(x, y, w, h, {scale = 1})
  c:clear()
  -- a faint midline so a flat chart still reads as a chart
  for gx = 0, w - 1, 6 do c:pixel(gx, h // 2, theme.BORDER) end
  local n = #pts
  if n < 2 then return c end
  local line = up and theme.UP or theme.DOWN
  local fill = up and theme.UP_FILL or theme.DOWN_FILL
  local px, py
  for i = 1, n do
    local cx = ((i - 1) * (w - 1)) // (n - 1)
    local cy = (h - 2) - ((pts[i] * (h - 4)) // 100)
    if px then
      -- fill under the segment, then the line on top
      for fx = px, cx do
        local fy = py + ((cy - py) * (fx - px)) // math.max(1, cx - px)
        c:line(fx, fy + 1, fx, h - 1, fill)
      end
      c:line(px, py, cx, cy, line)
      c:line(px, py - 1, cx, cy - 1, line)
    end
    px, py = cx, cy
  end
  c:rect(px - 2, py - 2, 4, 4, line)
  return c
end

return C
