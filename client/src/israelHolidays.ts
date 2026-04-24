export type IsraelHoliday = {
  date: string; // YYYY-MM-DD
  name: string;
};

// Civil-date list of major Israeli holidays for planning visibility.
// Extend this list yearly as needed.
export const ISRAEL_HOLIDAYS: IsraelHoliday[] = [
  // 2026
  { date: '2026-03-03', name: 'Purim' },
  { date: '2026-04-02', name: 'Passover (1st day)' },
  { date: '2026-04-08', name: 'Passover (7th day)' },
  { date: '2026-04-22', name: 'Yom HaShoah' },
  { date: '2026-04-29', name: 'Yom HaZikaron' },
  { date: '2026-04-30', name: 'Yom HaAtzmaut' },
  { date: '2026-05-22', name: 'Shavuot' },
  { date: '2026-07-23', name: "Tisha B'Av" },
  { date: '2026-09-12', name: 'Rosh Hashanah (day 1)' },
  { date: '2026-09-13', name: 'Rosh Hashanah (day 2)' },
  { date: '2026-09-21', name: 'Yom Kippur' },
  { date: '2026-09-26', name: 'Sukkot (1st day)' },
  { date: '2026-10-03', name: 'Shemini Atzeret / Simchat Torah' },
  { date: '2026-12-05', name: 'Hanukkah (1st candle)' },

  // 2027
  { date: '2027-03-23', name: 'Purim' },
  { date: '2027-04-22', name: 'Passover (1st day)' },
  { date: '2027-04-28', name: 'Passover (7th day)' },
  { date: '2027-05-12', name: 'Yom HaShoah' },
  { date: '2027-05-19', name: 'Yom HaZikaron' },
  { date: '2027-05-20', name: 'Yom HaAtzmaut' },
  { date: '2027-06-11', name: 'Shavuot' },
  { date: '2027-08-12', name: "Tisha B'Av" },
  { date: '2027-10-02', name: 'Rosh Hashanah (day 1)' },
  { date: '2027-10-03', name: 'Rosh Hashanah (day 2)' },
  { date: '2027-10-11', name: 'Yom Kippur' },
  { date: '2027-10-16', name: 'Sukkot (1st day)' },
  { date: '2027-10-23', name: 'Shemini Atzeret / Simchat Torah' },
  { date: '2027-12-25', name: 'Hanukkah (1st candle)' },
];
