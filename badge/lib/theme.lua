-- Metaplex's Vantage design language on the badge (apps/terminal/design.md
-- and the dark tokens in apps/terminal/app/globals.css, metaplex-global/genesis-app):
--
-- * a stepped surface ladder, floor -> muted -> card -> secondary, never pure black;
-- * one brand voltage, Metaplex Blue, used scarcely: the focused row, the
--   primary action, the active tab;
-- * market green and red as text colour only, never as a fill behind text;
-- * pill geometry for chips and actions, rounded cards.
--
-- Colours are fixed values, not the badge's theme names: Vantage is
-- dark-first, and theme names would turn the text black under the badge's
-- Light theme while these surfaces stay dark.
local T = {
  FLOOR = 0x050609,      -- --background
  MUTED = 0x0D0E11,      -- --muted: header and hint wells
  CARD = 0x131519,       -- --card
  SECONDARY = 0x1D2024,  -- --secondary: chips, the focused row
  ACCENT = 0x23262A,     -- --accent
  BORDER = 0x232427,     -- --border (white 12% over the floor)
  FG = 0xF9FAFB,         -- --foreground
  MUTED_FG = 0xA0A5AC,   -- --muted-foreground
  PRIMARY = 0x0052FF,    -- Metaplex Blue
  UP = 0x05B169,         -- --semantic-up
  DOWN = 0xFA4242,       -- --semantic-down (dark)
  UP_FILL = 0x052017,    -- chart area: up at 15% over the floor
  DOWN_FILL = 0x2A0F12,
  SCROLL = 0x6B6E73,     -- scrollbar thumb: foreground at 42%
  AMBER = 0xF5A623,      -- medium risk
}
T.BLUE = T.PRIMARY

-- Colour for a change: a number (12.3, -4) or nil.
function T.dir(n)
  if n == nil or n == 0 then return T.MUTED_FG end
  return n > 0 and T.UP or T.DOWN
end

-- ui.label with Vantage's foreground as the default colour.
function T.label(x, y, text, opts)
  opts = opts or {}
  if opts.color == nil then opts.color = T.FG end
  return ui.label(x, y, text, opts)
end

-- Rough glyph widths for the badge's fonts, to cut text that would wrap.
local CHAR_W = {[12] = 7, [14] = 8, [20] = 11, [32] = 18}

-- `s` cut to about `px` pixels with "..." (labels with a width wrap, they never cut).
function T.fit(s, px, size)
  local max = px // (CHAR_W[size or 14] or 8)
  if #s <= max then return s end
  return s:sub(1, math.max(1, max - 3)) .. "..."
end

-- The Metaplex mark (Solana OS 0.5.9+ draws bundled PNGs), else nothing.
function T.mark(x, y)
  if ui.image then return ui.image(x, y, "art/metaplex-mark.png") end
end

-- The bar every screen starts with: the Metaplex mark, the screen's name and
-- a right-hand note. Returns the note so a screen can update it.
function T.chrome(title, note)
  ui.bg(T.FLOOR)
  ui.rect(0, 0, ui.W, 26, {color = T.MUTED})
  ui.rect(0, 26, ui.W, 1, {color = T.BORDER})
  T.mark(8, 7)
  T.label(36, 5, title or "", {size = 14})
  return T.label(ui.W - 128, 7, note or "", {size = 12, color = T.MUTED_FG, w = 120, align = "right"})
end

-- The key hint, in a muted well along the bottom (16 px, as Solana OS's own).
function T.hint(text)
  ui.rect(0, ui.H - 16, ui.W, 16, {color = T.MUTED})
  ui.rect(0, ui.H - 16, ui.W, 1, {color = T.BORDER})
  return T.label(8, ui.H - 14, text, {size = 12, color = T.MUTED_FG})
end

-- A centred line in the body, for loading and empty states.
function T.notice(text, y)
  return T.label(8, y or 96, text, {size = 14, color = T.MUTED_FG, w = ui.W - 16, align = "center"})
end

-- A pill: rounded chip with a label centred in it. `on` makes it the
-- active/primary one (Metaplex Blue); otherwise it is a secondary chip.
function T.pill(x, y, w, text, opts)
  opts = opts or {}
  local fill = opts.primary and T.PRIMARY or (opts.quiet and T.FLOOR or T.SECONDARY)
  local r = ui.rect(x, y, w, 20, {color = fill, radius = 10})
  local l = T.label(x, y + 2, text, {size = opts.size or 14, w = w, align = "center",
    color = opts.quiet and T.MUTED_FG or T.FG})
  return {rect = r, label = l}
end

-- A meter: a rounded track with a Metaplex Blue fill, value 0..100.
function T.meter(x, y, w, h, value)
  local m = {w = w}
  ui.rect(x, y, w, h, {color = T.SECONDARY, radius = h // 2})
  m.fill = ui.rect(x, y, math.max(h, w * value // 100), h, {color = T.PRIMARY, radius = h // 2})
  m.fill:show(value > 0)
  function m:set(v)
    self.fill:size(math.max(h, self.w * v // 100), h)
    self.fill:show(v > 0)
  end
  return m
end

return T
