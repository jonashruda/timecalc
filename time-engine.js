/**
 * TimeCalc Core Time Engine
 * Pure, decoupled time arithmetic and parsing utilities.
 */

export const TimeEngine = {
  MINUTES_IN_DAY: 1440,
  MS_IN_SECOND: 1000,
  MS_IN_MINUTE: 60000,
  MS_IN_HOUR: 3600000,
  MS_IN_DAY: 86400000,
  MS_IN_WEEK: 604800000,
  MS_IN_AVG_MONTH: 2629746000, // 30.436875 days (Gregorian avg year / 12)

  /**
   * Safe decimal rounding that eliminates floating-point precision issues
   */
  round(num, decimals = 4) {
    if (typeof num !== 'number' || isNaN(num)) return 0;
    const factor = Math.pow(10, decimals);
    return Math.round((num + Number.EPSILON) * factor) / factor;
  },

  /**
   * Checks if a year is a leap year
   */
  isLeapYear(year) {
    const y = parseInt(year, 10);
    if (isNaN(y)) return false;
    return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
  },

  /**
   * Returns exact days in a given month (0-indexed month: 0 = Jan, 1 = Feb, etc.)
   */
  getDaysInMonth(year, monthIndex) {
    return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  },

  /**
   * Parses various time representations (24h, 12h AM/PM, H:MM) into minutes from midnight [0, 1439].
   * Returns null for invalid inputs.
   */
  timeToMinutes(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return null;
    const clean = timeStr.trim().toLowerCase();
    if (!clean) return null;

    // Check for 12-hour AM/PM format (e.g., "10:30 pm", "8:15am", "2pm", "12:00 am")
    const match12 = clean.match(/^(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?\s*(am|pm|a|p)$/);
    if (match12) {
      let h = parseInt(match12[1], 10);
      const m = match12[2] ? parseInt(match12[2], 10) : 0;
      const meridiem = match12[4].startsWith('p') ? 'pm' : 'am';
      if (h < 1 || h > 12 || m < 0 || m > 59) return null;
      if (meridiem === 'pm' && h !== 12) h += 12;
      if (meridiem === 'am' && h === 12) h = 0;
      return h * 60 + m;
    }

    // Check for 24-hour format (e.g., "14:30", "09:05", "0:00", "23:59")
    const match24 = clean.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
    if (match24) {
      const h = parseInt(match24[1], 10);
      const m = parseInt(match24[2], 10);
      if (h < 0 || h > 23 || m < 0 || m > 59) return null;
      return h * 60 + m;
    }

    // Pure hour number (e.g., "14" -> 14:00, "9" -> 09:00)
    const matchHourOnly = clean.match(/^(\d{1,2})$/);
    if (matchHourOnly) {
      const h = parseInt(matchHourOnly[1], 10);
      if (h >= 0 && h <= 23) return h * 60;
    }

    return null;
  },

  /**
   * Converts minutes from midnight to standard 24h "HH:MM" string.
   * Handles negative and overflow minutes automatically with modulo 1440.
   */
  minutesToTime(totalMins) {
    if (typeof totalMins !== 'number' || isNaN(totalMins)) return '00:00';
    const normalized = ((Math.floor(totalMins) % this.MINUTES_IN_DAY) + this.MINUTES_IN_DAY) % this.MINUTES_IN_DAY;
    const h = Math.floor(normalized / 60);
    const m = normalized % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  },

  /**
   * Parses flexible duration strings into total minutes.
   * Examples:
   *   "1h 30m", "1 hr 30 mins", "90m", "90 mins", "1.5h", "2.25 hours", "45s", "04:30", "+15m", "-45m"
   */
  parseFlexibleDuration(input) {
    if (typeof input === 'number') {
      return { totalMinutes: Math.round(input), hours: Math.floor(input / 60), minutes: Math.round(input % 60), isValid: true };
    }
    if (!input || typeof input !== 'string') {
      return { totalMinutes: 0, hours: 0, minutes: 0, isValid: false };
    }

    const str = input.trim().toLowerCase();
    if (!str) return { totalMinutes: 0, hours: 0, minutes: 0, isValid: false };

    let isNegative = false;
    let clean = str;
    if (clean.startsWith('-')) {
      isNegative = true;
      clean = clean.slice(1).trim();
    } else if (clean.startsWith('+')) {
      clean = clean.slice(1).trim();
    }

    // Check HH:MM notation (e.g., "4:30" or "04:30")
    const colonMatch = clean.match(/^(\d{1,3}):(\d{1,2})$/);
    if (colonMatch) {
      const h = parseInt(colonMatch[1], 10);
      const m = parseInt(colonMatch[2], 10);
      const total = (h * 60 + m) * (isNegative ? -1 : 1);
      return {
        totalMinutes: total,
        hours: Math.floor(Math.abs(total) / 60),
        minutes: Math.abs(total) % 60,
        isValid: true
      };
    }

    // Check decimal hours (e.g., "1.5h", "1.5 hours", "1.5 hr", "1.5")
    const decimalMatch = clean.match(/^(\d+(?:\.\d+)?)\s*(?:hours|hour|hrs|hr|h)$/);
    if (decimalMatch) {
      const decimalVal = parseFloat(decimalMatch[1]);
      const total = Math.round(decimalVal * 60) * (isNegative ? -1 : 1);
      return {
        totalMinutes: total,
        hours: Math.floor(Math.abs(total) / 60),
        minutes: Math.abs(total) % 60,
        isValid: true
      };
    }

    // Check composite tokens (e.g. "1d 4h 30m 45s", "1h 30m", "90min", "45s")
    let foundAny = false;
    let accumulatedMins = 0;

    const daysMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:days|day|d)\b/);
    if (daysMatch) {
      accumulatedMins += parseFloat(daysMatch[1]) * 1440;
      foundAny = true;
    }

    const hoursMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:hours|hour|hrs|hr|h)\b/);
    if (hoursMatch) {
      accumulatedMins += parseFloat(hoursMatch[1]) * 60;
      foundAny = true;
    }

    const minsMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:minutes|minute|mins|min|m)\b/);
    if (minsMatch) {
      accumulatedMins += parseFloat(minsMatch[1]);
      foundAny = true;
    }

    const secsMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:seconds|second|secs|sec|s)\b/);
    if (secsMatch) {
      accumulatedMins += parseFloat(secsMatch[1]) / 60;
      foundAny = true;
    }

    if (foundAny) {
      const total = Math.round(accumulatedMins) * (isNegative ? -1 : 1);
      return {
        totalMinutes: total,
        hours: Math.floor(Math.abs(total) / 60),
        minutes: Math.abs(total) % 60,
        isValid: true
      };
    }

    // Pure number fallback: if just a number like "90", treat as minutes
    const pureNum = parseFloat(clean);
    if (!isNaN(pureNum)) {
      const total = Math.round(pureNum) * (isNegative ? -1 : 1);
      return {
        totalMinutes: total,
        hours: Math.floor(Math.abs(total) / 60),
        minutes: Math.abs(total) % 60,
        isValid: true
      };
    }

    return { totalMinutes: 0, hours: 0, minutes: 0, isValid: false };
  },

  /**
   * Formats a duration in minutes into multiple standardized representations
   */
  formatDurationMulti(minutes) {
    const isNeg = minutes < 0;
    const absMins = Math.abs(Math.round(minutes));
    const h = Math.floor(absMins / 60);
    const m = absMins % 60;
    const s = 0;

    const prefix = isNeg ? '-' : '';
    const formatted = `${prefix}${h}h ${String(m).padStart(2, '0')}m`;
    const hhmmss = `${prefix}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
    const decimalHoursVal = this.round(minutes / 60, 2);
    const decimalHours = `${decimalHoursVal.toFixed(2)} hrs`;
    const totalMinutesStr = `${minutes} min`;
    const totalSecondsVal = Math.round(minutes * 60);
    const totalSecondsStr = `${totalSecondsVal.toLocaleString()} sec`;

    return {
      formatted,
      hhmmss,
      decimalHours,
      decimalHoursVal,
      totalMinutesStr,
      totalMinutes: minutes,
      totalSecondsVal,
      totalSecondsStr,
      hours: h,
      minutes: m
    };
  },

  /**
   * Calculates duration between start and end time.
   * Handles midnight wraparound (end < start implies next-day span).
   * Supports optional break/pause deduction.
   */
  calculateDuration(startStr, endStr, breakMinutes = 0) {
    const startMins = this.timeToMinutes(startStr);
    const endMins = this.timeToMinutes(endStr);
    if (startMins === null || endMins === null) return null;

    const breakMins = Math.max(0, parseInt(breakMinutes, 10) || 0);

    let grossDiff = endMins - startMins;
    const isOvernight = grossDiff < 0;
    if (isOvernight) {
      grossDiff += this.MINUTES_IN_DAY;
    }

    const netDiff = Math.max(0, grossDiff - breakMins);
    const multiFormat = this.formatDurationMulti(netDiff);
    const grossMulti = this.formatDurationMulti(grossDiff);

    return {
      startMins,
      endMins,
      grossMinutes: grossDiff,
      netMinutes: netDiff,
      breakMinutes: breakMins,
      hours: multiFormat.hours,
      minutes: multiFormat.minutes,
      decimalHours: multiFormat.decimalHoursVal,
      isOvernight,
      dayOffset: isOvernight ? 1 : 0,
      formattedGross: grossMulti.formatted,
      formattedNet: multiFormat.formatted,
      multiFormat
    };
  },

  /**
   * Resolves end time given start time, duration (hours and minutes or total minutes), and optional break.
   */
  resolveEnd(startStr, durHours, durMinutes = 0, breakMinutes = 0) {
    const startMins = this.timeToMinutes(startStr);
    if (startMins === null) return null;

    let durationMins = 0;
    let breakMins = 0;

    if (arguments.length === 2) {
      durationMins = parseInt(durHours, 10) || 0;
      breakMins = 0;
    } else {
      durationMins = (parseInt(durHours, 10) || 0) * 60 + (parseInt(durMinutes, 10) || 0);
      breakMins = Math.max(0, parseInt(breakMinutes, 10) || 0);
    }

    const totalSpan = durationMins + breakMins;
    const calculatedEndMins = startMins + totalSpan;
    const dayOffset = Math.floor(calculatedEndMins / this.MINUTES_IN_DAY);
    const timeStr = this.minutesToTime(calculatedEndMins);
    const multiFormat = this.formatDurationMulti(durationMins);

    return {
      timeStr,
      endTime: timeStr,
      startTime: startStr,
      dayOffset,
      daysOffset: dayOffset,
      isNextDay: dayOffset > 0,
      startMins,
      durationMinutes: durationMins,
      netDurationMinutes: durationMins,
      grossDurationMinutes: totalSpan,
      breakMinutes: breakMins,
      totalSpanMinutes: totalSpan,
      formattedNetDuration: multiFormat.formatted,
      hhmmss: `${timeStr}:00`,
      decimalHours: multiFormat.decimalHoursVal,
      multiFormat
    };
  },

  /**
   * Resolves start time given end time, duration (hours and minutes or total minutes), and optional break.
   */
  resolveStart(endStr, durHours, durMinutes = 0, breakMinutes = 0) {
    const endMins = this.timeToMinutes(endStr);
    if (endMins === null) return null;

    let durationMins = 0;
    let breakMins = 0;

    if (arguments.length === 2) {
      durationMins = parseInt(durHours, 10) || 0;
      breakMins = 0;
    } else {
      durationMins = (parseInt(durHours, 10) || 0) * 60 + (parseInt(durMinutes, 10) || 0);
      breakMins = Math.max(0, parseInt(breakMinutes, 10) || 0);
    }

    const totalSpan = durationMins + breakMins;
    const calculatedStartMins = endMins - totalSpan;
    const dayOffset = Math.floor(calculatedStartMins / this.MINUTES_IN_DAY);
    const timeStr = this.minutesToTime(calculatedStartMins);
    const multiFormat = this.formatDurationMulti(durationMins);

    return {
      timeStr,
      startTime: timeStr,
      endTime: endStr,
      dayOffset,
      daysOffset: dayOffset,
      isNextDay: dayOffset !== 0,
      endMins,
      durationMinutes: durationMins,
      netDurationMinutes: durationMins,
      grossDurationMinutes: totalSpan,
      breakMinutes: breakMins,
      totalSpanMinutes: totalSpan,
      formattedNetDuration: multiFormat.formatted,
      hhmmss: `${timeStr}:00`,
      decimalHours: multiFormat.decimalHoursVal,
      multiFormat
    };
  },

  /**
   * Resolves duration between start and end with aliases
   */
  resolveDuration(startStr, endStr, breakMinutes = 0) {
    const res = this.calculateDuration(startStr, endStr, breakMinutes);
    if (!res) return null;
    return {
      ...res,
      formattedNetDuration: res.formattedNet,
      netDurationMinutes: res.netMinutes,
      grossDurationMinutes: res.grossMinutes,
      hhmmss: res.multiFormat.hhmmss,
      daysOffset: res.dayOffset,
      isNextDay: res.isOvernight
    };
  },

  /**
   * Performs duration arithmetic (+ or - between two durations in minutes)
   */
  durationMath(durationA_mins, operator, durationB_mins) {
    const a = parseInt(durationA_mins, 10) || 0;
    const b = parseInt(durationB_mins, 10) || 0;
    let result = 0;
    if (operator === '-' || operator === 'sub') {
      result = a - b;
    } else {
      result = a + b;
    }
    return this.formatDurationMulti(result);
  },

  /**
   * Performs duration arithmetic (+ or - between two duration strings or numbers)
   */
  calculateDurationMath(strA, op, strB) {
    const parseA = this.parseFlexibleDuration(strA);
    const parseB = this.parseFlexibleDuration(strB);
    const operator = op === '−' ? '-' : op;
    const result = this.durationMath(parseA.totalMinutes, operator, parseB.totalMinutes);
    return {
      ...result,
      parseA,
      parseB,
      isValid: parseA.isValid && parseB.isValid
    };
  },

  /**
   * Precision unit conversions based on fixed millisecond equivalents
   */
  convertUnits(value, fromUnit) {
    const val = parseFloat(value);
    if (isNaN(val)) return null;

    let ms = 0;
    switch (fromUnit) {
      case 'sec':
        ms = val * this.MS_IN_SECOND;
        break;
      case 'min':
        ms = val * this.MS_IN_MINUTE;
        break;
      case 'hr':
        ms = val * this.MS_IN_HOUR;
        break;
      case 'day':
        ms = val * this.MS_IN_DAY;
        break;
      case 'wk':
        ms = val * this.MS_IN_WEEK;
        break;
      case 'mo':
        ms = val * this.MS_IN_AVG_MONTH;
        break;
      default:
        return null;
    }

    return {
      sec: this.round(ms / this.MS_IN_SECOND, 6),
      min: this.round(ms / this.MS_IN_MINUTE, 6),
      hr: this.round(ms / this.MS_IN_HOUR, 6),
      day: this.round(ms / this.MS_IN_DAY, 6),
      wk: this.round(ms / this.MS_IN_WEEK, 6),
      mo: this.round(ms / this.MS_IN_AVG_MONTH, 6)
    };
  }
};

// Universal export for Node.js and Browser environments
if (typeof window !== 'undefined') {
  window.TimeEngine = TimeEngine;
}
if (typeof globalThis !== 'undefined') {
  globalThis.TimeEngine = TimeEngine;
}
