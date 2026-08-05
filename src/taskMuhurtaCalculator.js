const RIKTA_TITHI_INDICES = [3, 8, 13]; // 0-based tithiInPaksha (tithiIndex % 15): Chaturthi, Navami, Chaturdashi
const AVOID_YOGA_NAMES = ['Vyatipata', 'Vaidhriti'];

const TASK_RULES = {
  marriage: {
    nakshatras: ['Rohini', 'Mrigashira', 'Magha', 'Uttara Phalguni', 'Hasta', 'Swati', 'Anuradha', 'Mula', 'Uttara Ashadha', 'Uttara Bhadrapada', 'Revati'],
    padaExclusions: { Magha: [1], Mula: [1], Revati: [4] },
    weekdays: ['monday', 'wednesday', 'thursday', 'friday'],
  },
  business: {
    nakshatras: ['Ashwini', 'Rohini', 'Pushya', 'Hasta', 'Chitra'],
    padaExclusions: {},
    weekdays: ['monday', 'wednesday', 'thursday', 'friday', 'saturday'],
  },
  travel: {
    nakshatras: ['Ashwini', 'Mrigashira', 'Pushya', 'Hasta', 'Anuradha', 'Shravana', 'Revati'],
    padaExclusions: {},
    weekdays: ['monday', 'wednesday', 'thursday', 'friday'],
  },
};

function scoreDay({ tithi, yoga, karana, nakshatra, weekday }, taskRules) {
  const checks = [
    {
      pass: !RIKTA_TITHI_INDICES.includes(tithi.tithiIndex % 15),
      passReason: `${tithi.tithiName} is not a Rikta tithi`,
      failReason: `${tithi.tithiName} is a Rikta tithi`,
    },
    {
      pass: taskRules.nakshatras.includes(nakshatra.nakshatraName)
        && !(taskRules.padaExclusions[nakshatra.nakshatraName] || []).includes(nakshatra.pada),
      passReason: `${nakshatra.nakshatraName} pada ${nakshatra.pada} favours this task`,
      failReason: `${nakshatra.nakshatraName} pada ${nakshatra.pada} does not favour this task`,
    },
    {
      pass: !AVOID_YOGA_NAMES.includes(yoga.yogaName),
      passReason: `${yoga.yogaName} yoga is not inauspicious`,
      failReason: `${yoga.yogaName} yoga should be avoided`,
    },
    {
      pass: karana.karanaName !== 'Vishti',
      passReason: 'No Vishti karana active',
      failReason: 'Vishti karana (Bhadra) is active',
    },
    {
      pass: taskRules.weekdays.includes(weekday),
      passReason: `${weekday} is a favourable weekday`,
      failReason: `${weekday} is not an ideal weekday`,
    },
  ];

  const passed = checks.filter((c) => c.pass);
  const failed = checks.filter((c) => !c.pass);

  return {
    score: Math.round((passed.length / checks.length) * 100),
    reasons: passed.map((c) => c.passReason),
    warnings: failed.map((c) => c.failReason),
  };
}

export { TASK_RULES, scoreDay };
