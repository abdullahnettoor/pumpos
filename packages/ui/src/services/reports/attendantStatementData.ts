import type { AttendantReportEntry } from '@pump/shared';

/**
 * One Attendant's statement: their entry from the composed report, plus the
 * period it was cut for.
 *
 * Its own module so the document and the day-slicing that feeds it can both
 * name the shape without importing each other.
 */
export interface AttendantStatementData extends AttendantReportEntry {
  from: string;
  to: string;
  /** The instant the report was composed — never the moment of printing. */
  generatedAt: string;
}
