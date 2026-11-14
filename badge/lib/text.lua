-- Text helpers for a screen whose labels hold at most 200 bytes each.
local X = {}

-- Split `s` into pieces of at most `max` bytes, breaking between words.
function X.chunks(s, max)
  local out = {}
  local cur = ""
  for w in s:gmatch("%S+") do
    local word = #w > max and w:sub(1, max) or w -- 5.5: loop variables are read-only
    if cur == "" then
      cur = word
    elseif #cur + 1 + #word <= max then
      cur = cur .. " " .. word
    else
      out[#out + 1] = cur
      cur = word
    end
  end
  if cur ~= "" then out[#out + 1] = cur end
  return out
end

-- SOL from lamports (a 32-bit integer): 100000000 -> "0.1".
function X.sol(lamports)
  local s = string.rep("0", 10) .. tostring(lamports)
  local whole = s:sub(1, -10):gsub("^0+", "")
  local frac = s:sub(-9):gsub("0+$", "")
  return (whole == "" and "0" or whole) .. (frac ~= "" and "." .. frac or "")
end

-- A price from a number, in plain decimals: 0.00002198 -> "$0.00002198".
-- (The server formats prices it sends; this is for ones the badge computes,
-- such as alert targets. 32-bit floats carry about 7 digits, plenty here.)
function X.price(n)
  if n >= 1 then return string.format("$%.2f", n) end
  if n <= 0 then return "$0" end
  local d = math.min(10, 3 - math.floor(math.log(n, 10)))
  local s = string.format("%." .. d .. "f", n):gsub("0+$", "")
  return "$" .. s
end

-- Basis points as a percent: 100 -> "1%", 50 -> "0.5%".
function X.bps(bps)
  if bps % 100 == 0 then return (bps // 100) .. "%" end
  return string.format("%g%%", bps / 100)
end

function X.short(addr)
  if not addr or #addr < 10 then return addr or "" end
  return addr:sub(1, 4) .. ".." .. addr:sub(-4)
end

return X
