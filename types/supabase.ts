export type Profile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: 'student' | 'admin' | null;
  created_at: string | null;
};

export type Task = {
  id: string;
  user_id: string | null;
  title: string;
  description: string | null;
  status: 'todo' | 'in_progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  due_date: string | null;
  completed_at: string | null;
  is_persistent: boolean;
  created_at: string | null;
};

export type Resource = {
  id: string;
  user_id: string | null;
  title: string;
  type: 'note' | 'link' | 'file' | null;
  content: string | null;
  file_url: string | null;
  tags: string[] | null;
  created_at: string | null;
};

export type Announcement = {
  id: string;
  title: string;
  content: string;
  is_active: boolean | null;
  is_important: boolean | null;
  created_by: string | null;
  created_at: string | null;
  expires_at: string | null;
};
