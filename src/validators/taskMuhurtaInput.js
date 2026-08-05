import { DateTime, IANAZone } from 'luxon';

const VALID_TASKS = ['marriage', 'business', 'travel'];
const MAX_DATE_RANGE_DAYS = 60;

function validateTaskMuhurtaInput(query) {
  const errors = [];
  const { task, from, to, latitude, longitude, timezone } = query;

  if (!VALID_TASKS.includes(task)) {
    errors.push(`task must be one of: ${VALID_TASKS.join(', ')}`);
  }

  const fromValid = from && /^\d{4}-\d{2}-\d{2}$/.test(from) && DateTime.fromISO(from).isValid;
  const toValid = to && /^\d{4}-\d{2}-\d{2}$/.test(to) && DateTime.fromISO(to).isValid;
  if (!fromValid) errors.push('from must be a valid date in YYYY-MM-DD format');
  if (!toValid) errors.push('to must be a valid date in YYYY-MM-DD format');

  if (fromValid && toValid) {
    const fromDate = DateTime.fromISO(from);
    const toDate = DateTime.fromISO(to);
    if (toDate < fromDate) {
      errors.push('to must not be before from');
    } else {
      const rangeDays = toDate.diff(fromDate, 'days').days + 1;
      if (rangeDays > MAX_DATE_RANGE_DAYS) {
        errors.push(`date range must not exceed ${MAX_DATE_RANGE_DAYS} days`);
      }
    }
  }

  const lat = Number(latitude);
  if (latitude === undefined || String(latitude).trim() === '' || Number.isNaN(lat) || lat < -90 || lat > 90) {
    errors.push('latitude must be a number between -90 and 90');
  }
  const lon = Number(longitude);
  if (longitude === undefined || String(longitude).trim() === '' || Number.isNaN(lon) || lon < -180 || lon > 180) {
    errors.push('longitude must be a number between -180 and 180');
  }
  if (timezone !== undefined && timezone !== null && timezone !== '') {
    if (typeof timezone !== 'string' || !IANAZone.isValidZone(timezone)) {
      errors.push('timezone must be a valid IANA timezone name (e.g. Asia/Kolkata)');
    }
  }

  return errors;
}

export { validateTaskMuhurtaInput };
