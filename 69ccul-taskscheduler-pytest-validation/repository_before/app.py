import threading
from collections import defaultdict, deque
from concurrent.futures import ThreadPoolExecutor
from typing import Callable, Dict, List, Set


class TaskScheduler:
    def __init__(self, max_workers: int = 4):
        self.lock = threading.Lock()
        self.tasks: Dict[str, Callable[[], None]] = {}
        self.deps: Dict[str, Set[str]] = defaultdict(set)
        self.reverse_deps: Dict[str, Set[str]] = defaultdict(set)
        self.completed: Set[str] = set()
        self.ready = deque()
        self.executor = ThreadPoolExecutor(max_workers=max_workers)
        self.running = False

    def add_task(self, task_id: str, fn: Callable[[], None], depends_on: List[str] = None):
        if depends_on is None:
            depends_on = []

        with self.lock:
            self.tasks[task_id] = fn
            for dep in depends_on:
                self.deps[task_id].add(dep)
                self.reverse_deps[dep].add(task_id)

            if not self.deps[task_id]:
                self.ready.append(task_id)

    def start(self):
        self.running = True
        self._schedule_ready()

    def _schedule_ready(self):
        while True:
            with self.lock:
                if not self.ready:
                    return
                task_id = self.ready.popleft()

            self.executor.submit(self._run_task, task_id)

    def _run_task(self, task_id: str):
        try:
            self.tasks[task_id]()
        finally:
            with self.lock:
                self.completed.add(task_id)
                for dependent in self.reverse_deps[task_id]:
                    self.deps[dependent].discard(task_id)
                    if not self.deps[dependent]:
                        self.ready.append(dependent)

            if self.running:
                self._schedule_ready()

    def stop(self):
        self.running = False
        self.executor.shutdown(wait=True)
