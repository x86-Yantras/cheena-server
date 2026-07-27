const TITHI_NAMES = [
  'Pratipada', 'Dwitiya', 'Tritiya', 'Chaturthi', 'Panchami', 'Shashthi', 'Saptami',
  'Ashtami', 'Navami', 'Dashami', 'Ekadashi', 'Dwadashi', 'Trayodashi', 'Chaturdashi',
];

const NITYA_YOGA_NAMES = [
  'Vishkambha', 'Priti', 'Ayushman', 'Saubhagya', 'Shobhana', 'Atiganda', 'Sukarma',
  'Dhriti', 'Shoola', 'Ganda', 'Vriddhi', 'Dhruva', 'Vyaghata', 'Harshana', 'Vajra',
  'Siddhi', 'Vyatipata', 'Variyana', 'Parigha', 'Shiva', 'Siddha', 'Sadhya', 'Shubha',
  'Shukla', 'Brahma', 'Indra', 'Vaidhriti',
];

const MOVABLE_KARANA_NAMES = ['Bava', 'Balava', 'Kaulava', 'Taitila', 'Gara', 'Vanija', 'Vishti'];

const TITHI_SPAN = 12;
const YOGA_SPAN = 360 / 27;
const KARANA_SPAN = 6;

function normalizeDegrees(value) {
  return ((value % 360) + 360) % 360;
}

function computeTithi(elongation) {
  const tithiIndex = Math.floor(elongation / TITHI_SPAN);
  const paksha = tithiIndex < 15 ? 'shukla' : 'krishna';
  const tithiInPaksha = tithiIndex % 15;
  const degreesElapsed = elongation % TITHI_SPAN;
  const degreesRemaining = TITHI_SPAN - degreesElapsed;
  const tithiName = tithiInPaksha === 14
    ? (paksha === 'shukla' ? 'Purnima' : 'Amavasya')
    : TITHI_NAMES[tithiInPaksha];
  return { tithiIndex, paksha, tithiName, degreesElapsed, degreesRemaining };
}

function computeYoga(sunLongitude, moonLongitude) {
  const yogaSum = normalizeDegrees(sunLongitude + moonLongitude);
  const yogaIndex = Math.floor(yogaSum / YOGA_SPAN);
  return { yogaIndex, yogaName: NITYA_YOGA_NAMES[yogaIndex] };
}

function karanaNameForIndex(karanaHalfIndex) {
  if (karanaHalfIndex === 0) return 'Kimstughna';
  if (karanaHalfIndex === 57) return 'Shakuni';
  if (karanaHalfIndex === 58) return 'Chatushpada';
  if (karanaHalfIndex === 59) return 'Naga';
  return MOVABLE_KARANA_NAMES[(karanaHalfIndex - 1) % 7];
}

function computeKarana(elongation) {
  const karanaHalfIndex = Math.floor(elongation / KARANA_SPAN);
  return { karanaHalfIndex, karanaName: karanaNameForIndex(karanaHalfIndex) };
}

function computePanchang({ sunLongitude, moonLongitude }) {
  const elongation = normalizeDegrees(moonLongitude - sunLongitude);
  return {
    tithi: computeTithi(elongation),
    yoga: computeYoga(sunLongitude, moonLongitude),
    karana: computeKarana(elongation),
  };
}

export { computePanchang };
