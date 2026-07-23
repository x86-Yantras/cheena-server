import { describe, it, expect } from 'vitest';
import {
  friendshipRelation, combinedFriendshipScore,
  varnaKoot, vashyaKoot, grahaMaitriKoot,
  taraKoot, yoniKoot, ganaKoot,
  bhakootKoot, nadiKoot,
} from '../src/matchCalculator.js';

describe('friendshipRelation', () => {
  it('returns same for identical lords', () => {
    expect(friendshipRelation('MARS', 'MARS')).toBe('same');
  });

  it('returns friend when listed as a friend', () => {
    expect(friendshipRelation('SUN', 'MOON')).toBe('friend');
  });

  it('returns enemy when listed as an enemy', () => {
    expect(friendshipRelation('SUN', 'VENUS')).toBe('enemy');
  });

  it('returns neutral otherwise', () => {
    expect(friendshipRelation('MOON', 'MARS')).toBe('neutral');
  });
});

describe('combinedFriendshipScore', () => {
  it('scores friend-friend as 5', () => {
    expect(combinedFriendshipScore('friend', 'friend')).toBe(5);
  });

  it('scores friend-neutral (either order) as 4', () => {
    expect(combinedFriendshipScore('friend', 'neutral')).toBe(4);
    expect(combinedFriendshipScore('neutral', 'friend')).toBe(4);
  });

  it('scores neutral-neutral as 3', () => {
    expect(combinedFriendshipScore('neutral', 'neutral')).toBe(3);
  });

  it('scores friend-enemy (either order) as 1', () => {
    expect(combinedFriendshipScore('friend', 'enemy')).toBe(1);
    expect(combinedFriendshipScore('enemy', 'friend')).toBe(1);
  });

  it('scores neutral-enemy (either order) as 0.5', () => {
    expect(combinedFriendshipScore('neutral', 'enemy')).toBe(0.5);
    expect(combinedFriendshipScore('enemy', 'neutral')).toBe(0.5);
  });

  it('scores enemy-enemy as 0', () => {
    expect(combinedFriendshipScore('enemy', 'enemy')).toBe(0);
  });
});

describe('varnaKoot', () => {
  it('awards 1 point when the groom varna rank is equal or higher', () => {
    // rashi 3 (Karka/Cancer) = brahmin (rank 4), rashi 0 (Mesha/Aries) = kshatriya (rank 3)
    const result = varnaKoot(3, 0);
    expect(result).toMatchObject({ key: 'varna', points: 1, maxPoints: 1, exceptionApplied: false });
  });

  it('awards 0 points when the groom varna rank is lower', () => {
    const result = varnaKoot(0, 3);
    expect(result).toMatchObject({ key: 'varna', points: 0, maxPoints: 1, exceptionApplied: false });
  });
});

describe('vashyaKoot', () => {
  it('awards 0 points for chatushpada vs vanachara', () => {
    const result = vashyaKoot(0, 4);
    expect(result).toMatchObject({ key: 'vashya', points: 0, maxPoints: 2, exceptionApplied: false });
  });

  it('awards 2 points for two manava rashis', () => {
    const result = vashyaKoot(2, 2);
    expect(result).toMatchObject({ key: 'vashya', points: 2, maxPoints: 2, exceptionApplied: false });
  });
});

describe('grahaMaitriKoot', () => {
  it('awards 5 points when both rashis share the same lord', () => {
    // rashi 0 (Mesha) and rashi 7 (Vrishchika/Scorpio) are both ruled by Mars
    const result = grahaMaitriKoot(0, 7);
    expect(result).toMatchObject({ key: 'grahaMaitri', points: 5, maxPoints: 5, exceptionApplied: false });
  });

  it('awards 4 points for a friend/neutral combination', () => {
    // rashi 3 (Karka, lord Moon) -> rashi 0 (Mesha, lord Mars):
    // Moon->Mars is neutral, Mars->Moon is friend
    const result = grahaMaitriKoot(3, 0);
    expect(result).toMatchObject({ key: 'grahaMaitri', points: 4, maxPoints: 5, exceptionApplied: false });
  });
});

describe('taraKoot', () => {
  it('awards full 3 points when both directions land on a good tara', () => {
    // groom nak 0 -> bride nak 1: count 2 (good). bride nak 1 -> groom nak 0: count 9 (good).
    const result = taraKoot(0, 1);
    expect(result).toMatchObject({ key: 'tara', points: 3, maxPoints: 3, exceptionApplied: false });
  });

  it('awards 1.5 points when only one direction lands on a good tara', () => {
    // groom nak 0 -> bride nak 2: count 3 (bad). bride nak 2 -> groom nak 0: count 8 (good).
    const result = taraKoot(0, 2);
    expect(result).toMatchObject({ key: 'tara', points: 1.5, maxPoints: 3, exceptionApplied: false });
  });
});

describe('yoniKoot', () => {
  it('awards 4 points for the same yoni', () => {
    // nak 0 and nak 23 are both "horse"
    const result = yoniKoot(0, 23);
    expect(result).toMatchObject({ key: 'yoni', points: 4, maxPoints: 4, exceptionApplied: false });
  });

  it('awards 0 points for an enemy yoni pair', () => {
    // nak 0 (horse) vs nak 12 (buffalo) - enemy pair
    const result = yoniKoot(0, 12);
    expect(result).toMatchObject({ key: 'yoni', points: 0, maxPoints: 4, exceptionApplied: false });
  });

  it('awards 2 points for an unrelated yoni pair', () => {
    // nak 0 (horse) vs nak 1 (elephant) - not same, not enemies
    const result = yoniKoot(0, 1);
    expect(result).toMatchObject({ key: 'yoni', points: 2, maxPoints: 4, exceptionApplied: false });
  });
});

describe('ganaKoot', () => {
  it('awards 1 point for deva groom vs rakshasa bride', () => {
    // nak 0 = deva, nak 2 = rakshasa
    const result = ganaKoot(0, 2);
    expect(result).toMatchObject({ key: 'gana', points: 1, maxPoints: 6, exceptionApplied: false });
  });

  it('awards 6 points for two manushya nakshatras', () => {
    // nak 1 and nak 10 are both manushya
    const result = ganaKoot(1, 10);
    expect(result).toMatchObject({ key: 'gana', points: 6, maxPoints: 6, exceptionApplied: false });
  });
});

describe('bhakootKoot', () => {
  it('awards 7 points with no dosha when the rashi distance is not a dosha distance', () => {
    // rashi 0 -> rashi 3: distance 4, not in the dosha set
    const result = bhakootKoot(0, 3);
    expect(result).toMatchObject({ key: 'bhakoot', points: 7, maxPoints: 7, exceptionApplied: false });
  });

  it('awards 0 points when the distance is a dosha distance and lords are unrelated', () => {
    // rashi 0 (Mars) -> rashi 1 (Venus): distance 2, Mars/Venus are not friends or same
    const result = bhakootKoot(0, 1);
    expect(result).toMatchObject({ key: 'bhakoot', points: 0, maxPoints: 7, exceptionApplied: false });
  });

  it('cancels the dosha (exception) when the distance is a dosha distance but the lords match', () => {
    // rashi 0 and rashi 7 are both ruled by Mars: distance 8, in the dosha set
    const result = bhakootKoot(0, 7);
    expect(result).toMatchObject({ key: 'bhakoot', points: 7, maxPoints: 7, exceptionApplied: true });
  });
});

describe('nadiKoot', () => {
  it('awards 8 points with no dosha when nadis differ', () => {
    const result = nadiKoot(0, 1, 0, 1);
    expect(result).toMatchObject({ key: 'nadi', points: 8, maxPoints: 8, exceptionApplied: false });
  });

  it('awards 0 points for same nadi, same nakshatra, same rashi', () => {
    const result = nadiKoot(0, 0, 0, 0);
    expect(result).toMatchObject({ key: 'nadi', points: 0, maxPoints: 8, exceptionApplied: false });
  });

  it('cancels the dosha for same nadi, same nakshatra, different rashi', () => {
    const result = nadiKoot(0, 0, 0, 1);
    expect(result).toMatchObject({ key: 'nadi', points: 8, maxPoints: 8, exceptionApplied: true });
  });

  it('cancels the dosha for same nadi, different nakshatra, different rashi lords', () => {
    // nak 0 and nak 4 are both "aadi" nadi; rashi 0 (Mars) vs rashi 1 (Venus)
    const result = nadiKoot(0, 4, 0, 1);
    expect(result).toMatchObject({ key: 'nadi', points: 8, maxPoints: 8, exceptionApplied: true });
  });

  it('does not cancel the dosha for same nadi, different nakshatra, same rashi', () => {
    const result = nadiKoot(0, 4, 0, 0);
    expect(result).toMatchObject({ key: 'nadi', points: 0, maxPoints: 8, exceptionApplied: false });
  });
});

import {
  computeManglik, computeManglikPair, computeDashaSandhi,
  computeAshtakoot, computeVerdict, computeMatch,
} from '../src/matchCalculator.js';

function marsPlanet({ house, rashiIndex }) {
  return [{ key: 'MARS', house, rashiIndex }];
}

describe('computeManglik', () => {
  it('is not manglik when Mars is outside the dosha houses', () => {
    const result = computeManglik(marsPlanet({ house: 3, rashiIndex: 2 }));
    expect(result).toMatchObject({ isManglik: false, cancelled: false });
  });

  it('is manglik when Mars is in a dosha house and not strong', () => {
    const result = computeManglik(marsPlanet({ house: 1, rashiIndex: 5 }));
    expect(result).toMatchObject({ isManglik: true, cancelled: false });
  });

  it('cancels the dosha when Mars is in its own rashi', () => {
    const result = computeManglik(marsPlanet({ house: 7, rashiIndex: 0 }));
    expect(result).toMatchObject({ isManglik: false, cancelled: true });
  });

  it('cancels the dosha when Mars is exalted', () => {
    const result = computeManglik(marsPlanet({ house: 8, rashiIndex: 9 }));
    expect(result).toMatchObject({ isManglik: false, cancelled: true });
  });
});

describe('computeManglikPair', () => {
  it('reports both when both are manglik', () => {
    const groom = marsPlanet({ house: 1, rashiIndex: 5 });
    const bride = marsPlanet({ house: 2, rashiIndex: 5 });
    expect(computeManglikPair(groom, bride).verdict).toBe('both');
  });

  it('reports neither when neither is manglik', () => {
    const groom = marsPlanet({ house: 3, rashiIndex: 5 });
    const bride = marsPlanet({ house: 5, rashiIndex: 5 });
    expect(computeManglikPair(groom, bride).verdict).toBe('neither');
  });

  it('reports mismatch when only one is manglik', () => {
    const groom = marsPlanet({ house: 1, rashiIndex: 5 });
    const bride = marsPlanet({ house: 3, rashiIndex: 5 });
    expect(computeManglikPair(groom, bride).verdict).toBe('mismatch');
  });
});

describe('computeDashaSandhi', () => {
  it('is true when little time has elapsed in the current mahadasha', () => {
    // SUN mahadasha is 6 years; balanceYears 5.7 means only 0.3 years elapsed
    const dasha = { balanceYears: 5.7, mahadashas: [{ lord: 'SUN' }] };
    expect(computeDashaSandhi(dasha)).toBe(true);
  });

  it('is true when little time remains in the current mahadasha', () => {
    const dasha = { balanceYears: 0.5, mahadashas: [{ lord: 'SUN' }] };
    expect(computeDashaSandhi(dasha)).toBe(true);
  });

  it('is false when comfortably inside the current mahadasha', () => {
    const dasha = { balanceYears: 3, mahadashas: [{ lord: 'SUN' }] };
    expect(computeDashaSandhi(dasha)).toBe(false);
  });
});

describe('computeAshtakoot', () => {
  it('sums all 8 koots to a 36-point max', () => {
    const groomMoon = { rashiIndex: 0, nakshatraIndex: 0 };
    const brideMoon = { rashiIndex: 7, nakshatraIndex: 23 };
    const result = computeAshtakoot(groomMoon, brideMoon);
    expect(result.koots).toHaveLength(8);
    expect(result.maxPoints).toBe(36);
    expect(result.totalPoints).toBe(result.koots.reduce((sum, k) => sum + k.points, 0));
  });
});

describe('computeVerdict', () => {
  it('bands scores below 18 as not_recommended', () => {
    expect(computeVerdict(17.9, 'neither')).toMatchObject({ band: 'not_recommended', caution: false });
  });

  it('bands scores from 18 to 24.9 as average', () => {
    expect(computeVerdict(18, 'neither').band).toBe('average');
    expect(computeVerdict(24.9, 'neither').band).toBe('average');
  });

  it('bands scores from 25 to 32.9 as good', () => {
    expect(computeVerdict(25, 'neither').band).toBe('good');
    expect(computeVerdict(32.9, 'neither').band).toBe('good');
  });

  it('bands scores from 33 up as excellent', () => {
    expect(computeVerdict(33, 'neither').band).toBe('excellent');
    expect(computeVerdict(36, 'neither').band).toBe('excellent');
  });

  it('flags caution when the manglik verdict is a mismatch, independent of band', () => {
    expect(computeVerdict(35, 'mismatch').caution).toBe(true);
    expect(computeVerdict(35, 'both').caution).toBe(false);
  });
});

describe('computeMatch', () => {
  function fakeKundaliResult({ moonRashi, moonNakshatra, marsHouse, marsRashi, dashaLord, balanceYears }) {
    return {
      planets: [
        { key: 'MOON', rashiIndex: moonRashi, nakshatraIndex: moonNakshatra },
        { key: 'MARS', rashiIndex: marsRashi, house: marsHouse },
      ],
      dasha: { balanceYears, mahadashas: [{ lord: dashaLord }] },
    };
  }

  it('assembles ashtakoot, manglik, dasha-sandhi, and verdict from two kundali results', () => {
    const groom = fakeKundaliResult({
      moonRashi: 0, moonNakshatra: 0, marsHouse: 3, marsRashi: 5, dashaLord: 'SUN', balanceYears: 3,
    });
    const bride = fakeKundaliResult({
      moonRashi: 7, moonNakshatra: 23, marsHouse: 5, marsRashi: 5, dashaLord: 'MOON', balanceYears: 3,
    });
    const report = computeMatch(groom, bride);
    expect(report.ashtakoot.maxPoints).toBe(36);
    expect(report.manglik.verdict).toBe('neither');
    expect(report.dashaSandhi).toEqual({ groom: false, bride: false });
    expect(report.verdict.totalPoints).toBe(report.ashtakoot.totalPoints);
  });
});
