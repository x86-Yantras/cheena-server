import {
  RASHI_LORDS, VARNA_BY_RASHI, VARNA_RANK,
  VASHYA_GROUP_BY_RASHI, VASHYA_MATRIX,
  YONI_BY_NAKSHATRA, YONI_ENEMY_PAIRS,
  GANA_BY_NAKSHATRA, GANA_MATRIX,
  NADI_BY_NAKSHATRA,
  PLANET_FRIENDSHIP,
  MANGAL_DOSHA_HOUSES, MARS_OWN_RASHIS, MARS_EXALTED_RASHI,
  DASHA_SANDHI_WINDOW_YEARS,
} from './matchData.js';
import { DASHA_SEQUENCE } from './dashaCalculator.js';

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

const BHAKOOT_DOSHA_DISTANCES = new Set([2, 5, 6, 8, 9, 12]);

function bhakootKoot(groomRashiIndex, brideRashiIndex) {
  const distance = ((brideRashiIndex - groomRashiIndex + 12) % 12) + 1;
  if (!BHAKOOT_DOSHA_DISTANCES.has(distance)) {
    return {
      key: 'bhakoot', name: 'Bhakoot', points: 7, maxPoints: 7, exceptionApplied: false,
      note: `Rashi distance ${distance}, no dosha`,
    };
  }
  const groomLord = RASHI_LORDS[groomRashiIndex];
  const brideLord = RASHI_LORDS[brideRashiIndex];
  const sameOrFriendLords = groomLord === brideLord
    || friendshipRelation(groomLord, brideLord) === 'friend'
    || friendshipRelation(brideLord, groomLord) === 'friend';
  if (sameOrFriendLords) {
    return {
      key: 'bhakoot', name: 'Bhakoot', points: 7, maxPoints: 7, exceptionApplied: true,
      note: `Rashi distance ${distance} would cause dosha, cancelled by rashi-lord friendship`,
    };
  }
  return {
    key: 'bhakoot', name: 'Bhakoot', points: 0, maxPoints: 7, exceptionApplied: false,
    note: `Rashi distance ${distance} causes dosha`,
  };
}

function nadiKoot(groomNakshatraIndex, brideNakshatraIndex, groomRashiIndex, brideRashiIndex) {
  const groomNadi = NADI_BY_NAKSHATRA[groomNakshatraIndex];
  const brideNadi = NADI_BY_NAKSHATRA[brideNakshatraIndex];
  if (groomNadi !== brideNadi) {
    return {
      key: 'nadi', name: 'Nadi', points: 8, maxPoints: 8, exceptionApplied: false,
      note: `Groom: ${groomNadi}, Bride: ${brideNadi}`,
    };
  }
  const sameNakshatraDifferentRashi = groomNakshatraIndex === brideNakshatraIndex
    && groomRashiIndex !== brideRashiIndex;
  const differentNakshatraDifferentRashiLord = groomNakshatraIndex !== brideNakshatraIndex
    && groomRashiIndex !== brideRashiIndex
    && RASHI_LORDS[groomRashiIndex] !== RASHI_LORDS[brideRashiIndex];
  const exceptionApplied = sameNakshatraDifferentRashi || differentNakshatraDifferentRashiLord;
  return {
    key: 'nadi', name: 'Nadi', points: exceptionApplied ? 8 : 0, maxPoints: 8, exceptionApplied,
    note: exceptionApplied
      ? `Same Nadi (${groomNadi}) but cancelled by exception`
      : `Same Nadi (${groomNadi}), dosha applies`,
  };
}

function computeManglik(planets) {
  const mars = planets.find((p) => p.key === 'MARS');
  const inDoshaHouse = MANGAL_DOSHA_HOUSES.includes(mars.house);
  const isStrong = MARS_OWN_RASHIS.includes(mars.rashiIndex) || mars.rashiIndex === MARS_EXALTED_RASHI;
  const cancelled = inDoshaHouse && isStrong;
  return {
    isManglik: inDoshaHouse && !cancelled,
    cancelled,
    note: !inDoshaHouse
      ? 'Mars is not in a Manglik-causing house'
      : cancelled
        ? 'Mars is in a Manglik-causing house but is strong (own/exalted sign), cancelling the dosha'
        : 'Mars is in a Manglik-causing house',
  };
}

function computeManglikPair(groomPlanets, bridePlanets) {
  const groom = computeManglik(groomPlanets);
  const bride = computeManglik(bridePlanets);
  let verdict;
  if (groom.isManglik && bride.isManglik) verdict = 'both';
  else if (!groom.isManglik && !bride.isManglik) verdict = 'neither';
  else verdict = 'mismatch';
  return { groom, bride, verdict };
}

function computeDashaSandhi(dasha, windowYears = DASHA_SANDHI_WINDOW_YEARS) {
  const currentMahadasha = dasha.mahadashas[0];
  const totalYears = DASHA_SEQUENCE.find((d) => d.lord === currentMahadasha.lord).years;
  const elapsedYears = totalYears - dasha.balanceYears;
  const remainingYears = dasha.balanceYears;
  return elapsedYears < windowYears || remainingYears < windowYears;
}

function computeAshtakoot(groomMoon, brideMoon) {
  const koots = [
    varnaKoot(groomMoon.rashiIndex, brideMoon.rashiIndex),
    vashyaKoot(groomMoon.rashiIndex, brideMoon.rashiIndex),
    taraKoot(groomMoon.nakshatraIndex, brideMoon.nakshatraIndex),
    yoniKoot(groomMoon.nakshatraIndex, brideMoon.nakshatraIndex),
    grahaMaitriKoot(groomMoon.rashiIndex, brideMoon.rashiIndex),
    ganaKoot(groomMoon.nakshatraIndex, brideMoon.nakshatraIndex),
    bhakootKoot(groomMoon.rashiIndex, brideMoon.rashiIndex),
    nadiKoot(groomMoon.nakshatraIndex, brideMoon.nakshatraIndex, groomMoon.rashiIndex, brideMoon.rashiIndex),
  ];
  const totalPoints = koots.reduce((sum, k) => sum + k.points, 0);
  return { koots, totalPoints, maxPoints: 36 };
}

function computeVerdict(totalPoints, manglikVerdict) {
  let band;
  if (totalPoints < 18) band = 'not_recommended';
  else if (totalPoints < 25) band = 'average';
  else if (totalPoints < 33) band = 'good';
  else band = 'excellent';
  return { band, totalPoints, caution: manglikVerdict === 'mismatch' };
}

function computeMatch(groomResult, brideResult) {
  const groomMoon = groomResult.planets.find((p) => p.key === 'MOON');
  const brideMoon = brideResult.planets.find((p) => p.key === 'MOON');
  const ashtakoot = computeAshtakoot(groomMoon, brideMoon);
  const manglik = computeManglikPair(groomResult.planets, brideResult.planets);
  const dashaSandhi = {
    groom: computeDashaSandhi(groomResult.dasha),
    bride: computeDashaSandhi(brideResult.dasha),
  };
  const verdict = computeVerdict(ashtakoot.totalPoints, manglik.verdict);
  return { ashtakoot, manglik, dashaSandhi, verdict };
}

export {
  friendshipRelation, combinedFriendshipScore,
  varnaKoot, vashyaKoot, grahaMaitriKoot,
  taraKoot, yoniKoot, ganaKoot,
  bhakootKoot, nadiKoot,
  computeManglik, computeManglikPair, computeDashaSandhi,
  computeAshtakoot, computeVerdict, computeMatch,
};
