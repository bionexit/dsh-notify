/**
 * Host half of @local/attention-alert.
 *
 * The capability is entirely browser-side: the Client bundle watches the
 * Session status sources and plays the sound. This Host row exists so the
 * bundle has a plugin row (and an on/off switch) in Plugins; it registers
 * nothing and never reaches a model request.
 */
export function apply() {}
