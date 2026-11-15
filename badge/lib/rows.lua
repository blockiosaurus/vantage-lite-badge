-- The server's token rows as list rows (lib/list.lua).
local R = {}

function R.list(items)
  local rows = {}
  for i, t in ipairs(items) do
    rows[i] = {title = t.s .. "  " .. t.p, sub = "MC " .. t.mc .. "   Vol " .. t.v, right = t.c, rc = t.cn}
  end
  return rows
end

-- Fill a list, hiding it while it is empty, so the screen's own message
-- (loading, nothing found) shows on its own.
function R.set(list, items)
  list:items(items)
  list:show(#items > 0)
end

return R
