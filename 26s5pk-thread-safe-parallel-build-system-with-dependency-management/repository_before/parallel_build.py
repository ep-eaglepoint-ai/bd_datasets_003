
import json
import threading
import queue
import hashlib
import time
import os
from pathlib import Path
from typing import Dict, List, Optional, Set
from dataclasses import dataclass


@dataclass
class BuildTask:
    name: str
    dependencies: List[str]
    source_files: List[str]
    output_artifact: str
    status: str = "pending"
    worker_id: Optional[int] = None


@dataclass
class BuildResult:
    task_name: str
    status: str
    duration: float
    worker_id: int
    artifact_path: str
    error_message: Optional[str] = None


class BuildCache:
    
    def __init__(self):
        self.cache: Dict[str, str] = {}
    
    def get(self, input_hash: str) -> Optional[str]:
        return self.cache.get(input_hash)
    
    def put(self, input_hash: str, artifact_path: str):
        self.cache[input_hash] = artifact_path


def compute_input_hash(source_files: List[str]) -> str:
    hasher = hashlib.sha256()
    for filepath in sorted(source_files):
        if os.path.exists(filepath):
            with open(filepath, 'rb') as f:
                hasher.update(f.read())
    return hasher.hexdigest()


def write_artifact(content: bytes, path: str):
    with open(path, 'wb') as f:
        f.write(content)


def build_task(task: BuildTask, cache: BuildCache) -> BuildResult:
    start_time = time.time()
    worker_id = threading.get_ident()
    
    try:
        input_hash = compute_input_hash(task.source_files)
        cached_artifact = cache.get(input_hash)
        
        if cached_artifact:
            print(f"Worker {worker_id}: Cache hit for {task.name}")
            return BuildResult(
                task_name=task.name,
                status="completed",
                duration=time.time() - start_time,
                worker_id=worker_id,
                artifact_path=cached_artifact
            )
        
        print(f"Worker {worker_id}: Building {task.name}")
        time.sleep(0.1)
        
        artifact_content = f"Built {task.name}".encode()
        write_artifact(artifact_content, task.output_artifact)
        
        cache.put(input_hash, task.output_artifact)
        
        return BuildResult(
            task_name=task.name,
            status="completed",
            duration=time.time() - start_time,
            worker_id=worker_id,
            artifact_path=task.output_artifact
        )
    
    except Exception as e:
        return BuildResult(
            task_name=task.name,
            status="failed",
            duration=time.time() - start_time,
            worker_id=worker_id,
            artifact_path="",
            error_message=str(e)
        )


def worker_thread(
    task_queue: queue.Queue,
    results: Dict[str, BuildResult],
    cache: BuildCache,
    completion_events: Dict[str, threading.Event]
):
    while True:
        try:
            task = task_queue.get(timeout=1)
            if task is None:
                break
            
            if task.status == "pending":
                task.status = "running"
                task.worker_id = threading.get_ident()
            else:
                continue
            
            result = build_task(task, cache)
            
            results[task.name] = result
            
            task.status = result.status
            
            if task.name in completion_events:
                completion_events[task.name].set()
            
            task_queue.task_done()
        
        except queue.Empty:
            continue


def parallel_build(config_path: str, num_workers: int = 8) -> Dict[str, BuildResult]:
    with open(config_path) as f:
        config = json.load(f)
    
    tasks = {}
    for task_config in config['tasks']:
        task = BuildTask(
            name=task_config['name'],
            dependencies=task_config.get('dependencies', []),
            source_files=task_config.get('source_files', []),
            output_artifact=task_config['output']
        )
        tasks[task.name] = task
    
    task_queue = queue.Queue()
    results = {}
    cache = BuildCache()
    completion_events = {name: threading.Event() for name in tasks}
    
    workers = []
    for i in range(num_workers):
        worker = threading.Thread(
            target=worker_thread,
            args=(task_queue, results, cache, completion_events)
        )
        worker.start()
        workers.append(worker)
    
    scheduled = set()
    
    def can_schedule(task: BuildTask) -> bool:
        for dep in task.dependencies:
            if dep not in scheduled:
                return False
            if tasks[dep].status != "completed":
                return False
        return True
    
    while len(scheduled) < len(tasks):
        for name, task in tasks.items():
            if name not in scheduled and can_schedule(task):
                task_queue.put(task)
                scheduled.add(name)
        
        time.sleep(0.01)
    
    task_queue.join()
    
    for _ in range(num_workers):
        task_queue.put(None)
    
    for worker in workers:
        worker.join()
    
    return results


if __name__ == "__main__":
    results = parallel_build("build_config.json", num_workers=8)
    
    print("\n=== Build Results ===")
    for name, result in results.items():
        print(f"{name}: {result.status} ({result.duration:.2f}s)")
