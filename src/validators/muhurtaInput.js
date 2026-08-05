import { DateTime, IANAZone } from 'luxon';

function validateMuhurtaInput(query) {
  const errors = [];
  const { date, latitude, longitude, timezone } = query;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !DateTime.fromISO(date).isValid) {
    errors.push('date must be a valid date in YYYY-MM-DD format');
  }
  const lat = Number(latitude);
  if (
    latitude === undefined ||
    String(latitude).trim() === '' ||
    Number.isNaN(lat) ||
    lat < -90 ||
    lat > 90
  ) {
    errors.push('latitude must be a number between -90 and 90');
  }
  const lon = Number(longitude);
  if (
    longitude === undefined ||
    String(longitude).trim() === '' ||
    Number.isNaN(lon) ||
    lon < -180 ||
    lon > 180
  ) {
    errors.push('longitude must be a number between -180 and 180');
  }
  if (timezone !== undefined && timezone !== null && timezone !== '') {
    if (typeof timezone !== 'string' || !IANAZone.isValidZone(timezone)) {
      errors.push('timezone must be a valid IANA timezone name (e.g. Asia/Kolkata)');
    }
  }
  return errors;
}

export { validateMuhurtaInput };
