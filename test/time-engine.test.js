import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TimeEngine } from '../time-engine.js';

describe('TimeEngine - Core Mathematical & Time Domain Tests', () => {

  describe('Midnight Wraparound & Duration Calculation', () => {
    it('calculates same-day duration correctly', () => {
      const res = TimeEngine.calculateDuration('09:00', '17:30');
      assert.ok(res);
      assert.equal(res.grossMinutes, 510);
      assert.equal(res.hours, 8);
      assert.equal(res.minutes, 30);
      assert.equal(res.decimalHours, 8.5);
      assert.equal(res.isOvernight, false);
      assert.equal(res.dayOffset, 0);
      assert.equal(res.formattedNet, '8h 30m');
    });

    it('handles midnight crossing (overnight shift) without underflow', () => {
      const res = TimeEngine.calculateDuration('22:00', '06:30');
      assert.ok(res);
      assert.equal(res.grossMinutes, 510);
      assert.equal(res.hours, 8);
      assert.equal(res.minutes, 30);
      assert.equal(res.isOvernight, true);
      assert.equal(res.dayOffset, 1);
      assert.equal(res.formattedNet, '8h 30m');
    });

    it('handles 23:59 to 00:01 crossing', () => {
      const res = TimeEngine.calculateDuration('23:59', '00:01');
      assert.ok(res);
      assert.equal(res.grossMinutes, 2);
      assert.equal(res.hours, 0);
      assert.equal(res.minutes, 2);
      assert.equal(res.isOvernight, true);
    });

    it('handles identical start and end times as 0 duration', () => {
      const res = TimeEngine.calculateDuration('12:00', '12:00');
      assert.ok(res);
      assert.equal(res.grossMinutes, 0);
      assert.equal(res.hours, 0);
      assert.equal(res.minutes, 0);
    });

    it('correctly deducts break time from gross duration', () => {
      const res = TimeEngine.calculateDuration('09:00', '17:00', 45); // 8h span - 45m break
      assert.ok(res);
      assert.equal(res.grossMinutes, 480);
      assert.equal(res.netMinutes, 435);
      assert.equal(res.hours, 7);
      assert.equal(res.minutes, 15);
      assert.equal(res.decimalHours, 7.25);
      assert.equal(res.formattedNet, '7h 15m');
      assert.equal(res.formattedGross, '8h 00m');
    });
  });

  describe('3-Point Solver (resolveStart, resolveEnd, and resolveDuration)', () => {
    it('resolves end time crossing midnight into next day', () => {
      const res = TimeEngine.resolveEnd('21:00', 5, 30); // 21:00 + 5h30m = 02:30 (+1 Day)
      assert.ok(res);
      assert.equal(res.timeStr, '02:30');
      assert.equal(res.endTime, '02:30');
      assert.equal(res.dayOffset, 1);
    });

    it('resolves end time with total duration in minutes and break', () => {
      const res = TimeEngine.resolveEnd('09:00', 8, 0, 30); // 9:00 + 8h work + 30m break = 17:30
      assert.ok(res);
      assert.equal(res.timeStr, '17:30');
      assert.equal(res.endTime, '17:30');
      assert.equal(res.dayOffset, 0);
    });

    it('resolves end time with break deduction included in total span', () => {
      const res = TimeEngine.resolveEnd('09:00', 8, 0, 30); // 9:00 + 8h work + 30m break = 17:30
      assert.ok(res);
      assert.equal(res.timeStr, '17:30');
      assert.equal(res.dayOffset, 0);
    });

    it('resolves start time backward across midnight into previous day', () => {
      const res = TimeEngine.resolveStart('02:15', 4, 30); // 02:15 - 4h30m = 21:45 (-1 Day)
      assert.ok(res);
      assert.equal(res.timeStr, '21:45');
      assert.equal(res.startTime, '21:45');
      assert.equal(res.dayOffset, -1);
    });

    it('resolves start time with total duration in minutes and break', () => {
      const res = TimeEngine.resolveStart('17:30', 8, 0, 30); // 17:30 - (8h + 30m) = 09:00
      assert.ok(res);
      assert.equal(res.timeStr, '09:00');
      assert.equal(res.startTime, '09:00');
      assert.equal(res.dayOffset, 0);
    });

    it('resolves start time backward multiple days if duration exceeds 36h', () => {
      const res = TimeEngine.resolveStart('10:00', 38, 0); // 10:00 - 38h = 20:00 (-2 Days)
      assert.ok(res);
      assert.equal(res.timeStr, '20:00');
      assert.equal(res.dayOffset, -2);
    });

    it('resolves duration between two times including breaks', () => {
      const res = TimeEngine.resolveDuration('09:00', '17:30', 30);
      assert.ok(res);
      assert.equal(res.netDurationMinutes, 480);
      assert.equal(res.formattedNetDuration, '8h 00m');
      assert.equal(res.isOvernight, false);
    });
  });

  describe('Flexible String Parsing & Normalization', () => {
    it('parses composite tokens like "1h 30m", "2 hrs 15 mins", "90m"', () => {
      assert.equal(TimeEngine.parseFlexibleDuration('1h 30m').totalMinutes, 90);
      assert.equal(TimeEngine.parseFlexibleDuration('2 hrs 15 mins').totalMinutes, 135);
      assert.equal(TimeEngine.parseFlexibleDuration('90m').totalMinutes, 90);
      assert.equal(TimeEngine.parseFlexibleDuration('90 mins').totalMinutes, 90);
      assert.equal(TimeEngine.parseFlexibleDuration('45s').totalMinutes, 1);
    });

    it('parses decimal hours like "1.5h", "2.25 hours"', () => {
      assert.equal(TimeEngine.parseFlexibleDuration('1.5h').totalMinutes, 90);
      assert.equal(TimeEngine.parseFlexibleDuration('2.25 hours').totalMinutes, 135);
      assert.equal(TimeEngine.parseFlexibleDuration('0.5 hr').totalMinutes, 30);
    });

    it('parses colon notation "04:30"', () => {
      assert.equal(TimeEngine.parseFlexibleDuration('04:30').totalMinutes, 270);
    });

    it('handles negative durations "-45m"', () => {
      const res = TimeEngine.parseFlexibleDuration('-45m');
      assert.equal(res.totalMinutes, -45);
      assert.equal(res.isValid, true);
    });

    it('gracefully handles invalid strings', () => {
      assert.equal(TimeEngine.parseFlexibleDuration('invalid gibberish').isValid, false);
      assert.equal(TimeEngine.parseFlexibleDuration('').isValid, false);
      assert.equal(TimeEngine.parseFlexibleDuration(null).isValid, false);
    });
  });

  describe('12-Hour and 24-Hour Time Parsing', () => {
    it('parses 12-hour AM/PM formats accurately', () => {
      assert.equal(TimeEngine.timeToMinutes('12:00 AM'), 0);
      assert.equal(TimeEngine.timeToMinutes('12:30 am'), 30);
      assert.equal(TimeEngine.timeToMinutes('8:15 am'), 495);
      assert.equal(TimeEngine.timeToMinutes('12:00 PM'), 720);
      assert.equal(TimeEngine.timeToMinutes('1:15 pm'), 795);
      assert.equal(TimeEngine.timeToMinutes('11:59 pm'), 1439);
    });

    it('parses 24-hour formats accurately', () => {
      assert.equal(TimeEngine.timeToMinutes('00:00'), 0);
      assert.equal(TimeEngine.timeToMinutes('09:45'), 585);
      assert.equal(TimeEngine.timeToMinutes('23:59'), 1439);
    });

    it('rejects out of bounds times', () => {
      assert.equal(TimeEngine.timeToMinutes('25:00'), null);
      assert.equal(TimeEngine.timeToMinutes('12:60 pm'), null);
      assert.equal(TimeEngine.timeToMinutes(''), null);
    });
  });

  describe('Unit Converter & Precision Floating-Point Elimination', () => {
    it('converts 1 hour precisely to 60 min, 3600 sec, 1/24 day', () => {
      const conv = TimeEngine.convertUnits(1, 'hr');
      assert.ok(conv);
      assert.equal(conv.sec, 3600);
      assert.equal(conv.min, 60);
      assert.equal(conv.hr, 1);
      assert.equal(conv.day, 0.041667);
    });

    it('converts 90 minutes without floating point artifacts', () => {
      const conv = TimeEngine.convertUnits(90, 'min');
      assert.ok(conv);
      assert.equal(conv.hr, 1.5);
      assert.equal(conv.sec, 5400);
    });
  });

  describe('Leap Year & Calendar Rules', () => {
    it('accurately identifies Gregorian leap years', () => {
      assert.equal(TimeEngine.isLeapYear(2024), true);
      assert.equal(TimeEngine.isLeapYear(2028), true);
      assert.equal(TimeEngine.isLeapYear(2000), true);
      assert.equal(TimeEngine.isLeapYear(1900), false);
      assert.equal(TimeEngine.isLeapYear(2023), false);
    });

    it('accurately returns days in February for leap and non-leap years', () => {
      assert.equal(TimeEngine.getDaysInMonth(2024, 1), 29); // Feb 2024
      assert.equal(TimeEngine.getDaysInMonth(2023, 1), 28); // Feb 2023
      assert.equal(TimeEngine.getDaysInMonth(2028, 1), 29); // Feb 2028
    });
  });

  describe('Duration Arithmetic (+/- Duration Math)', () => {
    it('adds two durations', () => {
      const res = TimeEngine.durationMath(90, '+', 45);
      assert.equal(res.totalMinutes, 135);
      assert.equal(res.formatted, '2h 15m');
      assert.equal(res.decimalHoursVal, 2.25);
    });

    it('subtracts two durations', () => {
      const res = TimeEngine.durationMath(120, '-', 45);
      assert.equal(res.totalMinutes, 75);
      assert.equal(res.formatted, '1h 15m');
    });

    it('calculates duration math from strings like "2h 30m" + "1h 45m"', () => {
      const res = TimeEngine.calculateDurationMath('2h 30m', '+', '1h 45m');
      assert.equal(res.totalMinutes, 255);
      assert.equal(res.formatted, '4h 15m');
      assert.equal(res.hours, 4);
      assert.equal(res.minutes, 15);
      assert.equal(res.decimalHoursVal, 4.25);
    });

    it('calculates duration math with subtraction "3h 15m" - "45m"', () => {
      const res = TimeEngine.calculateDurationMath('3h 15m', '-', '45m');
      assert.equal(res.totalMinutes, 150);
      assert.equal(res.formatted, '2h 30m');
    });
  });
});
