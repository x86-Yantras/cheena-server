import {
  RASHI_LORDS, VARNA_BY_RASHI, VARNA_RANK,
  VASHYA_GROUP_BY_RASHI, VASHYA_MATRIX,
  YONI_BY_NAKSHATRA, YONI_ENEMY_PAIRS,
  GANA_BY_NAKSHATRA, GANA_MATRIX,
  PLANET_FRIENDSHIP,
} from './matchData.js';

function friendshipRelation(lordA, lordB) {
  if (lordA === lordB) return 'same';
  if (PLANET_FRIENDSHIP[lordA].friends.includes(lordB)) return 'friend';
  if (PLANET_FRIENDSHIP[lordA].enemies.includes(lordB)) return 'enemy';
  return 'neutral';
}

const COMBINED_FRIENDSHIP_SCORES = {
  friend_friend: 5,
  friend_neutral: 4,
  neutral_friend: 4,
  neutral_neutral: 3,
  friend_enemy: 1,
  enemy_friend: 1,
  neutral_enemy: 0.5,
  enemy_neutral: 0.5,
  enemy_enemy: 0,
};

function combinedFriendshipScore(relAB, relBA) {
  return COMBINED_FRIENDSHIP_SCORES[`${relAB}_${relBA}`];
}

function varnaKoot(groomRashiIndex, brideRashiIndex) {
  const groomVarna = VARNA_BY_RASHI[groomRashiIndex];
  const brideVarna = VARNA_BY_RASHI[brideRashiIndex];
  const points = VARNA_RANK[groomVarna] >= VARNA_RANK[brideVarna] ? 1 : 0;
  return {
    key: 'varna', name: 'Varna', points, maxPoints: 1, exceptionApplied: false,
    note: `Groom: ${groomVarna}, Bride: ${brideVarna}`,
  };
}

function vashyaKoot(groomRashiIndex, brideRashiIndex) {
  const groomGroup = VASHYA_GROUP_BY_RASHI[groomRashiIndex];
  const brideGroup = VASHYA_GROUP_BY_RASHI[brideRashiIndex];
  const points = VASHYA_MATRIX[groomGroup][brideGroup];
  return {
    key: 'vashya', name: 'Vashya', points, maxPoints: 2, exceptionApplied: false,
    note: `Groom: ${groomGroup}, Bride: ${brideGroup}`,
  };
}

function grahaMaitriKoot(groomRashiIndex, brideRashiIndex) {
  const groomLord = RASHI_LORDS[groomRashiIndex];
  const brideLord = RASHI_LORDS[brideRashiIndex];
  const points = groomLord === brideLord
    ? 5
    : combinedFriendshipScore(
      friendshipRelation(groomLord, brideLord),
      friendshipRelation(brideLord, groomLord),
    );
  return {
    key: 'grahaMaitri', name: 'Graha Maitri', points, maxPoints: 5, exceptionApplied: false,
    note: `Groom rashi lord: ${groomLord}, Bride rashi lord: ${brideLord}`,
  };
}

const GOOD_TARA_CATEGORIES = new Set([2, 4, 6, 8, 9]);

function taraCategory(fromNakshatraIndex, toNakshatraIndex) {
  const count = ((toNakshatraIndex - fromNakshatraIndex + 27) % 27) + 1;
  return ((count - 1) % 9) + 1;
}

function taraKoot(groomNakshatraIndex, brideNakshatraIndex) {
  const groomToBride = taraCategory(groomNakshatraIndex, brideNakshatraIndex);
  const brideToGroom = taraCategory(brideNakshatraIndex, groomNakshatraIndex);
  const points = (GOOD_TARA_CATEGORIES.has(groomToBride) ? 1.5 : 0)
    + (GOOD_TARA_CATEGORIES.has(brideToGroom) ? 1.5 : 0);
  return {
    key: 'tara', name: 'Tara', points, maxPoints: 3, exceptionApplied: false,
    note: `Groom-to-bride tara ${groomToBride}, bride-to-groom tara ${brideToGroom}`,
  };
}

function yoniPairIsEnemy(yoniA, yoniB) {
  return YONI_ENEMY_PAIRS.some(([a, b]) => (a === yoniA && b === yoniB) || (a === yoniB && b === yoniA));
}

function yoniKoot(groomNakshatraIndex, brideNakshatraIndex) {
  const groomYoni = YONI_BY_NAKSHATRA[groomNakshatraIndex];
  const brideYoni = YONI_BY_NAKSHATRA[brideNakshatraIndex];
  let points;
  if (groomYoni === brideYoni) points = 4;
  else if (yoniPairIsEnemy(groomYoni, brideYoni)) points = 0;
  else points = 2;
  return {
    key: 'yoni', name: 'Yoni', points, maxPoints: 4, exceptionApplied: false,
    note: `Groom: ${groomYoni}, Bride: ${brideYoni}`,
  };
}

function ganaKoot(groomNakshatraIndex, brideNakshatraIndex) {
  const groomGana = GANA_BY_NAKSHATRA[groomNakshatraIndex];
  const brideGana = GANA_BY_NAKSHATRA[brideNakshatraIndex];
  const points = GANA_MATRIX[groomGana][brideGana];
  return {
    key: 'gana', name: 'Gana', points, maxPoints: 6, exceptionApplied: false,
    note: `Groom: ${groomGana}, Bride: ${brideGana}`,
  };
}

export {
  friendshipRelation, combinedFriendshipScore,
  varnaKoot, vashyaKoot, grahaMaitriKoot,
  taraKoot, yoniKoot, ganaKoot,
};
