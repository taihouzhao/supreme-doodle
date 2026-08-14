/**
 * Package entry: Classic Engine core. Renderer must not mutate WorldState.
 * Do not import another game's rules into this package.
 */
export { dispatch, createInitialWorld, fingerprint } from "../core/index";
export { lianchengContent } from "../content/liancheng";
export { GAME_ID, GAME_TITLE } from "./identity";
