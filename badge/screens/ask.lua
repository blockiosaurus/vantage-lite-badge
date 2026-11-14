-- Ask Vantage: canned questions a d-pad can pick, or type one.
local nav = require("lib.nav")
local theme = require("lib.theme")

local AK = {}

function AK.enter(p)
  theme.chrome("Ask Vantage", p.s or "market")
  local qs = {}
  if p.m then
    qs = {
      "Is " .. p.s .. " safe to trade?",
      "Why is " .. p.s .. " moving today?",
      "Sum up " .. p.s .. " in two lines.",
    }
  end
  qs[#qs + 1] = "What's moving right now?"
  qs[#qs + 1] = "How is the market mood?"
  local items = {}
  for i, q in ipairs(qs) do items[i] = {title = q} end
  items[#items + 1] = {title = "Type a question...", sub = "d-pad keyboard"}
  ui.list(0, 30, ui.W, ui.H - 46, items, {on_select = function(i)
    if qs[i] then
      nav.push(require("screens.answer"), {q = qs[i], m = p.m})
    else
      ui.input("Ask Vantage", 60, function(q)
        if q and #q >= 3 then nav.push(require("screens.answer"), {q = q, m = p.m}) end
      end)
    end
  end})
  ui.hint("SELECT ask   CANCEL back")
end

return AK
