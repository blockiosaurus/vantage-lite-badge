-- One question, one answer, paged two blocks at a time.
local api = require("lib.api")
local leds = require("lib.leds")
local nav = require("lib.nav")
local text = require("lib.text")
local theme = require("lib.theme")
local ticker = require("lib.ticker")

local AN = {}
local PER_PAGE = 2
local blocks = {}
local page = 1
local labels = {}
local note

local function show()
  for i = 1, PER_PAGE do
    local b = blocks[(page - 1) * PER_PAGE + i]
    labels[i]:text(b or "")
  end
  local pages = math.max(1, (#blocks + PER_PAGE - 1) // PER_PAGE)
  note:text(page .. "/" .. pages)
end

function AN.enter(p)
  blocks, page = {}, 1
  note = theme.chrome("Ask Vantage", "")
  ui.label(8, 30, p.q, {size = 12, color = "dim", w = ui.W - 16})
  labels[1] = ui.label(8, 56, "Thinking...", {size = 14, w = ui.W - 16})
  labels[2] = ui.label(8, 128, "", {size = 14, w = ui.W - 16})
  ui.hint("^v more   CANCEL back")
  leds.busy()
  api.post("/v1/ask", {q = p.q, mint = p.m}, function(ok, d)
    ticker.relight()
    if not ok then
      labels[1]:text(d)
      return
    end
    blocks = text.chunks(d.a, 150)
    show()
  end)
end

function AN.key(k)
  if #blocks == 0 then return false end
  local pages = (#blocks + PER_PAGE - 1) // PER_PAGE
  if k == "down" and page < pages then page = page + 1 show() return true end
  if k == "up" and page > 1 then page = page - 1 show() return true end
  return k == "up" or k == "down"
end

function AN.leave()
  ticker.relight()
end

return AN
