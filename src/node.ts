/**
 * Loophaus Node-only API — offline rendering to WAV and MIDI files.
 *
 *   import { renderWebAudio } from "loophaus/node";
 *
 * Requires node-web-audio-api (native module) and filesystem access.
 * Browser consumers should import from the package root instead.
 */
export { renderWebAudio } from "./midi/web_audio.ts";
export { renderMidi } from "./midi/render.ts";
export {
  renderInstrumentNote,
  bufferRms,
  midiToHz,
  type RenderNoteOptions,
} from "./midi/render_instrument.ts";
