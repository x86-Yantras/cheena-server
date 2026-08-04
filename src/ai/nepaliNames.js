const PLANET_NAMES_NE = {
  SUN: 'सूर्य', MOON: 'चन्द्र', MARS: 'मंगल', MERCURY: 'बुध', JUPITER: 'बृहस्पति',
  VENUS: 'शुक्र', SATURN: 'शनि', RAHU: 'राहु', KETU: 'केतु',
};

const RASHI_NAMES_NE = [
  'मेष', 'वृषभ', 'मिथुन', 'कर्कट', 'सिंह', 'कन्या',
  'तुला', 'वृश्चिक', 'धनु', 'मकर', 'कुम्भ', 'मीन',
];

const NAKSHATRA_NAMES_NE = [
  'अश्विनी', 'भरणी', 'कृत्तिका', 'रोहिणी', 'मृगशिरा', 'आर्द्रा', 'पुनर्वसु', 'पुष्य', 'आश्लेषा',
  'मघा', 'पूर्व फाल्गुनी', 'उत्तर फाल्गुनी', 'हस्त', 'चित्रा', 'स्वाती', 'विशाखा', 'अनुराधा', 'ज्येष्ठा',
  'मूल', 'पूर्व आषाढा', 'उत्तर आषाढा', 'श्रवण', 'धनिष्ठा', 'शतभिषा', 'पूर्व भाद्रपद',
  'उत्तर भाद्रपद', 'रेवती',
];

// Index i = suffix for lordship of house (i+1). E.g. index 0 -> house 1 -> लग्नेश.
const ORDINAL_LORD_SUFFIX_NE = [
  'लग्नेश', 'द्वितीयेश', 'तृतीयेश', 'चतुर्थेश', 'पञ्चमेश', 'षष्ठेश',
  'सप्तमेश', 'अष्टमेश', 'नवमेश', 'दशमेश', 'एकादशेश', 'द्वादशेश',
];

const DEVANAGARI_DIGITS = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];

function toDevanagariDigits(n) {
  return String(n).replace(/[0-9]/g, (d) => DEVANAGARI_DIGITS[Number(d)]);
}

function formatDegree(degreeInRashi) {
  const totalMinutes = Math.round(degreeInRashi * 60);
  const degrees = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${toDevanagariDigits(degrees)}°${toDevanagariDigits(String(minutes).padStart(2, '0'))}′`;
}

export {
  PLANET_NAMES_NE, RASHI_NAMES_NE, NAKSHATRA_NAMES_NE, ORDINAL_LORD_SUFFIX_NE,
  formatDegree, toDevanagariDigits,
};
