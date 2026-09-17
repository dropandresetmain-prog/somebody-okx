import type { GoogleWorkspaceConfig } from "./config";
import { calendarClient } from "./client";

export type CalendarMissionContext = {
  eventId: string;
  calendarId: string;
  summary: string;
  description: string | null;
  location: string | null;
  startAt: number | null;
  endAt: number | null;
  timeZone: string | null;
  attendeeCount: number | null;
  headcountClues: string[];
  logisticsNotes: string[];
  htmlLink: string | null;
};

function parseInstant(
  value?: { dateTime?: string | null; date?: string | null } | null,
): number | null {
  if (!value) return null;
  if (value.dateTime) {
    const ms = Date.parse(value.dateTime);
    return Number.isFinite(ms) ? ms : null;
  }
  if (value.date) {
    const ms = Date.parse(`${value.date}T00:00:00Z`);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

function extractHeadcountClues(text: string): string[] {
  const clues: string[] = [];
  const patterns = [
    /\b(?:~|about|around|approx(?:imately)?\s+)?(\d{1,3})\s*(?:people|persons|attendees|pax|guests)\b/gi,
    /\b(?:headcount|attendance|attendees)\s*[:=-]?\s*(\d{1,3})\b/gi,
    /\bfor\s+(\d{1,3})\b/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const clue = match[0]?.trim();
      if (clue && !clues.includes(clue)) clues.push(clue);
    }
  }
  return clues.slice(0, 8);
}

function extractLogisticsNotes(text: string): string[] {
  const notes: string[] = [];
  const patterns = [
    /\b(?:deliver(?:y|ies)?|receiving|drop[- ]?off|load[- ]?in|setup)\b[^.\n]{0,120}/gi,
    /\b(?:venue|loading bay|reception|lobby)\b[^.\n]{0,120}/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const note = match[0]?.trim();
      if (note && !notes.includes(note)) notes.push(note);
    }
  }
  return notes.slice(0, 8);
}

/**
 * Bounded Calendar read for the configured mission event only.
 * Does not search or invent event IDs.
 */
export async function readCalendarMissionContext(
  config: GoogleWorkspaceConfig,
): Promise<CalendarMissionContext> {
  const calendar = calendarClient(config);
  const response = await calendar.events.get({
    calendarId: config.calendarId,
    eventId: config.calendarEventId,
  });
  const event = response.data;
  if (!event.id || event.id !== config.calendarEventId)
    throw new Error("Calendar event read-back did not match configured event id");
  const blob = [event.summary, event.description, event.location]
    .filter(Boolean)
    .join("\n");
  const attendeeCount = Array.isArray(event.attendees)
    ? event.attendees.length
    : null;
  return {
    eventId: event.id,
    calendarId: config.calendarId,
    summary: event.summary?.trim() || "(untitled event)",
    description: event.description?.trim() || null,
    location: event.location?.trim() || null,
    startAt: parseInstant(event.start),
    endAt: parseInstant(event.end),
    timeZone: event.start?.timeZone || event.end?.timeZone || null,
    attendeeCount,
    headcountClues: extractHeadcountClues(blob),
    logisticsNotes: extractLogisticsNotes(blob),
    htmlLink: event.htmlLink ?? null,
  };
}
