export type TaskPriority = 'faible' | 'moyenne' | 'elevee';
export type TaskStatus = 'todo' | 'done';

export type StudentTask = {
  id: string;
  title: string;
  dueLabel: string;
  priority: TaskPriority;
  status: TaskStatus;
  subject: string;
};

export type StudentResource = {
  id: string;
  type: 'note' | 'link' | 'file';
  title: string;
  tags: string[];
  addedAt: string;
};

export type StudentAnnouncement = {
  id: string;
  title: string;
  dateLabel: string;
  excerpt: string;
  content: string;
  important: boolean;
};

export const mockTasks: StudentTask[] = [
  {
    id: 't1',
    title: 'Rendre le devoir de mathematiques',
    dueLabel: 'Aujourd hui, 14:00',
    priority: 'elevee',
    status: 'todo',
    subject: 'Maths',
  },
  {
    id: 't2',
    title: 'Preparer la presentation marketing',
    dueLabel: 'Demain, 09:30',
    priority: 'moyenne',
    status: 'todo',
    subject: 'Marketing',
  },
  {
    id: 't3',
    title: 'Relire le chapitre 6',
    dueLabel: 'Vendredi, 18:00',
    priority: 'faible',
    status: 'done',
    subject: 'Histoire',
  },
  {
    id: 't4',
    title: 'Envoyer le livrable de groupe',
    dueLabel: 'Hier, 17:00',
    priority: 'elevee',
    status: 'todo',
    subject: 'Projet',
  },
];

export const mockResources: StudentResource[] = [
  {
    id: 'r1',
    type: 'note',
    title: 'Resume cours anthropologie',
    tags: ['examen', 'revision'],
    addedAt: 'Aujourd hui',
  },
  {
    id: 'r2',
    type: 'link',
    title: 'Article design system mobile',
    tags: ['ux', 'lecture'],
    addedAt: 'Hier',
  },
  {
    id: 'r3',
    type: 'file',
    title: 'Syllabus semestre 2.pdf',
    tags: ['cours', 'officiel'],
    addedAt: '10 fev 2026',
  },
];

export const mockAnnouncements: StudentAnnouncement[] = [
  {
    id: 'a1',
    title: 'Modification de salle pour le cours de physique',
    dateLabel: '14 fev 2026',
    excerpt: 'Le cours de physique de lundi se tiendra en salle B2.',
    content:
      'Le cours de physique prevu lundi a 10:00 est deplace en salle B2. Merci d arriver 10 minutes avant le debut et d apporter vos calculatrices.',
    important: true,
  },
  {
    id: 'a2',
    title: 'Ouverture des inscriptions aux ateliers CV',
    dateLabel: '13 fev 2026',
    excerpt: 'Les ateliers CV et entretien sont ouverts jusqu au 20 fevrier.',
    content:
      'Le service orientation ouvre les ateliers CV et preparation entretien. Plusieurs sessions sont disponibles entre le 16 et le 20 fevrier.',
    important: false,
  },
];
