export type NoteColor = 'butter' | 'sky' | 'mint' | 'peach' | 'lavender' | 'graphite' | 'blue' | 'amber' | 'rose' | 'violet' | 'slate';
export type NotePriority = 'low' | 'normal' | 'high';

export type StickyNote = {
  id: number;
  title: string;
  content: string;
  richContent?: string;
  color: NoteColor;
  tags: string[];
  priority: NotePriority;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  skinId?: string;
  attachments: Array<{
    id?: number;
    path: string;
    name: string;
    description?: string;
    created_at?: string;
  }>;
  pinned: boolean;
  archived: boolean;
  dueAt?: string;
  reminderAt?: string;
  snoozedUntil?: string;
  createdAt: string;
  updatedAt: string;
};

export type LayoutPatch = Pick<StickyNote, 'id' | 'x' | 'y' | 'width' | 'height' | 'rotation'>;

export type Point = {
  x: number;
  y: number;
};
