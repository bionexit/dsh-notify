/**
 * Browser half of @local/attention-alert.
 *
 * Watches the assembled Client for two kinds of "the conversation needs you"
 * moments — a pending interaction (approval, question, plan review) or a turn
 * that ended by interruption/error — and answers each with a sound, a floating
 * notice in the frame's top-right corner, and a flashing outline around the
 * conversation body. The sound, its file, volume, and the visual channels are
 * configured in Settings > 提醒与音效.
 *
 * Everything here is client-side: no Host capability, no network, no model
 * request. The custom sound file is stored in this browser's IndexedDB.
 */
window.__ModuleLoader__.load({
  id: '@local/attention-alert',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useRef } = React;

    const NS = 'attentionAlert';
    const CONFIG_KEY = 'attention-alert.v1';
    const DB_NAME = 'dsh-attention-alert';
    const DB_STORE = 'clips';
    const CLIP_KEY = 'custom';
    const MAX_CLIP_BYTES = 8 * 1024 * 1024;
    const ALERT_MS = 12000;
    const FLASH_MS = 9000;
    const SOUNDS = ['chime', 'bell', 'ping', 'none', 'custom'];

    const DEFAULT_CONFIG = Object.freeze({
      enabled: true,
      onInteraction: true,
      onInterrupted: true,
      onCompleted: false,
      sound: 'chime',
      volume: 0.6,
      flash: true,
      sidebar: true,
      toast: true,
      clipName: '',
    });

    // ---------------------------------------------------------------- copy --
    const zh = {
      'nav': '提醒与音效',
      'page.desc': '当对话需要你确认、被中断或回复完成时，播放提示音，在右上角弹出提醒，并让对话区域频闪高亮。',
      'row.enabled': '启用提醒',
      'row.enabled.desc': '总开关。关闭后不播放音效，也不显示悬浮提示与频闪。',
      'timing.title': '提醒时机',
      'timing.interaction': '需要你确认或回答',
      'timing.interaction.desc': '审批请求、提问或计划确认在等待你操作时提醒。',
      'timing.interrupted': '对话被中断或出错',
      'timing.interrupted.desc': '本轮被手动停止、异常结束或运行中断时提醒。',
      'timing.completed': '回复完成',
      'timing.completed.desc': '每一轮回复正常结束、等待你下一步输入时提醒。默认关闭。',
      'sound.title': '提示音',
      'sound.desc': '使用内置音效，或选择本机音频文件（文件只保存在此浏览器，不会上传）。',
      'sound.chime': '清脆双音',
      'sound.bell': '铃声',
      'sound.ping': '短提示音',
      'sound.none': '静音（不播放声音）',
      'sound.custom': '自定义文件',
      'sound.volume': '音量',
      'sound.choose': '选择音效文件…',
      'sound.preview': '试听',
      'sound.clear': '清除',
      'sound.current': '当前文件：{name}',
      'sound.none.file': '尚未选择自定义文件；在选择之前仍会播放内置「清脆双音」。',
      'sound.hint': '支持 mp3 / wav / m4a / aac / ogg / flac，最大 8 MB。',
      'sound.played': '已试听。',
      'sound.blocked': '浏览器暂时不允许播放声音，请先点击页面任意位置后再试。',
      'visual.title': '视觉提醒',
      'visual.flash': '对话区域频闪高亮',
      'visual.flash.desc': '对话内容外围闪烁描边，提示你回到这里。',
      'visual.sidebar': '左侧会话列表高亮',
      'visual.sidebar.desc': '让左侧列表中需要你处理的会话标题闪烁描边，方便一眼找到它。',
      'visual.toast': '右上角悬浮提示',
      'visual.toast.desc': '在窗口右上角显示提醒卡片，约 12 秒后自动消失。',
      'preview.title': '预览提醒效果',
      'preview.desc': '按当前设置立即显示一次提醒（音效、悬浮提示、频闪），用于确认效果。',
      'preview.action': '显示一次',
      'preview.alert': '提醒效果预览',
      'preview.detail': '这条提示会在约 12 秒后自动消失。',
      'toast.dismiss': '关闭提醒',
      'toast.open': '进入对话',
      'sidebar.waiting': '等待你处理',
      'alert.interaction.approval': '需要你确认',
      'alert.interaction.question': '需要你回答',
      'alert.interaction.plan': '需要你确认计划',
      'alert.interaction.session': '会话：{session}',
      'alert.interaction.more': '另有 {count} 个会话在等待你处理',
      'alert.interaction.other': '对话在等待你处理',
      'alert.interaction.tool': '工具调用：{tool}',
      'alert.interrupted': '对话被中断',
      'alert.error': '对话出错',
      'alert.completed': '回复已完成',
      'detail.stop': '本轮已停止',
      'detail.crash': '本轮在恢复时被中断',
      'detail.maxTokens': '输出达到长度上限',
      'detail.blocked': '本轮被阻止继续',
      'detail.error': '本轮执行失败',
      'clip.tooLarge': '文件过大，请选择 8 MB 以内的音频。',
      'clip.badType': '请选择音频文件（mp3 / wav / m4a / aac / ogg / flac）。',
      'clip.failed': '保存音效文件失败，请重试。',
      'clip.cleared': '已清除自定义音效，改用内置音效。',
    };

    const en = {
      'nav': 'Alerts & sounds',
      'page.desc': 'When the conversation needs your answer, is interrupted, or finishes a reply, play a chosen sound, show a notice in the top-right corner, and flash the conversation area.',
      'row.enabled': 'Enable alerts',
      'row.enabled.desc': 'Master switch. When off, no sound, notice, or flash is shown.',
      'timing.title': 'When to alert',
      'timing.interaction': 'It needs your answer',
      'timing.interaction.desc': 'An approval request, question, or plan review is waiting for you.',
      'timing.interrupted': 'It was interrupted or failed',
      'timing.interrupted.desc': 'A turn was stopped, failed, or ended abnormally.',
      'timing.completed': 'A reply finished',
      'timing.completed.desc': 'A turn ended normally and waits for your next message. Off by default.',
      'sound.title': 'Sound',
      'sound.desc': 'Pick a built-in tone or an audio file from this computer (kept in this browser only, never uploaded).',
      'sound.chime': 'Chime',
      'sound.bell': 'Bell',
      'sound.ping': 'Short ping',
      'sound.none': 'Silent (no sound)',
      'sound.custom': 'Custom file',
      'sound.volume': 'Volume',
      'sound.choose': 'Choose sound file…',
      'sound.preview': 'Preview',
      'sound.clear': 'Clear',
      'sound.current': 'Current file: {name}',
      'sound.none.file': 'No custom file yet; the built-in chime plays until you choose one.',
      'sound.hint': 'Supports mp3 / wav / m4a / aac / ogg / flac, up to 8 MB.',
      'sound.played': 'Preview played.',
      'sound.blocked': 'The browser is blocking audio; click anywhere on the page first, then try again.',
      'visual.title': 'Visual alerts',
      'visual.flash': 'Flash the conversation area',
      'visual.flash.desc': 'Pulses an outline around the conversation content.',
      'visual.sidebar': 'Highlight the session in the sidebar',
      'visual.sidebar.desc': 'Pulses the waiting session in the left list so you can spot it at a glance.',
      'visual.toast': 'Notice in the top-right corner',
      'visual.toast.desc': 'Shows an alert card that disappears after about 12 seconds.',
      'preview.title': 'Preview an alert',
      'preview.desc': 'Shows the alert once using the current settings (sound, notice, flash).',
      'preview.action': 'Show once',
      'preview.alert': 'Alert preview',
      'preview.detail': 'This notice disappears after about 12 seconds.',
      'toast.dismiss': 'Dismiss alert',
      'toast.open': 'Open conversation',
      'sidebar.waiting': 'Waiting for you',
      'alert.interaction.approval': 'Your confirmation is needed',
      'alert.interaction.question': 'Your answer is needed',
      'alert.interaction.plan': 'A plan is ready for review',
      'alert.interaction.session': 'Session: {session}',
      'alert.interaction.more': '{count} more waiting for you',
      'alert.interaction.other': 'The conversation is waiting for you',
      'alert.interaction.tool': 'Tool call: {tool}',
      'alert.interrupted': 'The conversation was interrupted',
      'alert.error': 'The conversation failed',
      'alert.completed': 'The reply is ready',
      'detail.stop': 'The turn was stopped',
      'detail.crash': 'The turn was interrupted by a recovery',
      'detail.maxTokens': 'The output reached its length limit',
      'detail.blocked': 'The turn was blocked',
      'detail.error': 'The turn failed',
      'clip.tooLarge': 'That file is too large; choose an audio file under 8 MB.',
      'clip.badType': 'Choose an audio file (mp3 / wav / m4a / aac / ogg / flac).',
      'clip.failed': 'Saving the sound file failed. Try again.',
      'clip.cleared': 'Custom sound cleared; the built-in tone is used again.',
    };

    // --------------------------------------------------------------- styles --
    const STYLE = `
.aa-section{display:flex;flex-direction:column;width:100%;gap:2px}
.aa-intro{margin:0 0 8px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.aa-group-title{margin:14px 0 2px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;font-weight:600}
.aa-group-title:first-of-type{margin-top:4px}
.aa-row{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:14px 0;border-bottom:.5px solid var(--dsw-alias-border-l2)}
.aa-row.aa-last{border-bottom:none}
.aa-row.aa-stack{flex-direction:column;align-items:stretch;gap:10px}
.aa-row-main{min-width:0}
.aa-title{font-size:14px;line-height:20px;color:var(--dsw-alias-label-primary)}
.aa-desc{margin-top:4px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.aa-hint{margin-top:6px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.aa-error{margin-top:6px;color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px}
.aa-ok{margin-top:6px;color:var(--dsw-alias-state-success-primary);font-size:12px;line-height:18px}
.aa-control{display:flex;align-items:center;gap:8px;flex:none}
.aa-inline{display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-width:0}
.aa-switch{position:relative;width:36px;height:20px;flex:none;padding:0;border:none;border-radius:999px;background:var(--dsw-alias-border-l3);cursor:pointer;transition:background .16s ease}
.aa-switch[aria-checked='true']{background:var(--dsw-alias-brand-primary)}
.aa-switch::after{content:'';position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-switch-thumb);transition:transform .12s ease}
.aa-switch[aria-checked='true']::after{background:var(--dsw-alias-label-primary-foreground)}
.aa-switch[aria-checked='true']::after{transform:translateX(16px)}
.aa-switch:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
.aa-switch[disabled]{opacity:.45;cursor:default}
.aa-btn{appearance:none;padding:5px 12px;border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;cursor:pointer}
.aa-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}
.aa-btn:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}
.aa-btn[disabled]{opacity:.5;cursor:default}
.aa-btn.aa-primary{background:var(--dsw-alias-brand-primary);border-color:transparent;color:var(--dsw-alias-label-primary-foreground)}
.aa-select{appearance:none;min-width:160px;padding:5px 26px 5px 10px;border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;background-color:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px;cursor:pointer;background-image:url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2.5 4.5 6 8l3.5-3.5' fill='none' stroke='%23888' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 8px center;background-size:12px 12px}
.aa-select:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}
.aa-range{width:160px;accent-color:var(--dsw-alias-state-business-primary)}
.aa-value{min-width:36px;text-align:right;font-size:12px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.aa-toast-wrap{position:absolute;top:calc(var(--dsh-frame-top-clearance,0px) + 10px);right:16px;display:flex;flex-direction:column;align-items:flex-end;gap:8px}
html[data-platform='darwin'] .aa-toast-wrap{top:12px}
.aa-toast{display:flex;align-items:flex-start;gap:10px;width:min(340px,calc(100vw - 48px));padding:12px 8px 12px 14px;border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-alias-toast-bg,var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-toast-label,var(--dsw-alias-label-primary));box-shadow:var(--dsw-shadow-lv3,0 10px 28px -10px rgba(0,0,0,.32));animation:aa-toast-in 180ms ease-out;pointer-events:auto}
.aa-toast-main{display:flex;flex:1;align-items:flex-start;gap:10px;min-width:0;border-radius:calc(var(--dsw-radius-lg,12px) - 6px);outline-offset:1px}
.aa-toast-main[role='button']{cursor:pointer}
.aa-toast-main[role='button']:hover .aa-toast-go{text-decoration:underline;text-underline-offset:3px}
.aa-toast-main[role='button']:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary))}
.aa-toast-go{margin-top:6px;font-size:12px;line-height:16px;opacity:.8}
.aa-dot{flex:none;width:8px;height:8px;margin-top:6px;border-radius:50%;background:var(--aa-tone);box-shadow:0 0 0 4px color-mix(in srgb,var(--aa-tone) 16%,transparent)}
.aa-toast-body{flex:1;min-width:0}
.aa-toast-title{font-size:13px;line-height:18px;font-weight:600}
.aa-toast-detail{margin-top:2px;font-size:12px;line-height:17px;opacity:.72;overflow-wrap:anywhere}
.aa-close{flex:none;width:22px;height:22px;padding:0;border:none;border-radius:6px;background:transparent;color:inherit;opacity:.6;font-size:14px;line-height:22px;cursor:pointer}
.aa-close:hover{background:var(--dsw-alias-interactive-bg-hover);opacity:1}
.aa-close:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}
.aa-tone-interaction{--aa-tone:var(--dsw-alias-state-business-primary)}
.aa-tone-interrupted{--aa-tone:var(--dsw-alias-state-warn-primary)}
.aa-tone-completed{--aa-tone:var(--dsw-alias-state-success-primary)}
.aa-glow{position:absolute;inset:0;border-radius:10px;pointer-events:none;background:color-mix(in srgb,var(--aa-tone) 8%,transparent);box-shadow:inset 0 0 0 2px var(--aa-tone),inset 0 0 32px -6px var(--aa-tone);animation:aa-flash 1.05s ease-in-out infinite}
.aa-row-dot{display:inline-block;width:7px;height:7px;margin-inline-start:6px;border-radius:50%;background:var(--aa-tone);vertical-align:middle;animation:aa-row-dot 1.05s ease-in-out infinite}
@keyframes aa-toast-in{from{opacity:0;transform:translateY(-6px) scale(.98)}to{opacity:1;transform:none}}
@keyframes aa-flash{0%,100%{opacity:.18}50%{opacity:.9}}
@keyframes aa-row-dot{0%,100%{opacity:.25;transform:scale(.85)}50%{opacity:1;transform:scale(1)}}
@keyframes aa-row-pulse{0%,100%{box-shadow:inset 0 0 0 1px transparent}50%{box-shadow:inset 0 0 0 1.5px var(--aa-row-tone),inset 0 0 14px -5px var(--aa-row-tone)}}
@media (prefers-reduced-motion:reduce){.aa-toast{animation:none}.aa-glow{animation:none;opacity:.55}.aa-row-dot{animation:none;opacity:1}}
`;

    // ------------------------------------------------------------- storage --
    function readConfig() {
      let raw = null;
      try {
        raw = globalThis.localStorage ? globalThis.localStorage.getItem(CONFIG_KEY) : null;
      } catch {
        raw = null;
      }
      let parsed = null;
      if (raw) {
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = null;
        }
      }
      const next = { ...DEFAULT_CONFIG };
      if (parsed && typeof parsed === 'object') {
        for (const key of ['enabled', 'onInteraction', 'onInterrupted', 'onCompleted', 'flash', 'sidebar', 'toast']) {
          if (typeof parsed[key] === 'boolean') next[key] = parsed[key];
        }
        if (typeof parsed.sound === 'string' && SOUNDS.indexOf(parsed.sound) >= 0) next.sound = parsed.sound;
        if (typeof parsed.volume === 'number' && parsed.volume >= 0 && parsed.volume <= 1) next.volume = parsed.volume;
        if (typeof parsed.clipName === 'string') next.clipName = parsed.clipName;
      }
      return Object.freeze(next);
    }

    function writeConfig(value) {
      try {
        if (globalThis.localStorage) globalThis.localStorage.setItem(CONFIG_KEY, JSON.stringify(value));
      } catch {
        /* Storage may be unavailable or full; the running session keeps its values. */
      }
    }

    function withClipDB(run) {
      return new Promise((resolve, reject) => {
        let settled = false;
        let timer = null;
        const finish = (settle, value) => {
          if (settled) return;
          settled = true;
          if (timer !== null) clearTimeout(timer);
          settle(value);
        };
        let request;
        try {
          request = globalThis.indexedDB.open(DB_NAME, 1);
        } catch (error) {
          reject(error);
          return;
        }
        // A blocked upgrade (another tab holding an old version) must fail loudly
        // instead of leaving the settings controls disabled forever.
        timer = setTimeout(() => {
          finish(reject, new Error('IndexedDB open timed out'));
        }, 8000);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
        };
        request.onblocked = () => {
          finish(reject, new Error('IndexedDB open blocked'));
        };
        request.onerror = () => finish(reject, request.error || new Error('IndexedDB open failed'));
        request.onsuccess = () => {
          const db = request.result;
          let result;
          try {
            result = run(db);
          } catch (error) {
            db.close();
            finish(reject, error);
            return;
          }
          Promise.resolve(result).then(
            (value) => {
              db.close();
              finish(resolve, value);
            },
            (error) => {
              db.close();
              finish(reject, error);
            },
          );
        };
      });
    }

    function readClip() {
      return withClipDB((db) => new Promise((resolve, reject) => {
        const transaction = db.transaction(DB_STORE, 'readonly');
        const request = transaction.objectStore(DB_STORE).get(CLIP_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error('read failed'));
      }));
    }

    function writeClip(file) {
      return withClipDB((db) => new Promise((resolve, reject) => {
        const transaction = db.transaction(DB_STORE, 'readwrite');
        transaction.objectStore(DB_STORE).put(file, CLIP_KEY);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error('write failed'));
        transaction.onabort = () => reject(transaction.error || new Error('write aborted'));
      }));
    }

    function removeClip() {
      return withClipDB((db) => new Promise((resolve, reject) => {
        const transaction = db.transaction(DB_STORE, 'readwrite');
        transaction.objectStore(DB_STORE).delete(CLIP_KEY);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error('delete failed'));
      }));
    }

    function createStore(initial) {
      let value = initial;
      const listeners = new Set();
      return {
        getSnapshot: () => value,
        subscribe(listener) {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
        set(next) {
          if (next === value) return;
          value = next;
          for (const listener of [...listeners]) listener();
        },
      };
    }

    function truncate(value, max) {
      const text = String(value === null || value === undefined ? '' : value).replace(/\s+/g, ' ').trim();
      return text.length <= max ? text : text.slice(0, max - 1) + '…';
    }

    // --------------------------------------------------------------- sound --
    function createSoundPlayer() {
      let audio = null;
      let clipBuffer = null;
      let bufferedUrl = '';

      const ensure = () => {
        const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (typeof Ctor !== 'function') return null;
        if (audio === null || audio.state === 'closed') {
          try {
            audio = new Ctor();
          } catch {
            audio = null;
            return null;
          }
        }
        if (audio.state === 'suspended') {
          audio.resume().catch(() => {});
        }
        return audio;
      };

      const tone = (context, frequency, at, duration, type, peak) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, at);
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(at);
        oscillator.stop(at + duration + 0.02);
      };

      /** @returns whether the scheduled sound can actually be heard right now. */
      const playPreset = (name, volume) => {
        const context = ensure();
        if (context === null) return false;
        const peak = Math.max(0.0002, volume * 0.45);
        const now = context.currentTime + 0.02;
        if (name === 'bell') {
          tone(context, 1046.5, now, 1.1, 'sine', peak);
          tone(context, 2093, now, 0.62, 'sine', peak * 0.34);
          tone(context, 3135, now, 0.36, 'sine', peak * 0.16);
          return context.state === 'running';
        }
        if (name === 'ping') {
          tone(context, 1180, now, 0.2, 'sine', peak);
          return context.state === 'running';
        }
        // chime: a rising two-note pair.
        tone(context, 880, now, 0.24, 'triangle', peak);
        tone(context, 1318.5, now + 0.13, 0.36, 'triangle', peak * 0.9);
        return context.state === 'running';
      };

      const playClip = async (url, volume) => {
        const context = ensure();
        if (context === null) return;
        try {
          if (bufferedUrl !== url || clipBuffer === null) {
            const response = await fetch(url);
            const bytes = await response.arrayBuffer();
            clipBuffer = await context.decodeAudioData(bytes);
            bufferedUrl = url;
          }
          if (clipBuffer === null) return;
          const source = context.createBufferSource();
          const gain = context.createGain();
          source.buffer = clipBuffer;
          gain.gain.value = Math.max(0, Math.min(1, volume));
          source.connect(gain);
          gain.connect(context.destination);
          source.start();
        } catch {
          playPreset('chime', volume);
        }
      };

      return {
        unlock() {
          ensure();
        },
        /**
         * Play the configured sound.
         * @returns whether audio started; a custom clip reports optimistically.
         */
        play(config, url) {
          const volume = Math.max(0, Math.min(1, Number(config.volume)));
          if (config.sound === 'none') return false;
          if (config.sound === 'custom') {
            if (url) {
              const context = ensure();
              if (context === null) return false;
              void playClip(url, volume);
              return context.state === 'running';
            }
            return playPreset('chime', volume);
          }
          return playPreset(config.sound, volume);
        },
        resetClip() {
          clipBuffer = null;
          bufferedUrl = '';
        },
        dispose() {
          if (audio !== null) {
            try {
              void audio.close();
            } catch {
              /* Already closed. */
            }
            audio = null;
          }
        },
      };
    }

    // ---------------------------------------------------------- components --
    const TONE_COLOR = {
      interaction: 'var(--dsw-alias-state-business-primary)',
      interrupted: 'var(--dsw-alias-state-warn-primary)',
      completed: 'var(--dsw-alias-state-success-primary)',
    };

    /**
     * One row-scoped rule for the sidebar entry of the alerting session. The
     * browsers list marks each row with `data-row-key="session:<id>"`, so a
     * scoped rule pulses that row's box without touching host DOM.
     */
    function sidebarRowRule(sessionId, tone) {
      const id = String(sessionId).replace(/["\\]/g, '');
      const color = TONE_COLOR[tone] || TONE_COLOR.interaction;
      const selector = '[data-row-key="session:' + id + '"]';
      return selector + '{--aa-row-tone:' + color + ';box-shadow:inset 0 0 0 1.5px color-mix(in srgb,' + color + ' 45%,transparent)}'
        + '@media (prefers-reduced-motion:no-preference){' + selector + '{animation:aa-row-pulse 1.05s ease-in-out infinite}}';
    }

    function Switch({ checked, label, disabled, onChange }) {
      return h('button', {
        type: 'button',
        className: 'aa-switch',
        role: 'switch',
        'aria-checked': checked ? 'true' : 'false',
        'aria-label': label,
        title: label,
        disabled: Boolean(disabled),
        onClick: () => {
          if (!disabled) onChange(!checked);
        },
      });
    }

    function Row({ title, desc, children, last }) {
      return h(
        'div',
        { className: 'aa-row' + (last ? ' aa-last' : '') },
        h(
          'div',
          { className: 'aa-row-main' },
          h('div', { className: 'aa-title' }, title),
          desc ? h('div', { className: 'aa-desc' }, desc) : null,
        ),
        children ? h('div', { className: 'aa-control' }, children) : null,
      );
    }

    function AttentionToast({ useAttention, dismiss, openSession, t }) {
      const alert = useAttention((state) => state.alert);
      // A primitive key keeps the selector stable across renders; the encoded
      // pair drives the row rule this component owns while the flash window is open.
      const sidebarKey = useAttention((state) => (
        state.sidebar && state.sessionId ? JSON.stringify([state.sessionId, state.tone]) : ''
      ));
      // The live region stays mounted so screen readers announce a later alert
      // instead of seeing a freshly inserted region with its text already there.
      const target = alert && typeof alert.sessionId === 'string' ? alert.sessionId : null;
      const open = () => {
        if (target === null) return;
        if (openSession(target)) dismiss();
      };
      return h(
        'div',
        { className: 'aa-toast-wrap', style: { pointerEvents: 'none' } },
        h('style', { key: 'aa-style' }, STYLE + (sidebarKey === '' ? '' : sidebarRowRule(...JSON.parse(sidebarKey)))),
        h(
          'div',
          { key: 'live', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
          alert
            ? h(
              'div',
              { className: 'aa-toast aa-tone-' + alert.kind },
              h(
                'div',
                {
                  className: 'aa-toast-main',
                  ...(target === null
                    ? {}
                    : {
                      role: 'button',
                      tabIndex: 0,
                      'aria-label': alert.title + ' · ' + t('toast.open'),
                      title: t('toast.open'),
                      onClick: open,
                      onKeyDown: (event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        open();
                      },
                    }),
                },
                h('span', { className: 'aa-dot', 'aria-hidden': 'true' }),
                h(
                  'div',
                  { className: 'aa-toast-body' },
                  h('div', { className: 'aa-toast-title' }, alert.title),
                  alert.detail ? h('div', { className: 'aa-toast-detail' }, alert.detail) : null,
                  target === null
                    ? null
                    : h('div', { className: 'aa-toast-go' }, t('toast.open') + ' →'),
                ),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'aa-close',
                  'aria-label': t('toast.dismiss'),
                  title: t('toast.dismiss'),
                  onClick: dismiss,
                },
                '×',
              ),
            )
            : null,
        ),
      );
    }

    /** Pulsing marker in the left list row of the session that raised the alert. */
    function SidebarAttentionRow({ sessionId, useAttention, t }) {
      const tone = useAttention((state) => (
        state.sidebar && state.sessionId === sessionId ? state.tone : null
      ));
      if (tone === null) return null;
      return h('span', {
        key: 'aa-row-dot',
        className: 'aa-row-dot aa-tone-' + tone,
        role: 'img',
        'aria-label': t('sidebar.waiting'),
        title: t('sidebar.waiting'),
      });
    }

    function AttentionFrame({ children, useAttention }) {
      const flash = useAttention((state) => state.flash);
      const tone = useAttention((state) => state.tone);
      return h(
        React.Fragment,
        null,
        h('style', { key: 'aa-style' }, STYLE),
        children,
        flash
          ? h('div', {
            key: 'aa-glow',
            className: 'aa-glow aa-tone-' + (tone === 'interrupted' || tone === 'completed' ? tone : 'interaction'),
            'aria-hidden': 'true',
          })
          : null,
      );
    }

    function SettingsSection({ useConfig, update, preview, chooseClip, clearClip, showPreview, t }) {
      const config = useConfig((value) => value);
      const [error, setError] = useState('');
      const [notice, setNotice] = useState('');
      const [busy, setBusy] = useState(false);
      const input = useRef(null);

      const onFile = (event) => {
        const target = event.target;
        const file = target.files && target.files[0];
        if (!file) return;
        setNotice('');
        const looksAudio = /^audio\//i.test(file.type || '') || /\.(mp3|wav|m4a|aac|ogg|oga|flac)$/i.test(file.name || '');
        if (!looksAudio) {
          setError(t('clip.badType'));
          target.value = '';
          return;
        }
        if (file.size > MAX_CLIP_BYTES) {
          setError(t('clip.tooLarge'));
          target.value = '';
          return;
        }
        setError('');
        setBusy(true);
        chooseClip(file)
          .catch(() => {
            setError(t('clip.failed'));
          })
          .finally(() => {
            setBusy(false);
            target.value = '';
          });
      };

      const onClear = () => {
        setError('');
        setNotice('');
        setBusy(true);
        clearClip()
          .then(() => {
            setNotice(t('clip.cleared'));
          })
          .catch(() => {
            setError(t('clip.failed'));
          })
          .finally(() => {
            setBusy(false);
          });
      };

      const timingRows = [
        ['onInteraction', 'timing.interaction', 'timing.interaction.desc'],
        ['onInterrupted', 'timing.interrupted', 'timing.interrupted.desc'],
        ['onCompleted', 'timing.completed', 'timing.completed.desc'],
      ];

      return h(
        'div',
        { className: 'aa-section' },
        h('style', { key: 'aa-style' }, STYLE),
        h('p', { className: 'aa-intro' }, t('page.desc')),
        h(Row, {
          key: 'enabled',
          title: t('row.enabled'),
          desc: t('row.enabled.desc'),
          children: h(Switch, {
            checked: config.enabled,
            label: t('row.enabled'),
            onChange: (next) => update({ enabled: next }),
          }),
        }),
        h('div', { className: 'aa-group-title' }, t('timing.title')),
        ...timingRows.map(([key, titleKey, descKey]) => h(Row, {
          key,
          title: t(titleKey),
          desc: t(descKey),
          children: h(Switch, {
            checked: Boolean(config[key]),
            label: t(titleKey),
            disabled: !config.enabled,
            onChange: (next) => update({ [key]: next }),
          }),
        })),
        h('div', { className: 'aa-group-title' }, t('sound.title')),
        h(
          'div',
          { className: 'aa-row aa-stack' },
          h(
            'div',
            { className: 'aa-row-main' },
            h('div', { className: 'aa-desc' }, t('sound.desc')),
          ),
          h(
            'div',
            { className: 'aa-inline' },
            h(
              'select',
              {
                className: 'aa-select',
                value: config.sound,
                'aria-label': t('sound.title'),
                disabled: !config.enabled || busy,
                onChange: (event) => update({ sound: event.target.value }),
              },
              h('option', { value: 'chime' }, t('sound.chime')),
              h('option', { value: 'bell' }, t('sound.bell')),
              h('option', { value: 'ping' }, t('sound.ping')),
              h('option', { value: 'none' }, t('sound.none')),
              h('option', { value: 'custom' }, t('sound.custom')),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'aa-btn',
                disabled: !config.enabled || busy,
                onClick: () => {
                  if (input.current) input.current.click();
                },
              },
              t('sound.choose'),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'aa-btn',
                disabled: !config.enabled || config.sound === 'none',
                onClick: () => {
                  const started = preview();
                  setError('');
                  setNotice(started ? t('sound.played') : t('sound.blocked'));
                },
              },
              t('sound.preview'),
            ),
            config.sound === 'custom'
              ? h(
                'button',
                {
                  type: 'button',
                  className: 'aa-btn',
                  disabled: !config.enabled || busy,
                  onClick: onClear,
                },
                t('sound.clear'),
              )
              : null,
            h('input', {
              ref: input,
              type: 'file',
              accept: 'audio/*,.mp3,.wav,.m4a,.aac,.ogg,.oga,.flac',
              style: { display: 'none' },
              onChange: onFile,
            }),
          ),
          h(
            'div',
            { className: 'aa-desc' },
            config.sound === 'custom' && config.clipName
              ? t('sound.current').split('{name}').join(config.clipName)
              : config.sound === 'custom'
                ? t('sound.none.file')
                : '',
          ),
          h('div', { className: 'aa-hint' }, t('sound.hint')),
          error ? h('div', { className: 'aa-error', role: 'alert' }, error) : null,
          notice ? h('div', { className: 'aa-ok', role: 'status' }, notice) : null,
        ),
        h(
          Row,
          {
            key: 'volume',
            title: t('sound.volume'),
            children: [
              h('input', {
                key: 'range',
                className: 'aa-range',
                type: 'range',
                min: 0,
                max: 100,
                step: 5,
                value: Math.round(config.volume * 100),
                'aria-label': t('sound.volume'),
                disabled: !config.enabled || config.sound === 'none',
                onChange: (event) => update({ volume: Number(event.target.value) / 100 }),
              }),
              h('span', { key: 'value', className: 'aa-value' }, Math.round(config.volume * 100) + '%'),
            ],
          },
        ),
        h('div', { className: 'aa-group-title' }, t('visual.title')),
        h(Row, {
          key: 'flash',
          title: t('visual.flash'),
          desc: t('visual.flash.desc'),
          children: h(Switch, {
            checked: config.flash,
            label: t('visual.flash'),
            disabled: !config.enabled,
            onChange: (next) => update({ flash: next }),
          }),
        }),
        h(Row, {
          key: 'sidebar',
          title: t('visual.sidebar'),
          desc: t('visual.sidebar.desc'),
          children: h(Switch, {
            checked: config.sidebar,
            label: t('visual.sidebar'),
            disabled: !config.enabled,
            onChange: (next) => update({ sidebar: next }),
          }),
        }),
        h(Row, {
          key: 'toast',
          title: t('visual.toast'),
          desc: t('visual.toast.desc'),
          children: h(Switch, {
            checked: config.toast,
            label: t('visual.toast'),
            disabled: !config.enabled,
            onChange: (next) => update({ toast: next }),
          }),
        }),
        h(Row, {
          key: 'preview',
          title: t('preview.title'),
          desc: t('preview.desc'),
          last: true,
          children: h(
            'button',
            {
              type: 'button',
              className: 'aa-btn aa-primary',
              disabled: !config.enabled,
              onClick: showPreview,
            },
            t('preview.action'),
          ),
        }),
      );
    }

    // ------------------------------------------------------------ activation --
    return {
      inject: ['slots', 'sessions', 'uiSession', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'attention-alert: dictionaries');
        const t = ctx.locale.bind(NS);

        const config = createStore(readConfig());
        const attention = createStore({ alert: null, flash: false, sidebar: false, sessionId: null, tone: 'interaction' });
        const player = createSoundPlayer();

        // Turning a channel off also retires whatever that channel is showing.
        const saveConfig = (patch) => {
          const next = Object.freeze({ ...config.getSnapshot(), ...patch });
          config.set(next);
          writeConfig(next);
          if (!next.enabled || next.toast === false || next.flash === false || next.sidebar === false) {
            const current = attention.getSnapshot();
            attention.set({
              ...current,
              alert: next.enabled && next.toast ? current.alert : null,
              flash: next.enabled && next.flash ? current.flash : false,
              sidebar: next.enabled && next.sidebar ? current.sidebar : false,
            });
          }
        };

        let clipUrl = '';
        let alive = true;
        // Reconcile the stored file with the remembered name: a cleared browser
        // store must not leave the page advertising a file that no longer exists.
        void readClip()
          .then((blob) => {
            if (!alive) return;
            if (blob) {
              if (clipUrl === '') clipUrl = URL.createObjectURL(blob);
              return;
            }
            const cfg = config.getSnapshot();
            if (cfg.clipName !== '' || cfg.sound === 'custom') {
              saveConfig({ sound: cfg.sound === 'custom' ? 'chime' : cfg.sound, clipName: '' });
            }
          })
          .catch(() => {});

        const timers = new Set();
        const later = (run, ms) => {
          const id = setTimeout(() => {
            timers.delete(id);
            run();
          }, ms);
          timers.add(id);
          return id;
        };
        let flashTimer = null;

        const dismiss = () => {
          const current = attention.getSnapshot();
          if (current.alert === null && !current.flash && !current.sidebar) return;
          attention.set({ ...current, alert: null, flash: false, sidebar: false });
        };

        let alertSeq = 0;
        // One audible and visible alert: sound, notice, flash. Callers decide whether
        // this moment warrants one.
        const present = (kind, title, detail, flashAllowed, sessionId) => {
          const cfg = config.getSnapshot();
          try {
            player.play(cfg, clipUrl);
          } catch {
            /* An audio failure never suppresses the visual alert. */
          }
          const owner = typeof sessionId === 'string' ? sessionId : null;
          const alert = Object.freeze({
            id: ++alertSeq,
            kind,
            title,
            detail: detail || '',
            sessionId: owner,
          });
          // The conversation flash only runs where the reader can see the
          // conversation that raised it; a background session still gets the
          // notice, the sound, and its own row highlighted in the left list.
          const flash = cfg.flash && flashAllowed !== false;
          const sidebar = cfg.sidebar && owner !== null;
          attention.set({
            alert: cfg.toast ? alert : null,
            flash,
            sidebar,
            sessionId: owner,
            tone: kind,
          });
          later(() => {
            const current = attention.getSnapshot();
            if (current.alert && current.alert.id === alert.id) {
              attention.set({ ...current, alert: null });
            }
          }, ALERT_MS);
          if (flash || sidebar) {
            if (flashTimer !== null) {
              clearTimeout(flashTimer);
              timers.delete(flashTimer);
            }
            flashTimer = later(() => {
              flashTimer = null;
              const current = attention.getSnapshot();
              if (current.flash || current.sidebar) attention.set({ ...current, flash: false, sidebar: false });
            }, FLASH_MS);
          }
        };

        const notify = (kind, title, detail, flashAllowed, sessionId) => {
          const cfg = config.getSnapshot();
          if (!cfg.enabled) return;
          if (kind === 'interaction' && !cfg.onInteraction) return;
          if (kind === 'interrupted' && !cfg.onInterrupted) return;
          if (kind === 'completed' && !cfg.onCompleted) return;
          present(kind, title, detail, flashAllowed, sessionId);
        };

        const sessionTitleOf = (sessionId) => {
          try {
            const list = ctx.sessions.list.getSnapshot();
            const row = list.byId[sessionId];
            return row && typeof row.title === 'string' ? truncate(row.title, 80) : '';
          } catch {
            return '';
          }
        };

        // 1. A pending interaction anywhere (approval, question, plan review).
        let pendingBySession = new Map();
        const scanPending = () => {
          let snapshot;
          try {
            snapshot = ctx.uiSession.sessionStatus.getSnapshot();
          } catch {
            return [];
          }
          const next = new Map();
          const fresh = [];
          for (const [sessionId, status] of snapshot) {
            const interaction = status ? status.pendingInteraction : undefined;
            if (interaction === undefined || interaction === null) continue;
            next.set(sessionId, interaction);
            if (pendingBySession.get(sessionId) !== interaction) fresh.push({ sessionId, interaction });
          }
          pendingBySession = next;
          return fresh;
        };

        const onStatus = () => {
          const fresh = scanPending();
          if (fresh.length === 0) return;
          const first = fresh[0];
          const interaction = first.interaction;
          const kind = typeof interaction.kind === 'string' ? interaction.kind : '';
          let title = t('alert.interaction.other');
          if (kind === 'approval') title = t('alert.interaction.approval');
          else if (kind === 'question') title = t('alert.interaction.question');
          else if (kind === 'plan-review') title = t('alert.interaction.plan');
          const isMain = first.sessionId === currentMainId();
          const sessionTitle = sessionTitleOf(first.sessionId);
          const parts = [];
          if (!isMain && sessionTitle) {
            parts.push(t('alert.interaction.session').split('{session}').join(sessionTitle));
          }
          if (kind === 'approval' && typeof interaction.toolName === 'string' && interaction.toolName !== '') {
            parts.push(t('alert.interaction.tool').split('{tool}').join(interaction.toolName));
          }
          if (fresh.length > 1) {
            parts.push(t('alert.interaction.more').split('{count}').join(String(fresh.length - 1)));
          }
          notify('interaction', title, parts.join(' · '), isMain, first.sessionId);
        };

        // 2. A live turn that ended by interruption, failure, or completion.
        const handleTurnEnd = (reason, sessionId) => {
          const kind = reason && typeof reason.kind === 'string' ? reason.kind : '';
          if (kind === 'completed') {
            notify('completed', t('alert.completed'), '', true, sessionId);
            return;
          }
          if (kind === 'aborted') {
            const cause = reason.reason && typeof reason.reason.kind === 'string' ? reason.reason.kind : '';
            // Teardown cancels are not something the reader can act on.
            if (cause !== 'disposed') notify('interrupted', t('alert.interrupted'), t('detail.stop'), true, sessionId);
            return;
          }
          if (kind === 'error') {
            const message = reason.error && typeof reason.error.message === 'string'
              ? truncate(reason.error.message, 120)
              : '';
            notify('interrupted', t('alert.error'), message || t('detail.error'), true, sessionId);
            return;
          }
          if (kind === 'max-tokens') {
            notify('interrupted', t('alert.interrupted'), t('detail.maxTokens'), true, sessionId);
            return;
          }
          if (kind === 'blocked') {
            notify('interrupted', t('alert.interrupted'), t('detail.blocked'), true, sessionId);
            return;
          }
          if (kind === 'interrupted') {
            notify('interrupted', t('alert.interrupted'), t('detail.crash'), true, sessionId);
          }
          // 'forked' and unknown extension kinds stay silent.
        };

        const onFeed = (sessionId) => {
          const binding = ctx.sessions.binding(sessionId);
          if (binding === undefined) return;
          const change = binding.eventSource.getSnapshot().change;
          if (!change || change.kind !== 'append') return;
          for (const entry of change.entries) {
            if (!entry || entry.type !== 'event' || !entry.event) continue;
            const event = entry.event;
            if (event.type !== 'turn/end' || !event.data || !event.data.reason) continue;
            handleTurnEnd(event.data.reason, sessionId);
          }
        };

        const currentMainId = () => {
          const list = ctx.sessions.list.getSnapshot();
          for (const id of list.ids) {
            const row = list.byId[id];
            const retained = row && row.retainedBy ? row.retainedBy.mainView : undefined;
            if ((retained || 0) > 0) return id;
          }
          return undefined;
        };

        let followedId;
        let offRetain = null;
        let offFeed = null;
        const followMain = () => {
          const id = currentMainId();
          if (id === followedId && (id === undefined || offFeed !== null)) return;
          if (offFeed !== null) {
            offFeed();
            offFeed = null;
          }
          if (offRetain !== null) {
            offRetain();
            offRetain = null;
          }
          followedId = id;
          if (id === undefined) return;
          offRetain = ctx.sessions.retainInfo(id).subscribe(followMain);
          const binding = ctx.sessions.binding(id);
          if (binding === undefined) return;
          offFeed = binding.eventSource.subscribe(() => onFeed(id));
        };

        ctx.effect(() => {
          const offList = ctx.sessions.list.subscribe(followMain);
          followMain();
          return () => {
            offList();
            if (offFeed !== null) offFeed();
            if (offRetain !== null) offRetain();
          };
        }, 'attention-alert: main session feed');

        ctx.effect(() => ctx.uiSession.sessionStatus.subscribe(onStatus), 'attention-alert: pending interactions');
        onStatus();

        ctx.effect(() => {
          const engage = () => {
            player.unlock();
            // A reader who is already interacting does not need the rest of a strobe.
            const current = attention.getSnapshot();
            if (current.flash) attention.set({ ...current, flash: false });
          };
          document.addEventListener('pointerdown', engage, true);
          document.addEventListener('keydown', engage, true);
          return () => {
            document.removeEventListener('pointerdown', engage, true);
            document.removeEventListener('keydown', engage, true);
          };
        }, 'attention-alert: audio unlock');

        ctx.effect(() => () => {
          alive = false;
          for (const id of timers) clearTimeout(id);
          timers.clear();
          if (clipUrl !== '') {
            try {
              URL.revokeObjectURL(clipUrl);
            } catch {
              /* A revoked URL stays revoked. */
            }
            clipUrl = '';
          }
          player.dispose();
        }, 'attention-alert: teardown');

        // 3. Settings: sound choice, file, volume, timings, visual channels.
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'attention-alert',
          order: 40,
          label: () => t('nav'),
          locale: NS,
          inject: () => ({
            hooks: { config },
            update: saveConfig,
            preview: () => player.play(config.getSnapshot(), clipUrl),
            showPreview: () => {
              present('interaction', t('preview.alert'), t('preview.detail'));
            },
            chooseClip: async (file) => {
              await writeClip(file);
              if (clipUrl !== '') {
                try {
                  URL.revokeObjectURL(clipUrl);
                } catch {
                  /* Ignore. */
                }
              }
              clipUrl = URL.createObjectURL(file);
              player.resetClip();
              saveConfig({ sound: 'custom', clipName: file.name || '' });
            },
            clearClip: async () => {
              await removeClip();
              if (clipUrl !== '') {
                try {
                  URL.revokeObjectURL(clipUrl);
                } catch {
                  /* Ignore. */
                }
                clipUrl = '';
              }
              player.resetClip();
              saveConfig({ sound: 'chime', clipName: '' });
            },
          }),
        }, SettingsSection));

        // Clicking the notice reveals the conversation that raised it. The
        // workspace UI is optional: without it the notice stays dismissable.
        const revealSession = (sessionId) => {
          const workspace = ctx.get('uiWorkspace');
          if (!workspace || typeof workspace.openSession !== 'function') return false;
          try {
            workspace.openSession(sessionId);
            return true;
          } catch {
            return false;
          }
        };

        // 4. The left list's own row for the alerting session gets a pulsing marker.
        ctx.slots.inject('sidebar.session.row.trailing', () => ctx.slots.register({
          name: 'sidebar.session.row.trailing',
          id: 'attention-alert-row',
          order: 0,
          locale: NS,
          inject: () => ({ hooks: { attention } }),
        }, SidebarAttentionRow));

        // 5. The floating notice lives in the frame-wide overlay layer.
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'attention-alert-toast',
          locale: NS,
          inject: () => ({ hooks: { attention }, dismiss, openSession: revealSession }),
        }, AttentionToast));

        // 6. The flash wraps the Conversation scroll body through the frame layer,
        // so it highlights the conversation itself and never covers the window chrome.
        ctx.slots.inject('conversation.hero.frame', () => ctx.slots.register({
          name: 'conversation.hero.frame',
          id: 'attention-alert-flash',
          order: 100,
          inject: () => ({ hooks: { attention } }),
        }, AttentionFrame));
      },
    };
  },
});
