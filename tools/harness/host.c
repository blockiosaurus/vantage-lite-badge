/*
 * A native host for the badge's own Lua 5.5 (solana-os main/lua/vendor, with
 * its patches: 32-bit integers and floats, lazy libraries). It opens the same
 * standard libraries a badge app gets, plus one trusted helper for the
 * harness, read_file(path), and runs the harness script given on the command
 * line. The app itself runs inside a sandbox table the harness builds, so it
 * sees only what a badge gives it.
 */
#include <stdio.h>
#include <stdlib.h>
#include "lua.h"
#include "lauxlib.h"
#include "lualib.h"

/* Hooks the badge's luaconf.h expects from its host. */
int lh_cstack_check(void) { return 0; }
void lh_charge_steps(struct lua_State *L, unsigned int n) { (void)L; (void)n; }
void lh_thread_new(struct lua_State *L1) { (void)L1; }

static int read_file(lua_State *L) {
  const char *path = luaL_checkstring(L, 1);
  FILE *f = fopen(path, "rb");
  if (!f) { lua_pushnil(L); lua_pushfstring(L, "cannot open %s", path); return 2; }
  luaL_Buffer b;
  luaL_buffinit(L, &b);
  char chunk[4096];
  size_t n;
  while ((n = fread(chunk, 1, sizeof chunk, f)) > 0) luaL_addlstring(&b, chunk, n);
  fclose(f);
  luaL_pushresult(&b);
  return 1;
}

static int host_exit(lua_State *L) {
  exit((int)luaL_optinteger(L, 1, 0));
  return 0;
}

int main(int argc, char **argv) {
  if (argc < 2) { fprintf(stderr, "usage: %s harness.lua [args]\n", argv[0]); return 2; }
  lua_State *L = luaL_newstate();
  luaL_requiref(L, LUA_GNAME, luaopen_base, 1); lua_pop(L, 1);
  luaL_requiref(L, LUA_STRLIBNAME, luaopen_string, 1); lua_pop(L, 1);
  luaL_requiref(L, LUA_TABLIBNAME, luaopen_table, 1); lua_pop(L, 1);
  luaL_requiref(L, LUA_MATHLIBNAME, luaopen_math, 1); lua_pop(L, 1);
  luaL_requiref(L, LUA_UTF8LIBNAME, luaopen_utf8, 1); lua_pop(L, 1);
  luaL_requiref(L, LUA_COLIBNAME, luaopen_coroutine, 1); lua_pop(L, 1);
  lua_register(L, "read_file", read_file);
  lua_register(L, "host_exit", host_exit);
  lua_newtable(L);
  for (int i = 2; i < argc; i++) { lua_pushstring(L, argv[i]); lua_rawseti(L, -2, i - 1); }
  lua_setglobal(L, "arg");
  if (luaL_loadfile(L, argv[1]) || lua_pcall(L, 0, 0, 0)) {
    fprintf(stderr, "%s\n", lua_tostring(L, -1));
    return 1;
  }
  return 0;
}
