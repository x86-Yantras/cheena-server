import { DateTime } from 'luxon';
import tzlookup from 'tz-lookup';

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function parseHHmm(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function formatMinutes(totalMinutes) {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function weekdayFromDate(dateStr, latitude, longitude, timezone) {
  const zone = timezone || tzlookup(latitude, longitude);
  const localDate = DateTime.fromISO(dateStr, { zone });
  // Luxon's weekday is 1=Monday..7=Sunday; WEEKDAYS is 0=sunday-indexed.
  return WEEKDAYS[localDate.weekday % 7];
}

function dayPartWindow(sunriseMin, sunsetMin, index, totalParts) {
  const partDuration = (sunsetMin - sunriseMin) / totalParts;
  return {
    start: sunriseMin + partDuration * (index - 1),
    end: sunriseMin + partDuration * index,
  };
}

const RAHU_KAAL_INDEX = { sunday: 8, monday: 2, tuesday: 7, wednesday: 5, thursday: 6, friday: 4, saturday: 3 };
const YAMAGANDA_INDEX = { sunday: 5, monday: 4, tuesday: 3, wednesday: 2, thursday: 1, friday: 7, saturday: 6 };
const GULIKA_KAAL_INDEX = { sunday: 7, monday: 6, tuesday: 5, wednesday: 4, thursday: 3, friday: 2, saturday: 1 };

function computeRahuKaal(weekday, sunriseMin, sunsetMin) {
  const window = dayPartWindow(sunriseMin, sunsetMin, RAHU_KAAL_INDEX[weekday], 8);
  return { name: 'Rahu Kaal', ...window, type: 'inauspicious' };
}

function computeYamaganda(weekday, sunriseMin, sunsetMin) {
  const window = dayPartWindow(sunriseMin, sunsetMin, YAMAGANDA_INDEX[weekday], 8);
  return { name: 'Yamaganda', ...window, type: 'inauspicious' };
}

function computeGulikaKaal(weekday, sunriseMin, sunsetMin) {
  const window = dayPartWindow(sunriseMin, sunsetMin, GULIKA_KAAL_INDEX[weekday], 8);
  return { name: 'Gulika Kaal', ...window, type: 'inauspicious' };
}

function computeAbhijitMuhurta(weekday, sunriseMin, sunsetMin) {
  const window = dayPartWindow(sunriseMin, sunsetMin, 8, 15);
  const result = { name: 'Abhijit Muhurta', ...window, type: 'auspicious' };
  if (weekday === 'wednesday') {
    result.note = 'Traditionally considered weak/void on Wednesdays';
  }
  return result;
}

function computeBrahmaMuhurta(sunriseMin) {
  return { name: 'Brahma Muhurta', start: sunriseMin - 96, end: sunriseMin - 48, type: 'auspicious' };
}

const CHOGHADIYA_NATURE = {
  Amrit: 'auspicious', Shubh: 'auspicious', Labh: 'auspicious',
  Chal: 'neutral',
  Udveg: 'inauspicious', Rog: 'inauspicious', Kaal: 'inauspicious',
};
const CHOGHADIYA_LORD = {
  Amrit: 'Moon', Shubh: 'Jupiter', Labh: 'Mercury', Chal: 'Venus',
  Udveg: 'Sun', Rog: 'Mars', Kaal: 'Saturn',
};
const CHOGHADIYA_CYCLE = ['Udveg', 'Chal', 'Labh', 'Amrit', 'Kaal', 'Shubh', 'Rog'];
const DAY_START_CHOGHADIYA = {
  sunday: 'Udveg', monday: 'Amrit', tuesday: 'Rog', wednesday: 'Labh',
  thursday: 'Shubh', friday: 'Chal', saturday: 'Kaal',
};

function choghadiyaSequence(startName, count) {
  const startIndex = CHOGHADIYA_CYCLE.indexOf(startName);
  return Array.from({ length: count }, (_, i) => CHOGHADIYA_CYCLE[(startIndex + i) % 7]);
}

function toChoghadiyaSlot(name, window) {
  return { name, ...window, nature: CHOGHADIYA_NATURE[name], lord: CHOGHADIYA_LORD[name] };
}

function computeChoghadiya(weekday, sunriseMin, sunsetMin, nextSunriseMin) {
  const dayNames = choghadiyaSequence(DAY_START_CHOGHADIYA[weekday], 8);
  const day = dayNames.map((name, i) => toChoghadiyaSlot(name, dayPartWindow(sunriseMin, sunsetMin, i + 1, 8)));

  const nightStartIndex = (CHOGHADIYA_CYCLE.indexOf(dayNames[7]) + 1) % 7;
  const nightNames = choghadiyaSequence(CHOGHADIYA_CYCLE[nightStartIndex], 8);
  const night = nightNames.map((name, i) => toChoghadiyaSlot(name, dayPartWindow(sunsetMin, nextSunriseMin, i + 1, 8)));

  return { day, night };
}

export {
  parseHHmm, formatMinutes, weekdayFromDate, dayPartWindow,
  computeRahuKaal, computeYamaganda, computeGulikaKaal,
  computeAbhijitMuhurta, computeBrahmaMuhurta, computeChoghadiya,
};
