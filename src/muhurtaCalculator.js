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

export {
  parseHHmm, formatMinutes, weekdayFromDate, dayPartWindow,
  computeRahuKaal, computeYamaganda, computeGulikaKaal,
  computeAbhijitMuhurta, computeBrahmaMuhurta,
};
