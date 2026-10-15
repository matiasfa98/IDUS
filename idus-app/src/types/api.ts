// src/types/api.ts
// Mirrors the backend's serialized wire shapes.
// Source of truth: idus-api/src/utils/serializeUser.js and the serializers
// in routes/challenges.js, routes/conversations.js, routes/messages.js.

// ── Enums (string unions matching backend) ──────────

export type Difficulty =
  | "BEGINNER"
  | "ELEMENTARY"
  | "INTERMEDIATE"
  | "ADVANCED"
  | "EXPERT";

export type ChallengeStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type ChallengeVisibility = "PRIVATE" | "UNLISTED" | "PUBLIC";
export type DayType = "PROJECT" | "MILESTONE" | "FINAL";
export type ParticipantRole = "MEMBER" | "MODERATOR";
export type ConversationParticipantRole = "MEMBER" | "ADMIN";
export type ConversationType = "challenge" | "dm" | "group";
export type AttachmentKind = "image" | "file" | "audio";

// ── User ────────────────────────────────────────────

export interface MetaphorArt {
  source: "catalog" | "anilist" | "upload";
  url: string;
  thumbUrl: string | null;
  attribution: string | null;
}

export interface Metaphor {
  genre: string;
  archetype: string;
  vibe: string;
  displayName: string | null;
  tagline: string | null;
  art: MetaphorArt | null;
  updatedAt: string | null;
}

export interface User {
  id: string;
  permanentId: string;
  username: string | null;
  fullName: string | null;
  metaphor: Metaphor;
  motto: string | null;
  skills: string[];
  createdAt: string;
}

export interface SelfUser extends User {
  settings: {
    notifications: {
      dailyReminder: boolean;
      streakAtRisk: boolean;
      phaseStart: boolean;
    };
    theme: "dark" | "light" | "system";
    privacy: {
      discoverable: boolean;
      showProgress: boolean;
    };
  };
  updatedAt: string;
}

// ── Challenge ───────────────────────────────────────

export interface ChallengeDay {
  _id: string;
  dayNumber: number;
  scheduledDate: string;
  title: string;
  type: DayType;
  description: string;
  objective: string;
  requirements: string[];
  estimatedMinutes: number;
  isFinal: boolean;
}

export interface ChallengePhase {
  _id: string;
  order: number;
  title: string;
  description: string;
  monthLabel: string | null;
  days: ChallengeDay[];
}

export interface ChallengeSchedule {
  type: "weekdays" | "custom" | "explicit";
  days?: number[];
  dates?: string[];
}

export interface Challenge {
  id: string;
  slug: string;
  inviteCode: string;
  title: string;
  topic: string;
  description: string;
  difficulty: Difficulty;
  skillMode: "SHARED" | "INDIVIDUAL";
  startDate: string;
  endDate: string;
  schedule: ChallengeSchedule;
  availableDays: number;
  dailyMinutes: number;
  goal: string | null;
  monthLabels: boolean;
  visibility: ChallengeVisibility;
  status: ChallengeStatus;
  creatorId: string;
  phases: ChallengePhase[];
  settings: { graceHours: number; allowBackfill: boolean };
  version: number;
  createdAt: string;
  updatedAt: string;
}

// Lighter shape returned by GET /me/challenges
export interface ChallengeSummary {
  id: string;
  slug: string;
  title: string;
  topic: string;
  difficulty: Difficulty;
  status: ChallengeStatus;
  startDate: string;
  endDate: string;
  availableDays: number;
  dailyMinutes: number;
  visibility: ChallengeVisibility;
  creatorId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ParticipantStats {
  completed: number;
  missed: number;
}

export interface ParticipantStreak {
  current: number;
  longest: number;
  lastCompletedDate?: string | null;
}

// GET /me/challenges joined entry
export interface JoinedChallengeEntry {
  challenge: ChallengeSummary;
  participant: {
    role: ParticipantRole;
    joinedAt: string;
    streak: ParticipantStreak;
    stats: ParticipantStats;
  };
}

export interface MeChallengesResponse {
  created: ChallengeSummary[];
  joined: JoinedChallengeEntry[];
}

// GET /challenges/:slug
export interface ChallengeDetailResponse {
  challenge: Challenge;
  participantCount: number;
  isParticipant: boolean;
  isCreator: boolean;
}

// ── Conversation & Message ──────────────────────────

export interface ConversationParticipant {
  userId: string;
  role: ConversationParticipantRole;
  joinedAt: string;
  leftAt: string | null;
  lastReadMessageId: string | null;
  lastReadAt: string | null;
  user: User;
}

export interface Conversation {
  id: string;
  type: ConversationType;
  challengeId: string | null;
  title: string | null;
  avatarUrl: string | null;
  createdBy: string;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastMessageSenderId: string | null;
  messageCount: number;
  unreadCount?: number;
  createdAt: string;
  updatedAt: string;
  participants?: ConversationParticipant[];
}

export interface MessageAttachment {
  kind: AttachmentKind;
  url: string;
  thumbUrl: string | null;
  mimeType: string;
  size: number;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  originalName?: string | null;
  cloudinaryPublicId?: string | null;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  clientMessageId: string;
  body: string;
  attachments: MessageAttachment[];
  replyToId: string | null;
  reactions: Record<string, string[]>;
  editedAt: string | null;
  deletedAt: string | null;
  localTimestamp: string;
  createdAt: string;
  updatedAt: string;
  sender: User | null;
}