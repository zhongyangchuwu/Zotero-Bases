import { isISODate } from './property-values';

interface CalendarOptions {
  value: string;
  locale?: string;
  labels: { previousMonth: string; nextMonth: string; today: string; clear: string };
  onSelect(value: string | null): void;
}

const XHTML_NS = 'http://www.w3.org/1999/xhtml';
const LAST_MONTH = 9999 * 12 + 11;

function utcDate(year: number, month: number, day: number): Date {
  // setUTCFullYear preserves ISO years 0000–0099 and avoids DST or timezone shifts.
  const date = new Date(0);
  date.setUTCFullYear(year, month, day);
  return date;
}

function isoDay(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function monthOf(value: string): number {
  return Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7)) - 1;
}

function weekStart(locale: Intl.Locale): number {
  const week = locale as Intl.Locale & {
    getWeekInfo?(): { firstDay: number };
    weekInfo?: { firstDay: number };
  };
  const firstDay = week.getWeekInfo?.().firstDay ?? week.weekInfo?.firstDay;
  // Cover the app's English (US) and Chinese locales on hosts without Intl week data.
  return (firstDay ?? (locale.maximize().region === 'US' ? 7 : 1)) % 7;
}

export function createInlineCalendar(document: Document, options: CalendarOptions) {
  const { labels, onSelect } = options;
  function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') {
    const node = document.createElementNS(XHTML_NS, tag) as HTMLElementTagNameMap[K];
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function button(className: string, text: string, label?: string): HTMLButtonElement {
    const node = element('button', className, text);
    node.type = 'button';
    if (label) node.setAttribute('aria-label', label);
    return node;
  }

  const locale = new Intl.Locale(
    options.locale ?? new Intl.DateTimeFormat().resolvedOptions().locale,
  );
  const firstWeekday = weekStart(locale);
  const format = (formatOptions: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...formatOptions, calendar: 'gregory', timeZone: 'UTC' });
  const monthFormat = { month: 'long', year: 'numeric' } as const;
  const dayFormat = { weekday: 'long', ...monthFormat, day: 'numeric' } as const;
  const months = format(monthFormat);
  const days = format(dayFormat);
  const weekdays = format({ weekday: 'short' });
  const dayNumber = new Intl.NumberFormat(locale);
  const now = new Date();
  const today = isoDay(now.getFullYear(), now.getMonth(), now.getDate());
  let selected = isISODate(options.value) ? options.value : '';
  let viewedMonth = monthOf(selected || today);

  const calendar = element('div', 'zb-inline-calendar');
  const header = element('div', 'zb-calendar-header');
  const previous = button('zb-calendar-nav', '‹', labels.previousMonth);
  const title = element('span', 'zb-calendar-title');
  title.setAttribute('aria-live', 'polite');
  const next = button('zb-calendar-nav', '›', labels.nextMonth);
  header.append(previous, title, next);
  const grid = element('div', 'zb-calendar-grid');
  const weekdayHeadings = Array.from({ length: 7 }, (_, index) => {
    // January 4, 1970 was a Sunday; formatter and date share the UTC calendar.
    const day = utcDate(1970, 0, 4 + ((index + firstWeekday) % 7));
    return element('span', 'zb-calendar-weekday', weekdays.format(day));
  });
  const footer = element('div', 'zb-calendar-footer');
  const chooseToday = button('', labels.today);
  const clear = button('', labels.clear);
  footer.append(chooseToday, clear);
  calendar.append(header, grid, footer);

  function renderMonth(): void {
    const year = Math.floor(viewedMonth / 12);
    const month = viewedMonth % 12;
    const first = utcDate(year, month, 1);
    const leadingDays = (first.getUTCDay() + 7 - firstWeekday) % 7;
    const length = utcDate(year, month + 1, 0).getUTCDate();
    // Localized Gregorian labels represent ISO year 0000 as 1 BC.
    const monthLabel = year === 0 ? format({ ...monthFormat, era: 'short' }) : months;
    title.textContent = monthLabel.format(first);
    const dateLabel = year === 0 ? format({ ...dayFormat, era: 'short' }) : days;
    previous.disabled = viewedMonth === 0;
    next.disabled = viewedMonth === LAST_MONTH;
    grid.replaceChildren(...weekdayHeadings);
    for (let index = 0; index < leadingDays; index++) {
      const blank = element('span', 'zb-calendar-blank');
      blank.setAttribute('aria-hidden', 'true');
      grid.append(blank);
    }
    for (let day = 1; day <= length; day++) {
      const value = isoDay(year, month, day);
      const node = button(
        'zb-calendar-day',
        dayNumber.format(day),
        dateLabel.format(utcDate(year, month, day)),
      );
      node.dataset.date = value;
      node.setAttribute('aria-pressed', String(value === selected));
      if (value === today) node.setAttribute('aria-current', 'date');
      node.addEventListener('click', () => select(value));
      grid.append(node);
    }
  }

  function setValue(value: string): void {
    selected = isISODate(value) ? value : '';
    const month = selected ? monthOf(selected) : viewedMonth;
    if (month !== viewedMonth) {
      viewedMonth = month;
      renderMonth();
      return;
    }
    grid.querySelector('[aria-pressed=true]')?.setAttribute('aria-pressed', 'false');
    if (selected)
      grid.querySelector(`[data-date="${selected}"]`)?.setAttribute('aria-pressed', 'true');
  }

  function select(value: string | null): void {
    setValue(value ?? '');
    onSelect(value);
  }

  previous.addEventListener('click', () => {
    viewedMonth--;
    renderMonth();
  });
  next.addEventListener('click', () => {
    viewedMonth++;
    renderMonth();
  });
  chooseToday.addEventListener('click', () => select(today));
  clear.addEventListener('click', () => select(null));
  renderMonth();

  return { element: calendar, setValue };
}
