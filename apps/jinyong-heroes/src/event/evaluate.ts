import type { ConditionTree, WorldState } from "../core/types";

export function evaluateCondition(state: WorldState, tree: ConditionTree): boolean {
  if ("all" in tree) {
    return tree.all.every((node) => evaluateCondition(state, node));
  }
  if ("any" in tree) {
    return tree.any.some((node) => evaluateCondition(state, node));
  }
  if ("not" in tree) {
    return !evaluateCondition(state, tree.not);
  }
  if ("flagNotSet" in tree) {
    const value = state.flags[tree.flagNotSet];
    return value === undefined || value === false;
  }
  if ("flag" in tree) {
    const actual = state.flags[tree.flag];
    if (tree.equals === undefined) {
      return Boolean(actual);
    }
    return actual === tree.equals;
  }
  if ("hasItem" in tree) {
    return (state.inventory[tree.hasItem] ?? 0) >= (tree.count ?? 1);
  }
  if ("inParty" in tree) {
    return state.party.includes(tree.inParty);
  }
  if ("partyFull" in tree) {
    return state.party.length >= state.partyMax === tree.partyFull;
  }
  if ("moral" in tree) {
    if (tree.moral.min !== undefined && state.moral < tree.moral.min) return false;
    if (tree.moral.max !== undefined && state.moral > tree.moral.max) return false;
    return true;
  }
  if ("reputation" in tree) {
    if (tree.reputation.min !== undefined && state.reputation < tree.reputation.min) return false;
    if (tree.reputation.max !== undefined && state.reputation > tree.reputation.max) return false;
    return true;
  }
  if ("locationKnown" in tree) {
    return state.knownLocations.includes(tree.locationKnown);
  }
  if ("heavenBookCount" in tree) {
    return state.heavenBooks.length >= tree.heavenBookCount.min;
  }
  if ("npcAlive" in tree) {
    return state.npcAlive[tree.npcAlive] === true;
  }
  if ("battleWon" in tree) {
    return state.battlesWon.includes(tree.battleWon);
  }
  const _never: never = tree;
  return _never;
}
