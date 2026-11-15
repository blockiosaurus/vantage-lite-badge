-- A list drawn the Vantage way, in place of Solana OS's ui.list (whose
-- green selection bar, purple scrollbar and grey right column can't be
-- restyled). Rows are 36 px like ui.list's: a title, a mono sub line, and a
-- right-hand value that takes market green or red from `rc` (a change).
-- The focused row is a secondary card with a Metaplex Blue ring.
--
-- Same calls as ui.list (items, selected, select, show, remove), plus
-- key(k): nav sends it up/down/select first, as the OS does for ui.list.
local T = require("lib.theme")

local L = {}
local ROW = 36
local active = nil

function L.reset() active = nil end
function L.active() return active end

local M = {}
M.__index = M

function L.new(x, y, w, h, items, opts)
  local self = setmetatable({x = x, y = y, w = w, h = h, rows = {}, sel = 1, top = 1,
    shown = true, opts = opts or {}, n = math.max(1, h // ROW), cells = {}}, M)
  -- the ring first, so the row's text draws on top of it
  self.ring = ui.rect(x + 4, y + 1, w - 14, ROW - 2, {color = T.SECONDARY, radius = 10, border = T.PRIMARY})
  for i = 1, self.n do
    local ry = y + (i - 1) * ROW
    self.cells[i] = {
      title = T.label(x + 14, ry + 3, "", {size = 14}),
      sub = T.label(x + 14, ry + 20, "", {size = 12, color = T.MUTED_FG}),
      right = T.label(x + w - 122, ry + 4, "", {size = 12, color = T.MUTED_FG, w = 104, align = "right"}),
    }
  end
  self.thumb = ui.rect(x + w - 4, y, 2, 12, {color = T.SCROLL, radius = 1})
  self:items(items or {})
  active = self
  return self
end

function M:render()
  local count = #self.rows
  if self.sel > count then self.sel = math.max(1, count) end
  if self.sel < self.top then self.top = self.sel end
  if self.sel >= self.top + self.n then self.top = self.sel - self.n + 1 end
  if self.top > math.max(1, count - self.n + 1) then self.top = math.max(1, count - self.n + 1) end
  for i, c in ipairs(self.cells) do
    local r = self.rows[self.top + i - 1]
    if type(r) == "string" then r = {title = r} end
    local right = r and r.right or ""
    local room = right ~= "" and self.w - 140 or self.w - 40
    c.title:text(r and T.fit(r.title or "", room, 14) or "")
    c.sub:text(r and T.fit(r.sub or "", self.w - 34, 12) or "")
    c.right:text(right)
    c.right:color(r and r.rc and T.dir(r.rc) or T.MUTED_FG)
    for _, l in pairs(c) do l:show(self.shown) end
  end
  local on = self.shown and count > 0
  self.ring:pos(self.x + 4, self.y + (self.sel - self.top) * ROW + 1)
  self.ring:show(on)
  local scroll = on and count > self.n
  self.thumb:show(scroll)
  if scroll then
    local track = self.n * ROW
    local len = math.max(12, track * self.n // count)
    self.thumb:size(2, len)
    self.thumb:pos(self.x + self.w - 4, self.y + (track - len) * (self.top - 1) // (count - self.n))
  end
end

function M:items(rows)
  self.rows = rows
  self:render()
end

function M:selected() return #self.rows > 0 and self.sel or nil end

function M:select(i)
  self.sel = i
  self:render()
end

function M:show(on)
  self.shown = on ~= false
  self:render()
end

function M:remove()
  self.ring:remove()
  self.thumb:remove()
  for _, c in ipairs(self.cells) do for _, l in pairs(c) do l:remove() end end
  if active == self then active = nil end
end

-- Up/down move, select chooses. False for anything else, or while hidden.
function M:key(k)
  if not self.shown or #self.rows == 0 then return false end
  if k == "up" or k == "down" then
    local n = #self.rows
    self.sel = math.max(1, math.min(n, self.sel + (k == "down" and 1 or -1)))
    self:render()
    return true
  end
  if k == "select" then
    if self.opts.on_select then self.opts.on_select(self.sel, self.rows[self.sel]) end
    return true
  end
  return false
end

return L
