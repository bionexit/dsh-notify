# Conversation alerts (对话提醒)

A DeepSeek Harness (DSH) plugin that tells you when a conversation needs you: it plays a sound, shows a floating notice in the top-right corner, and flashes the conversation area — when an approval/question/plan review is waiting, when a turn was interrupted or failed, and optionally when a reply has finished.

Everything runs in the browser. The plugin registers no Host capability, no server route, and no model tool.

## What it does

- **Four alert triggers**: a pending approval / question / plan review, an interrupted turn, a failed turn, and (opt-in, off by default) a finished reply.
- **Sound**: built-in chime, bell, or short ping, or your own audio file (mp3, wav, m4a, aac, ogg, flac up to 8 MB) with a volume slider.
- **Top-right notice**: names the event and the tool call, and clicking it opens the conversation that raised the alert (or acknowledges it when that conversation is already on screen). It closes by itself after about 12 seconds.
- **Conversation flash**: a pulsing outline around the conversation you are viewing, which stops as soon as you click or press a key (about 9 seconds otherwise).
- **Sidebar highlight**: the alerting session's row in the left list pulses with a colored ring and a small dot, so you can find it while a different conversation is on screen.
- **Settings page**: Settings → *Alerts & sounds*, with one master switch, per-channel switches, and a *Show once* button that previews the whole alert without waiting for a real interruption.

A request from a background session still plays the sound, shows the notice, and marks its own sidebar row, but it never flashes the conversation you are reading.

## Requirements

- DeepSeek Harness 0.2.2 or newer (developed and tested on 0.2.2-rc.5, desktop app).
- Nothing else. There is no build step, no `npm install`, and no third-party dependency: the package ships plain ESM for the Host half and a pre-assembled Client bundle.

## Install

### Option 1 — Plugins → Add plugin (recommended)

```bash
git clone https://github.com/bionexit/dsh-notify.git
```

Then, in DSH: **Settings → Plugins → Add plugin**, choose the cloned folder (`dsh-notify`), and enable **Conversation alerts** in the bundle list. The settings page appears under **Settings → Alerts & sounds**.

### Option 2 — ask your DSH agent to install it

Give the agent the path to the clone and say:

> Install the plugin bundle in `/absolute/path/to/dsh-notify` with `plugin_manager` `install_bundle`.

`install_bundle` takes care of the profile dependency, the bundle selection, and activation. Installing a *new* bundle can go live through hot reload; replacing an already installed copy needs a DSH restart.

### Option 3 — add it to a profile by hand (developers)

In the profile's `package.json`, point a dependency at the clone and add the bundle name to `dsh.profile.bundles`:

```json
{
  "dependencies": { "@local/attention-alert": "file:/absolute/path/to/dsh-notify" },
  "dsh": { "profile": { "bundles": ["@local/attention-alert"] } }
}
```

Then install with pnpm in the profile directory and restart DSH. Options 1 and 2 are preferred, because they keep that profile state consistent.

### Uninstall

**Settings → Plugins**, remove the bundle (or disable it — disabling also removes the settings page). Nothing is written outside the profile, and the only stored state is a small settings object plus, if you chose one, your audio file in the browser's IndexedDB.

## Use

1. Open **Settings → Alerts & sounds**.
2. Pick when to alert: *needs your answer*, *interrupted or failed*, and/or *reply finished* (off by default).
3. Choose the sound — a built-in one, or **Choose sound file…** — and press **Preview** to hear it.
4. Set the volume, and switch the conversation flash, the sidebar row highlight, and the top-right notice on or off.
5. Press **Show once** to preview the complete alert immediately.

## Limits

- Your custom audio file stays in this browser's IndexedDB. It is not uploaded and does not follow you to another browser or profile.
- Browsers may refuse to start audio before you have interacted with the page once; a single click or keypress unlocks it for the rest of the page session.
- The flashing channel follows the conversation you are viewing; per-session flash routing is not implemented.
- The plugin relies on Client slots (`settings.section`, `shell.overlay`, `conversation.hero.frame`, `sidebar.session.row.trailing`) that exist in DSH 0.2.2. A DSH release that renames them may need a plugin update.

## Development

The Client half is a single pre-assembled file that the DSH web app loads through `window.__ModuleLoader__`; `client.js` is the source, so edit it directly. There is no bundler.

```bash
node test/smoke.mjs        # headless smoke test: every trigger path, plus one render pass per component
```

The smoke test needs only Node.js — no dependencies. It stubs the Cordis services, so it covers trigger logic and rendering, not real audio or visuals.

### Layout

| File | Role |
|---|---|
| `package.json` | Manifest: `dsh.bundle.patch` (Host row) and `dsh.client` (Web bundle, injected slot services) |
| `cordis.patch.yml` | Inserts the Host plugin row |
| `index.js` | Host half — intentionally empty, it exists so the bundle has a row and an on/off switch |
| `client.js` | The whole feature: triggers, sound, notice, flash, sidebar marker, settings page |
| `locale/en.json`, `locale/zh.json` | Plugin Manager title and description |
| `icon.svg` | Plugin icon |
| `test/smoke.mjs` | Headless test |

The package keeps its original name `@local/attention-alert`. The Loader row in `cordis.patch.yml` and the module id in `client.js` use the same string, so rename all three together (and the profile's dependency) if you fork it.

## License

MIT — see [LICENSE](LICENSE).

---

## 中文

当对话需要你确认、被中断或出错、或（可选）回复完成时，播放提示音，在右上角弹出悬浮提示，并让对话区域频闪高亮。

**安装**：克隆本仓库后在 DSH 中打开「设置 → 插件 → 添加插件」，选择克隆下来的文件夹，然后启用 **对话提醒**。也可以让 DSH 里的 agent 用 `plugin_manager` 的 `install_bundle` 安装该目录。

**使用**：打开「设置 → 提醒与音效」，选择提醒时机、音效（内置音效或「选择音效文件…」）、音量，以及是否显示频闪、左侧列表高亮和悬浮提示；页面底部的「显示一次」可立即预览完整效果。

**说明**：自定义音效文件只保存在本机浏览器（IndexedDB），最大 8 MB，不会上传或同步到其他浏览器。浏览器在你首次与页面交互前可能禁止播放声音，点击或按键后即可正常播放。点击悬浮提示会直接进入触发提醒的那个对话并关闭提示；悬浮提示约 12 秒后消失，频闪约 9 秒，任意点击或按键会立即停止频闪。其他会话的审批或提问会播放音效、显示提示并高亮其列表行，但不会让当前正在看的对话频闪。关闭总开关会停止音效、提示与频闪；在「插件」中停用本插件则连设置页一并移除。

本插件为纯浏览器侧实现，不注册 Host 能力、不发起网络请求、不产生模型工具调用。
