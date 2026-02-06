import sqlite3
from datetime import datetime
from typing import List, Dict, Optional

class TaskQueue:
    def __init__(self, db_path: str = ':memory:'):
        self.conn = sqlite3.connect(db_path)
        self.conn.row_factory = sqlite3.Row
        self._create_tables()
    
    def _create_tables(self):
        cursor = self.conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT,
                priority TEXT NOT NULL,
                status TEXT NOT NULL,
                due_date TEXT,
                assigned_to INTEGER,
                created_at TEXT NOT NULL
            )
        ''')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS members (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                role TEXT
            )
        ''')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS task_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER NOT NULL,
                old_status TEXT,
                new_status TEXT,
                changed_by INTEGER,
                changed_at TEXT NOT NULL
            )
        ''')
        self.conn.commit()
    
    def create_task(self, title: str, description: str, priority: str, 
                   due_date: str, assigned_to: Optional[int] = None) -> int:
        cursor = self.conn.cursor()
        cursor.execute('''
            INSERT INTO tasks (title, description, priority, status, due_date, assigned_to, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (title, description, priority, 'pending', due_date, assigned_to, datetime.now().isoformat()))
        self.conn.commit()
        return cursor.lastrowid
    
    def get_all_tasks(self, status: Optional[str] = None, 
                     priority: Optional[str] = None,
                     assigned_to: Optional[int] = None) -> List[Dict]:
        cursor = self.conn.cursor()
        query = 'SELECT * FROM tasks WHERE 1=1'
        params = []
        
        if status:
            query += ' AND status = ?'
            params.append(status)
        if priority:
            query += ' AND priority = ?'
            params.append(priority)
        if assigned_to:
            query += ' AND assigned_to = ?'
            params.append(assigned_to)
        
        cursor.execute(query, params)
        tasks = [dict(row) for row in cursor.fetchall()]
        
        tasks = sorted(tasks, key=lambda x: (
            {'high': 0, 'medium': 1, 'low': 2}.get(x['priority'], 3),
            x['due_date'] or '9999-12-31'
        ))
        
        return tasks
    
    def get_next_task(self) -> Optional[Dict]:
        tasks = self.get_all_tasks(status='pending')
        return tasks[0] if tasks else None
    
    def update_task_status(self, task_id: int, new_status: str, changed_by: int):
        cursor = self.conn.cursor()
        
        cursor.execute('SELECT status FROM tasks WHERE id = ?', (task_id,))
        row = cursor.fetchone()
        if not row:
            return
        
        old_status = row['status']
        
        cursor.execute('UPDATE tasks SET status = ? WHERE id = ?', (new_status, task_id))
        
        cursor.execute('''
            INSERT INTO task_history (task_id, old_status, new_status, changed_by, changed_at)
            VALUES (?, ?, ?, ?, ?)
        ''', (task_id, old_status, new_status, changed_by, datetime.now().isoformat()))
        
        self.conn.commit()
    
    def get_member_tasks(self, member_id: int) -> List[Dict]:
        cursor = self.conn.cursor()
        cursor.execute('SELECT * FROM tasks WHERE assigned_to = ?', (member_id,))
        return [dict(row) for row in cursor.fetchall()]
    
    def get_member_workload(self, member_id: int) -> int:
        cursor = self.conn.cursor()
        cursor.execute('''
            SELECT COUNT(*) as count FROM tasks 
            WHERE assigned_to = ? AND status IN ('pending', 'in_progress')
        ''', (member_id,))
        row = cursor.fetchone()
        return row['count'] if row else 0
    
    def get_all_members(self) -> List[Dict]:
        cursor = self.conn.cursor()
        cursor.execute('SELECT * FROM members')
        members = [dict(row) for row in cursor.fetchall()]
        
        for member in members:
            member['workload'] = self.get_member_workload(member['id'])
        
        return members
    
    def get_overdue_tasks(self) -> List[Dict]:
        cursor = self.conn.cursor()
        now = datetime.now().isoformat()
        cursor.execute('''
            SELECT * FROM tasks 
            WHERE due_date < ? AND status NOT IN ('completed', 'cancelled')
        ''', (now,))
        return [dict(row) for row in cursor.fetchall()]
    
    def get_task_history(self, task_id: int) -> List[Dict]:
        cursor = self.conn.cursor()
        cursor.execute('''
            SELECT * FROM task_history WHERE task_id = ? ORDER BY changed_at
        ''', (task_id,))
        return [dict(row) for row in cursor.fetchall()]
    
    def calculate_time_in_status(self, task_id: int) -> Dict[str, float]:
        history = self.get_task_history(task_id)
        
        time_in_status = {}
        for i in range(len(history)):
            status = history[i]['new_status']
            start_time = datetime.fromisoformat(history[i]['changed_at'])
            
            if i + 1 < len(history):
                end_time = datetime.fromisoformat(history[i + 1]['changed_at'])
            else:
                end_time = datetime.now()
            
            duration = (end_time - start_time).total_seconds()
            
            if status in time_in_status:
                time_in_status[status] += duration
            else:
                time_in_status[status] = duration
        
        return time_in_status
    
    def reassign_task(self, task_id: int, new_member_id: int):
        cursor = self.conn.cursor()
        cursor.execute('UPDATE tasks SET assigned_to = ? WHERE id = ?', 
                      (new_member_id, task_id))
        self.conn.commit()
    
    def delete_task(self, task_id: int):
        cursor = self.conn.cursor()
        cursor.execute('DELETE FROM tasks WHERE id = ?', (task_id,))
        cursor.execute('DELETE FROM task_history WHERE task_id = ?', (task_id,))
        self.conn.commit()
    
    def close(self):
        self.conn.close()

def main():
    queue = TaskQueue()
    
    task_id = queue.create_task(
        title='Implement feature X',
        description='Add new feature to the system',
        priority='high',
        due_date='2026-02-10',
        assigned_to=1
    )
    
    print(f"Created task: {task_id}")
    
    tasks = queue.get_all_tasks()
    print(f"Total tasks: {len(tasks)}")
    
    next_task = queue.get_next_task()
    if next_task:
        print(f"Next task: {next_task['title']}")
    
    queue.update_task_status(task_id, 'in_progress', changed_by=1)
    
    workload = queue.get_member_workload(1)
    print(f"Member workload: {workload}")
    
    queue.close()

if __name__ == '__main__':
    main()