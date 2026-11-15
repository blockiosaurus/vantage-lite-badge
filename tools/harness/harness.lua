-- A stand-in Solana OS for badge apps: the ui, http, timer, led, storage,
-- profile, sys, badge and json modules of docs/LUA_API.md, recorded instead
-- of drawn, with the limits that bite (128 UI objects, 200-byte labels,
-- 8 timers, 256-byte QR text, 2 KB request bodies) checked as errors. The app
-- runs in a sandbox table holding only what a badge gives it, on the badge's
-- own Lua 5.5 (32-bit numbers), built by run.sh.

local APP_DIR, FIXTURES = arg[1], arg[2]
local SERVER = "https://vantage-lite-badge-production.up.railway.app"
local WALLET = "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr"

------------------------------------------------------------------ json
local json = {}
do
  local function skip(s, i)
    return s:find("[^ \t\r\n]", i) or #s + 1
  end
  local decode_value
  local ESC = {['"'] = '"', ["\\"] = "\\", ["/"] = "/", b = "\b", f = "\f", n = "\n", r = "\r", t = "\t"}
  local function decode_string(s, i)
    local out, j = {}, i + 1
    while true do
      local c = s:sub(j, j)
      if c == "" then error("unterminated string") end
      if c == '"' then return table.concat(out), j + 1 end
      if c == "\\" then
        local e = s:sub(j + 1, j + 1)
        if e == "u" then
          out[#out + 1] = utf8.char(tonumber(s:sub(j + 2, j + 5), 16))
          j = j + 6
        else
          out[#out + 1] = ESC[e] or e
          j = j + 2
        end
      else
        out[#out + 1] = c
        j = j + 1
      end
    end
  end
  decode_value = function(s, i)
    i = skip(s, i)
    local c = s:sub(i, i)
    if c == "{" then
      local t = {}
      i = skip(s, i + 1)
      if s:sub(i, i) == "}" then return t, i + 1 end
      while true do
        local k
        k, i = decode_string(s, skip(s, i))
        i = skip(s, i)
        assert(s:sub(i, i) == ":", "expected :")
        local v
        v, i = decode_value(s, i + 1)
        t[k] = v
        i = skip(s, i)
        local d = s:sub(i, i)
        if d == "}" then return t, i + 1 end
        assert(d == ",", "expected , in object")
        i = i + 1
      end
    elseif c == "[" then
      local t, n = {}, 0
      i = skip(s, i + 1)
      if s:sub(i, i) == "]" then return t, i + 1 end
      while true do
        local v
        v, i = decode_value(s, i)
        n = n + 1
        t[n] = v
        i = skip(s, i)
        local d = s:sub(i, i)
        if d == "]" then return t, i + 1 end
        assert(d == ",", "expected , in array")
        i = i + 1
      end
    elseif c == '"' then
      return decode_string(s, i)
    elseif s:sub(i, i + 3) == "true" then
      return true, i + 4
    elseif s:sub(i, i + 4) == "false" then
      return false, i + 5
    elseif s:sub(i, i + 3) == "null" then
      return nil, i + 4
    else
      local num = s:match("^-?%d+%.?%d*[eE]?[-+]?%d*", i)
      assert(num and #num > 0, "bad json at " .. i)
      return tonumber(num), i + #num
    end
  end
  function json.decode(s)
    if type(s) ~= "string" then return nil, "not a string" end
    local ok, v = pcall(decode_value, s, 1)
    if not ok then return nil, v end
    return v
  end
  local function encode(v)
    local t = type(v)
    if t == "nil" then return "null" end
    if t == "boolean" then return tostring(v) end
    if t == "number" then
      if math.type(v) == "integer" then return tostring(v) end
      return string.format("%.7g", v)
    end
    if t == "string" then
      return '"' .. v:gsub('[%c"\\]', function(ch)
        return string.format("\\u%04x", ch:byte())
      end) .. '"'
    end
    assert(t == "table", "can't encode a " .. t)
    if next(v) == nil then return "{}" end
    if #v > 0 then
      local out = {}
      for i = 1, #v do out[i] = encode(v[i]) end
      return "[" .. table.concat(out, ",") .. "]"
    end
    local keys = {}
    for k in pairs(v) do keys[#keys + 1] = tostring(k) end
    table.sort(keys)
    local out = {}
    for _, k in ipairs(keys) do out[#out + 1] = encode(k) .. ":" .. encode(v[k]) end
    return "{" .. table.concat(out, ",") .. "}"
  end
  json.encode = encode
end

local fixtures = assert(json.decode(assert(read_file(FIXTURES))), "bad fixtures")

------------------------------------------------------------------ the badge
local B -- the badge under test, rebuilt by boot()

local function fail(msg) error(msg, 3) end

local function new_badge(saved)
  local b = {
    now = 0, timers = {}, next_timer = 1, objs = {}, toasts = {}, hint = "",
    pending = {}, requests = {}, inputs = {}, leds = {}, exited = false,
    storage = saved or {}, offline = false, overrides = {}, swap_poll = 0, bg = nil,
  }
  for i = 1, 8 do b.leds[i] = {0, 0, 0} end
  return b
end

local function live()
  local n = 0
  for _, o in ipairs(B.objs) do if not o.removed then n = n + 1 end end
  return n
end

local function add(o)
  o.visible = true
  B.objs[#B.objs + 1] = o
  if live() > 128 then fail("over 128 UI objects") end
  return o
end

local function check_text(fn, s)
  if type(s) ~= "string" then fail(fn .. ": text must be a string, got " .. type(s)) end
  if #s > 200 then fail(fn .. ": over 200 bytes: " .. s) end
end

local function colour(c)
  if c == nil or type(c) == "number" then return end
  local ok = {text = 1, dim = 1, bg = 1, panel = 1, border = 1, purple = 1, green = 1, pink = 1,
    lpurple = 1, blue = 1, aqua = 1, lime = 1, yellow = 1, orange = 1}
  if not ok[c] then fail("unknown theme colour " .. tostring(c)) end
end

local common = {}
function common:pos(x, y) self.x, self.y = x, y end
function common:show(v) self.visible = v ~= false end
function common:remove() self.removed = true end
function common:color(c) colour(c) self.colour = c end
local function object(kind, t)
  t.kind = kind
  return setmetatable(t, {__index = function(_, k) return common[k] end})
end

local ui = {W = 320, H = 218}
function ui.bg(c) colour(c) B.bg = c end
function ui.label(x, y, text, opts)
  check_text("ui.label", text)
  opts = opts or {}
  colour(opts.color)
  if opts.size and not ({[12] = 1, [14] = 1, [20] = 1, [32] = 1})[opts.size] then fail("label size " .. opts.size) end
  if opts.align and opts.align ~= "left" and not opts.w then fail("align needs w") end
  local l = object("label", {x = x, y = y, value = text, colour = opts.color, size = opts.size or 14, w = opts.w, align = opts.align})
  function l:text(s) check_text("label:text", s) self.value = s end
  return add(l)
end
function ui.rect(x, y, w, h, opts)
  colour(opts and opts.color)
  local r = object("rect", {x = x, y = y, w = w, h = h, colour = opts and opts.color, radius = opts and opts.radius})
  function r:size(nw, nh) self.w, self.h = nw, nh end
  return add(r)
end
function ui.bar(x, y, w, h, value)
  local b = object("bar", {x = x, y = y, w = w, h = h, value = value})
  function b:set(v)
    if type(v) ~= "number" or v < 0 or v > 100 then fail("bar:set 0..100, got " .. tostring(v)) end
    self.value = v
  end
  return add(b)
end
function ui.gradient(x, y, w, h) return add(object("gradient", {x = x, y = y})) end
local function check_rows(items)
  if type(items) ~= "table" then fail("ui.list items must be a table") end
  for i, it in ipairs(items) do
    if type(it) == "table" then
      check_text("list row title", it.title or "")
      if it.sub then check_text("list row sub", it.sub) end
      if it.right then check_text("list row right", it.right) end
    elseif type(it) ~= "string" then
      fail("list row " .. i .. " must be a string or table")
    end
  end
end
function ui.list(x, y, w, h, items, opts)
  check_rows(items)
  local l = object("list", {x = x, y = y, w = w, h = h, rows = items, sel = 1, opts = opts or {}})
  function l:items(new) check_rows(new) self.rows = new if self.sel > #new then self.sel = math.max(1, #new) end end
  function l:selected() return #self.rows > 0 and self.sel or nil end
  function l:select(i) self.sel = i end
  return add(l)
end
function ui.qr(x, y, size, text)
  if size < 25 or size > 218 then fail("qr size 25..218") end
  if #text > 256 then fail("qr text over 256 bytes") end
  local q = object("qr", {x = x, y = y, size = size, value = text})
  function q:text(s) if #s > 256 then fail("qr text over 256 bytes") end self.value = s end
  return add(q)
end
function ui.canvas(x, y, w, h, opts)
  if w > 1024 or h > 1024 then fail("canvas over 1024 px a side") end
  local c = object("canvas", {x = x, y = y, w = w, h = h, draws = {}})
  local function arg(n) if type(n) ~= "number" then fail("canvas: number expected") end end
  local function draw(op) c.draws[#c.draws + 1] = op end
  function c:clear() self.draws = {} end
  function c:pixel(px, py, col) arg(px) arg(py) colour(col) draw({"p", px, py, col}) end
  function c:rect(px, py, rw, rh, col) arg(px) arg(rw) colour(col) draw({"r", px, py, rw, rh, col}) end
  function c:line(x1, y1, x2, y2, col) arg(x1) arg(y1) arg(x2) arg(y2) colour(col) draw({"l", x1, y1, x2, y2, col}) end
  function c:image() end
  function c:get() return nil end
  return add(c)
end
function ui.hint(s) check_text("ui.hint", s) B.hint = s end
function ui.toast(s) check_text("ui.toast", s) B.toasts[#B.toasts + 1] = s end
function ui.confirm(text, cb) B.inputs[#B.inputs + 1] = {kind = "confirm", text = text, cb = cb} end
function ui.input(prompt, max, cb) B.inputs[#B.inputs + 1] = {kind = "input", text = prompt, max = max, cb = cb} end
function ui.clear()
  for _, o in ipairs(B.objs) do o.removed = true end
  B.objs = {}
end

local function live_timers()
  local n = 0
  for _ in pairs(B.timers) do n = n + 1 end
  return n
end

local timer = {}
local function schedule(ms, fn, every)
  if type(fn) ~= "function" then fail("timer: function expected") end
  if ms < 20 then fail("timer under 20 ms") end
  local id = B.next_timer
  B.next_timer = id + 1
  B.timers[id] = {at = B.now + ms, ms = ms, fn = fn, every = every}
  if live_timers() > 8 then fail("over 8 timers") end
  return id
end
function timer.after(ms, fn) return schedule(ms, fn, false) end
function timer.every(ms, fn) return schedule(ms, fn, true) end
function timer.cancel(id) if id then B.timers[id] = nil end end

local function route(method, url, body)
  if url:sub(1, #SERVER) ~= SERVER then fail("http to a host not in app.json: " .. url) end
  local path = url:sub(#SERVER + 1)
  B.requests[#B.requests + 1] = method .. " " .. path
  -- The most specific override that matches wins.
  local best, best_len
  for pattern, answer in pairs(B.overrides) do
    if path:find(pattern) and (not best_len or #pattern > best_len) then best, best_len = answer, #pattern end
  end
  if best then return best end
  local p = path:gsub("%?.*$", "")
  local key
  if p == "/v1/pulse" then key = "pulse"
  elseif p:find("^/v1/list/") then key = "list/" .. p:sub(10)
  elseif p == "/v1/search" then key = "search"
  elseif p:find("^/v1/token/") then key = "token"
  elseif p:find("^/v1/chart/") then key = "chart"
  elseif p == "/v1/prices" then key = "prices"
  elseif p:find("^/v1/portfolio/") then key = "portfolio"
  elseif p == "/v1/swap" and method == "POST" then key = "swap"
  elseif p:find("^/v1/swap/") then
    B.swap_poll = math.min(B.swap_poll + 1, #fixtures["swap-status"])
    return {status = 200, data = fixtures["swap-status"][B.swap_poll]}
  elseif p == "/v1/ask" then key = "ask"
  end
  if not key or fixtures[key] == nil then return {status = 404, data = {error = "not found"}} end
  return {status = 200, data = fixtures[key]}
end

local function request(method, url, body, cb)
  if type(cb) ~= "function" then fail("http: callback expected") end
  if not url:find("^https://") or url:find(" ") then fail("http: bad url " .. url) end
  if body ~= nil then
    local text = type(body) == "table" and json.encode(body) or body
    if #text > 2048 then fail("http body over 2 KB") end
  end
  B.pending[#B.pending + 1] = function()
    if B.offline then cb(false, "offline") return end
    local a = route(method, url, body)
    if a.fail then cb(false, a.fail) return end
    cb(true, {status = a.status, body = json.encode(a.data), type = "application/json", truncated = false})
  end
end

local http = {}
function http.get(url, a, b) request("GET", url, nil, b or a) end
function http.post(url, body, a, b) request("POST", url, body, b or a) end

local led = {count = 8}
local function byte(v) if type(v) ~= "number" or v < 0 or v > 255 then fail("led value 0..255, got " .. tostring(v)) end end
function led.set(i, r, g, b) if i < 1 or i > 8 then fail("led index") end byte(r) byte(g) byte(b) B.leds[i] = {r, g, b} end
function led.hex(i, c) led.set(i, (c >> 16) & 255, (c >> 8) & 255, c & 255) end
function led.fill(r, g, b) for i = 1, 8 do led.set(i, r, g, b) end end
function led.off() for i = 1, 8 do B.leds[i] = {0, 0, 0} end end

local storage = {}
function storage.get(k) local v = B.storage[k] if v == nil then return nil end return json.decode(v) end
function storage.set(k, v) B.storage[k] = json.encode(v) end
function storage.remove(k) B.storage[k] = nil end

local profile = {}
function profile.me(cb)
  B.pending[#B.pending + 1] = function() cb(true, {name = "tester", solana = B.linked_wallet}) end
end

local sys = {}
function sys.millis() return B.now end
function sys.time() return 1790000000 + B.now // 1000 end
function sys.keys() return {} end
function sys.memory() return {used = 0, max = 6291456} end
function sys.exit() B.exited = true end

local badge = {}
function badge.id() return "7K2Q9M" end
function badge.owner() return "@tester" end
function badge.online() return not B.offline end

------------------------------------------------------------------ the sandbox
local function sandbox()
  local env = {
    assert = assert, error = error, ipairs = ipairs, next = next, pairs = pairs, pcall = pcall,
    select = select, tonumber = tonumber, tostring = tostring, type = type, xpcall = xpcall,
    getmetatable = getmetatable, setmetatable = setmetatable, rawequal = rawequal, rawget = rawget,
    rawlen = rawlen, rawset = rawset, _VERSION = _VERSION,
    string = string, table = table, math = math, utf8 = utf8, coroutine = coroutine,
    print = function(...) end,
    ui = ui, http = http, timer = timer, led = led, storage = storage, profile = profile,
    sys = sys, badge = badge, json = {encode = json.encode, decode = json.decode},
  }
  env._G = env
  local loaded = {}
  function env.require(name)
    if loaded[name] ~= nil then return loaded[name] end
    local path = APP_DIR .. "/" .. name:gsub("%.", "/") .. ".lua"
    local src = assert(read_file(path))
    local chunk = assert(load(src, "@" .. name:gsub("%.", "/") .. ".lua", "t", env))
    local v = chunk()
    if v == nil then v = true end
    loaded[name] = v
    return v
  end
  return env
end

------------------------------------------------------------------ driving it
local H = {}
local ENV

function H.boot(saved, linked)
  B = new_badge(saved)
  B.linked_wallet = linked
  ENV = sandbox()
  local src = assert(read_file(APP_DIR .. "/main.lua"))
  if #src > 65536 then error("main.lua over 64 KB") end
  assert(load(src, "@main.lua", "t", ENV))()
  return B
end

-- Deliver every answer waiting (and the ones those answers ask for).
function H.flush()
  for _ = 1, 50 do
    if #B.pending == 0 then return end
    local batch = B.pending
    B.pending = {}
    for _, fn in ipairs(batch) do fn() end
  end
  error("http never settled")
end

-- Move the clock, firing timers as they come due, then deliver answers.
function H.advance(ms)
  local target = B.now + ms
  while true do
    local nid, nt
    for id, t in pairs(B.timers) do
      if t.at <= target and (not nt or t.at < nt.at) then nid, nt = id, t end
    end
    if not nt then break end
    B.now = nt.at
    if nt.every then nt.at = nt.at + nt.ms else B.timers[nid] = nil end
    nt.fn()
    H.flush()
  end
  B.now = target
  if ENV.on_tick then ENV.on_tick(ms) end
  H.flush()
end

local function focused_list()
  for i = #B.objs, 1, -1 do
    local o = B.objs[i]
    if o.kind == "list" and not o.removed and o.visible then return o end
  end
end

function H.press(k)
  if #B.inputs > 0 then error("a dialog has the keys: " .. B.inputs[1].text, 2) end
  local l = focused_list()
  if l and (k == "up" or k == "down") and #l.rows > 0 then
    l.sel = math.max(1, math.min(#l.rows, l.sel + (k == "down" and 1 or -1)))
    return
  end
  if l and k == "select" and #l.rows > 0 then
    if l.opts.on_select then l.opts.on_select(l.sel, l.rows[l.sel]) end
    H.flush()
    return
  end
  local handled = ENV.on_key and ENV.on_key(k, false)
  if k == "back" and not handled then B.exited = true end
  H.flush()
end

function H.answer(text)
  local d = table.remove(B.inputs, 1)
  assert(d, "no dialog open")
  d.cb(text)
  H.flush()
end

-- Pick a row of the focused list by its title (a plain substring).
function H.choose(title)
  local l = assert(focused_list(), "no list on screen")
  for i, r in ipairs(l.rows) do
    local t = type(r) == "table" and r.title or r
    if t:find(title, 1, true) then
      l.sel = i
      return H.press("select")
    end
  end
  error("no row '" .. title .. "' in " .. H.rows(), 2)
end

function H.labels()
  local out = {}
  for _, o in ipairs(B.objs) do
    if o.kind == "label" and not o.removed and o.visible and o.value ~= "" then out[#out + 1] = o.value end
  end
  return table.concat(out, " | ")
end

function H.rows()
  local l = focused_list()
  if not l then return "(no list)" end
  local out = {}
  for _, r in ipairs(l.rows) do out[#out + 1] = type(r) == "table" and r.title or r end
  return table.concat(out, " | ")
end

function H.find(kind)
  local out = {}
  for _, o in ipairs(B.objs) do if o.kind == kind and not o.removed then out[#out + 1] = o end end
  return out
end

function H.screen(name)
  return ENV.require("screens." .. name)
end

function H.top()
  return ENV.require("lib.nav").top()
end

H.json, H.fixtures, H.WALLET = json, fixtures, WALLET
function H.badge() return B end
function H.env() return ENV end

-- The screen as data, for tools/screens/render.py: every live UI object in the
-- order drawn, the hint, the last toast if asked, and the LEDs.
function H.snapshot(name, opts)
  opts = opts or {}
  local objs = {}
  for _, o in ipairs(B.objs) do
    if not o.removed then
      local t = {kind = o.kind, x = o.x, y = o.y, visible = o.visible}
      if o.kind == "label" then
        t.text, t.colour, t.size, t.w, t.align = o.value, o.colour, o.size, o.w, o.align
      elseif o.kind == "rect" then
        t.w, t.h, t.colour, t.radius = o.w, o.h, o.colour, o.radius
      elseif o.kind == "bar" then
        t.w, t.h, t.value = o.w, o.h, o.value
      elseif o.kind == "list" then
        t.w, t.h, t.sel, t.rows = o.w, o.h, o.sel, {}
        for i, r in ipairs(o.rows) do
          t.rows[i] = type(r) == "table" and {title = r.title or "", sub = r.sub or "", right = r.right or ""} or {title = r, sub = "", right = ""}
        end
      elseif o.kind == "qr" then
        t.size, t.text = o.size, o.value
      elseif o.kind == "canvas" then
        t.w, t.h, t.draws = o.w, o.h, o.draws
      end
      objs[#objs + 1] = t
    end
  end
  local leds = {}
  for i, c in ipairs(B.leds) do leds[i] = {c[1], c[2], c[3]} end
  local dialog = B.inputs[1] and {kind = B.inputs[1].kind, text = B.inputs[1].text} or nil
  return {
    name = name, caption = opts.caption, bg = B.bg, hint = B.hint, objs = objs,
    toast = opts.toast and B.toasts[#B.toasts] or nil, dialog = dialog, leds = leds,
  }
end

-- True while a list with no rows is showing: Solana OS would draw its
-- "Nothing here yet" over the screen.
function H.empty_list_showing()
  for _, o in ipairs(B.objs) do
    if o.kind == "list" and not o.removed and o.visible and #o.rows == 0 then return true end
  end
  return false
end

------------------------------------------------------------------ run the scenarios
-- With a third argument, run that script (e.g. tools/screens/shots.lua) instead.
if arg[3] then
  assert(load(assert(read_file(arg[3])), "@" .. arg[3], "t", setmetatable({H = H, arg = arg}, {__index = _G})))()
  return
end
local scenarios = assert(load(assert(read_file(APP_DIR .. "/../tools/harness/scenarios.lua")), "@scenarios.lua", "t", setmetatable({H = H}, {__index = _G})))()
local passed, failed = 0, 0
for _, s in ipairs(scenarios) do
  local ok, err = pcall(s.run)
  if ok then
    passed = passed + 1
    print("  ok    " .. s.name)
  else
    failed = failed + 1
    print("  FAIL  " .. s.name .. "\n        " .. tostring(err))
    if B then print("        screen: " .. H.labels() .. "\n        rows: " .. H.rows()) end
  end
end
print(string.format("\n%d passed, %d failed", passed, failed))
if failed > 0 then host_exit(1) end
