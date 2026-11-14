-- A stack of screens. A screen is a table with enter(params) and, optionally,
-- key(k, rep) -> handled, tick(ms) and leave(). Moving between screens clears
-- every UI object, cancels the timers the old screen started, and bumps a
-- generation number so late http answers for an old screen are dropped.
local N = {}

local stack = {}
local timers = {}
local gen = 0

local function stop_timers()
  for _, id in ipairs(timers) do timer.cancel(id) end
  timers = {}
end

local function show(entry)
  gen = gen + 1
  stop_timers()
  ui.clear()
  entry.screen.enter(entry.params or {})
end

local function current()
  return stack[#stack]
end

function N.push(screen, params)
  local top = current()
  if top and top.screen.leave then top.screen.leave() end
  stack[#stack + 1] = {screen = screen, params = params}
  show(stack[#stack])
end

-- Swap the top screen for another (no way back to the one replaced).
function N.replace(screen, params)
  local top = current()
  if top and top.screen.leave then top.screen.leave() end
  stack[#stack] = {screen = screen, params = params}
  show(stack[#stack])
end

-- Back one screen. False when there is nowhere to go (the app should exit).
function N.pop()
  if #stack <= 1 then return false end
  local top = current()
  if top.screen.leave then top.screen.leave() end
  stack[#stack] = nil
  show(stack[#stack])
  return true
end

-- Redraw the current screen from scratch with the same params.
function N.redraw()
  show(current())
end

function N.depth() return #stack end
function N.top() local t = current() return t and t.screen end

-- Timers owned by the current screen: cancelled when it goes.
function N.every(ms, fn)
  local id = timer.every(ms, fn)
  timers[#timers + 1] = id
  return id
end

function N.after(ms, fn)
  local id = timer.after(ms, fn)
  timers[#timers + 1] = id
  return id
end

-- Wrap a callback so it only runs if the screen that asked is still showing.
function N.guard(fn)
  local mine = gen
  return function(...)
    if mine == gen then return fn(...) end
  end
end

function N.key(k, rep)
  local top = current()
  if top and top.screen.key and top.screen.key(k, rep) then return true end
  if k == "back" then return N.pop() end
  return false
end

function N.tick(ms)
  local top = current()
  if top and top.screen.tick then top.screen.tick(ms) end
end

return N
