const HORA_LORD_SEQUENCE = ['SATURN', 'JUPITER', 'MARS', 'SUN', 'VENUS', 'MERCURY', 'MOON'];

const WEEKDAY_STARTING_HORA_LORD = {
  sunday: 'SUN', monday: 'MOON', tuesday: 'MARS', wednesday: 'MERCURY',
  thursday: 'JUPITER', friday: 'VENUS', saturday: 'SATURN',
};

const FAVORABLE_HORA_LORDS = ['MOON', 'MERCURY', 'JUPITER', 'VENUS'];

function horaLordForSegment(weekday, segmentIndex) {
  const startIndex = HORA_LORD_SEQUENCE.indexOf(WEEKDAY_STARTING_HORA_LORD[weekday]);
  return HORA_LORD_SEQUENCE[(startIndex + segmentIndex) % 7];
}

function scoreHoraSegment({ horaLord, lagnaLordDignity }) {
  const checks = [
    {
      name: 'Hora',
      pass: FAVORABLE_HORA_LORDS.includes(horaLord),
      passReason: `${horaLord} hora is favorable`,
      failReason: `${horaLord} hora is unfavorable`,
    },
    {
      name: 'Lagna Lord Strength',
      pass: lagnaLordDignity !== 'debilitated',
      passReason: `Lagna lord is ${lagnaLordDignity}`,
      failReason: 'Lagna lord is debilitated',
    },
  ];
  const passed = checks.filter((c) => c.pass);
  return {
    score: Math.round((passed.length / checks.length) * 100),
    reasons: passed.map((c) => c.passReason),
    warnings: checks.filter((c) => !c.pass).map((c) => c.failReason),
    checks: checks.map((c) => ({ name: c.name, pass: c.pass, reason: c.pass ? c.passReason : c.failReason })),
  };
}

export { HORA_LORD_SEQUENCE, WEEKDAY_STARTING_HORA_LORD, FAVORABLE_HORA_LORDS, horaLordForSegment, scoreHoraSegment };
