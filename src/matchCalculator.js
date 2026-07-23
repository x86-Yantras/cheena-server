import {
  RASHI_LORDS, VARNA_BY_RASHI, VARNA_RANK,
  VASHYA_GROUP_BY_RASHI, VASHYA_MATRIX,
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

export {
  friendshipRelation, combinedFriendshipScore,
  varnaKoot, vashyaKoot, grahaMaitriKoot,
};
