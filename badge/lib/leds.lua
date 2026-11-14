-- The badge's eight RGB LEDs as an ambient market display. 1..6 across the
-- top carry the watchlist (one token each: green up, red down, brighter the
-- bigger the move); 7..8 on the edge carry SOL. Swaps get a green chase or a
-- red flash. With no `led` permission or no LEDs, every call does nothing.
local L = {}

local anim = nil

local function ok() return led ~= nil end

local function stop_anim()
  if anim then timer.cancel(anim) anim = nil end
end

-- 0..255 brightness for a change in percent: 1% is faint, 15%+ is full.
local function level(change)
  local a = math.abs(change or 0)
  if a < 0.5 then return 12 end
  local v = 40 + math.floor(a * 14)
  if v > 255 then v = 255 end
  return v
end

local function paint(i, change)
  if change == nil then led.set(i, 0, 0, 0) return end
  local v = level(change)
  if change >= 0 then led.set(i, 0, v, v // 3) else led.set(i, v, 0, v // 8) end
end

-- changes: list of up to 6 numbers (or nil), sol: SOL's change.
function L.ticker(changes, sol)
  if not ok() or anim then return end
  for i = 1, 6 do paint(i, changes[i]) end
  paint(7, sol)
  paint(8, sol)
end

-- Market mood 0..100 as a bar: red at fear, green at greed.
function L.mood(value)
  if not ok() or anim then return end
  local lit = math.max(1, math.min(8, (value * 8 + 50) // 100))
  local r = math.floor(255 * (100 - value) / 100)
  local g = math.floor(255 * value / 100)
  for i = 1, 8 do
    if i <= lit then led.set(i, r // 2, g // 2, 0) else led.set(i, 0, 0, 0) end
  end
end

-- A blue glow while waiting on the network.
function L.busy()
  if not ok() or anim then return end
  led.fill(0, 20, 90)
end

function L.off()
  if not ok() then return end
  stop_anim()
  led.off()
end

-- A swap landed: a green chase across the top, three times round.
function L.celebrate()
  if not ok() then return end
  stop_anim()
  local step = 0
  anim = timer.every(60, function()
    step = step + 1
    led.off()
    local pos = step % 8 + 1
    led.set(pos, 5, 241, 105)
    led.set((pos % 8) + 1, 0, 90, 40)
    if step >= 24 then
      stop_anim()
      led.fill(5, 241, 105)
      timer.after(600, function() led.off() end)
    end
  end)
end

-- Something went wrong: two red flashes.
function L.fail()
  if not ok() then return end
  stop_anim()
  local step = 0
  anim = timer.every(150, function()
    step = step + 1
    if step % 2 == 1 then led.fill(229, 57, 74) else led.off() end
    if step >= 4 then stop_anim() led.off() end
  end)
end

-- An alert fired: a blue flash on every LED.
function L.alert()
  if not ok() then return end
  stop_anim()
  local step = 0
  anim = timer.every(120, function()
    step = step + 1
    if step % 2 == 1 then led.fill(0, 82, 255) else led.off() end
    if step >= 6 then stop_anim() led.off() end
  end)
end

return L
