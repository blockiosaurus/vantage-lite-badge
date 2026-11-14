-- The server's token rows as ui.list rows.
local R = {}

function R.list(items)
  local rows = {}
  for i, t in ipairs(items) do
    rows[i] = {title = t.s .. "  " .. t.p, sub = "MC " .. t.mc .. "   Vol " .. t.v, right = t.c}
  end
  return rows
end

return R
