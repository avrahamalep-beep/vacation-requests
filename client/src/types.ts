export type Operator = { name: string; email: string };

export type Attachment = {
  filename: string;
  originalName: string;
  url: string;
};

export type ConflictWarning = {
  otherName: string;
  otherEmail: string;
  otherRange: string;
};

export type VacationRequest = {
  id: string;
  operatorName: string;
  operatorEmail: string;
  startDate: string;
  endDate: string;
  daysCount: number;
  notes: string;
  /** Internal roster / admin only (visible in Inbox + Calendar) */
  adminNotes?: string;
  attachments: Attachment[];
  conflictWarnings: ConflictWarning[];
  createdAt: string;
  status: 'pending' | 'accepted' | 'rejected' | string;
  rosterProcessed?: boolean;
  processedAt?: string | null;
};

export type ShiftType = 'morning' | 'night';

export type ShiftSwapRequest = {
  id: string;
  requesterName: string;
  requesterEmail: string;
  colleagueName: string;
  colleagueEmail: string;
  rosterDate: string;
  currentShift: ShiftType;
  requestedShift: ShiftType;
  details: string;
  adminNotes?: string;
  attachments?: Attachment[];
  createdAt: string;
  status: 'pending' | 'accepted' | 'rejected' | string;
  rosterProcessed?: boolean;
  processedAt?: string | null;
};

export type RosterCell = {
  value: string;
  hasRequest: boolean;
  requestNotes: string[];
};

export type RosterRow = {
  operatorName: string;
  cells: RosterCell[];
};

export type RosterSnapshot = {
  originalName: string;
  uploadedAt: string;
  dates: string[];
  rows: RosterRow[];
};
