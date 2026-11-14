-- The server's token rows as ui.list rows.
local R = {}

function R.list(items)
  local rows = {}
  for i, t in ipairs(items) do
    rows[i] = {title = t.s .. "  " .. t.p, sub = "MC " .. t.mc .. "   Vol " .. t.v, right = t.c}
  end
  return rows
end

-- Fill a list, hiding it while it is empty: Solana OS draws "Nothing here
-- yet" in the middle of an empty list, over whatever the screen says there.
function R.set(list, items)
  list:items(items)
  list:show(#items > 0)
end

return R
