import { describe, it, expect } from 'vitest';
import {
  friendshipRelation, combinedFriendshipScore,
  varnaKoot, vashyaKoot, grahaMaitriKoot,
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
