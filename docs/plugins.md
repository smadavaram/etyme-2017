# How to add a plugin

A plugin is a module a firm does not have until its Owner turns it on. Etyme's
staff may turn one on too, on the switch alone. Off hides it and deletes
nothing. Turning it on again brings back every row. The records are 120 to 124,
132 and 133 in `docs/decisions/`.

Everything about a plugin is declared once, in `src/lib/plugin-registry.ts`.
The settings list, the staff picker, the menu, the route gate, the micro-site
gate and the agent gate all read that one declaration. Do not write a plugin's
name into any other list.

## The steps

1. **Find the matrix row.** Open `src/lib/matrix.ts`. The plugin needs an L3 row
   that says what it does. If there is none, stop: adding the row is the
   architect's call.
2. **Add the key** to `PluginKey` and one entry to `PLUGIN_REGISTRY`:
   - `key`, `label`, `says` (one sentence a firm reads), `order`;
   - `offeredTo`: the kinds of company that are offered it. A company that only
     buys is never offered a plugin;
   - `microSite`: its own root path, or `null`;
   - `doors`: the menu links it draws, and only while it is on. The link itself
     is a menu item in `src/lib/nav-table.ts` with the same address;
   - `pages`: its pages that are not menu links;
   - `routes`: every API prefix that belongs to it, each marked `GATE`
     (the route calls `pluginGate(caller, 'KEY')`), `MICRO_SITE` (it reads the
     micro-site's own reader) or `OPEN` (left open on purpose, with the reason);
   - `agents`: the agent keys that run for it, as they are in `FIRM_AGENTS`.
     Write `[]` if it has none;
   - `actions`: the automation actions its agents may write;
   - `actKinds`: the twin act kinds its agents may take. Never a money act, a
     signing act or a floor act;
   - `whenOff`: `EVERYTHING` (its agents do not run, its tasks pause), or
     `SENDS` (only what leaves the firm is held, as Outreach does);
   - `onHold`: a reason it may not be turned on yet, or `null`;
   - `matrixRow`: the L3 row from step 1.
3. **Gate every route.** The first line after the caller check in each route is
   `const off = await pluginGate(caller, 'KEY'); if (off) return off`. The gate
   refuses in one sentence and writes the refusal to the access log first.
4. **Keep the data when it is off.** Nothing may delete a row when the plugin is
   switched off. A read of the plugin's own pages says "off", never "gone".
5. **Run the tests.** `__tests__/invariants/plugin-registry.test.ts` fails when
   a route, page, agent or menu door of a plugin is not declared, or a declared
   one is not gated. `__integration__/plugin-framework.test.ts` proves an agent
   stops when its plugin is off and that off then on keeps every row.
6. **Update the matrix row** in the same change: status, `implementedBy`,
   `testedBy`.

## What an agent of a plugin may do

- It does not run while its plugin is off. The run writes one `NOT_RUN` row that
  says why. Nothing is deleted.
- A task names its plugin (`AgentTask.pluginKey`). A task already approved when
  the plugin goes off is paused and keeps its yes. It goes on when the plugin
  does.
- One yes releases one task. Approval never carries across tasks.
- It writes only the acts its plugin declares in `actions`. Any other act is
  refused in a sentence and nothing is written.
- Every act is a row on the record ledger under the agent's key. The Owner reads
  the count per plugin in Settings, Plugins. There is no second counter.
- No agent and no twin switches a plugin. A person does.
