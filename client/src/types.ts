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
  attachments: Attachment[];
  conflictWarnings: ConflictWarning[];
  createdAt: string;
  status: string;
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
  createdAt: string;
  status: string;
  rosterProcessed?: boolean;
  processedAt?: string | null;
};
