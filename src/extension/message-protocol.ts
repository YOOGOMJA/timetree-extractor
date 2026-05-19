import type { RawTimeTreeCalendar, RawTimeTreeEvent } from '../core/contracts.js';

export type FetchCalendarsRequest = { type: 'FETCH_CALENDARS' };

export type FetchEventsRequest = {
  type: 'FETCH_EVENTS';
  calendarId: number;
};

export type ExtensionRequest = FetchCalendarsRequest | FetchEventsRequest;

export type FetchCalendarsResponse = {
  type: 'FETCH_CALENDARS';
  ok: true;
  calendars: RawTimeTreeCalendar[];
} | {
  type: 'FETCH_CALENDARS';
  ok: false;
  issues: string[];
};

export type FetchEventsResponse = {
  type: 'FETCH_EVENTS';
  ok: true;
  events: RawTimeTreeEvent[];
} | {
  type: 'FETCH_EVENTS';
  ok: false;
  issues: string[];
};

export type ExtensionResponse = FetchCalendarsResponse | FetchEventsResponse;
