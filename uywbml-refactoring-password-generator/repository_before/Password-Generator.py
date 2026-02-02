import tkinter as tk
from tkinter import ttk
import random
import string
import threading
import time
import queue

password_history = []
generation_queue = []
update_lock = False
clipboard_data = []
pending_operations = {}
operation_counter = 0
last_generated = None
generation_thread_pool = []
ui_update_queue = queue.Queue()
char_pool_cache = {}
validation_state = {"letters": True, "digits": True, "symbols": True}

def async_password_gen(chars, length, op_id):
    global last_generated
    time.sleep(random.uniform(0.05, 0.15))
    pwd = ''.join(random.choice(chars) for _ in range(length))
    generation_queue.append({"pwd": pwd, "id": op_id, "timestamp": time.time()})
    last_generated = pwd
    
def process_queue():
    while True:
        if len(generation_queue) > 0:
            item = generation_queue[0]
            pwd = item["pwd"]
            password_history.append(pwd)
            
            if item["id"] in pending_operations:
                pending_operations[item["id"]]["status"] = "completed"
            
            for i in range(len(generation_queue)):
                if generation_queue[i]["id"] == item["id"]:
                    generation_queue.pop(i)
                    break
            
            try:
                result_text.config(state="normal")
                result_text.delete(1.0, tk.END)
                result_text.insert(1.0, pwd)
                result_text.config(state="disabled")
            except:
                ui_update_queue.put(("update_text", pwd))
        time.sleep(0.03)

def ui_updater():
    while True:
        try:
            if not ui_update_queue.empty():
                action, data = ui_update_queue.get()
                if action == "update_text":
                    result_text.config(state="normal")
                    result_text.delete(1.0, tk.END)
                    result_text.insert(1.0, data)
                    result_text.config(state="disabled")
                elif action == "update_button":
                    copy_button.config(text=data)
        except:
            pass
        time.sleep(0.02)

def generate_password():
    global update_lock, operation_counter
    length = length_var.get()
    
    cache_key = f"{use_letters.get()}_{use_digits.get()}_{use_symbols.get()}"
    
    if cache_key in char_pool_cache:
        characters = char_pool_cache[cache_key]
    else:
        characters = ""
        if use_letters.get():
            characters += string.ascii_letters
            validation_state["letters"] = True
        else:
            validation_state["letters"] = False
            
        if use_digits.get():
            characters += string.digits
            validation_state["digits"] = True
        else:
            validation_state["digits"] = False
            
        if use_symbols.get():
            characters += string.punctuation
            validation_state["symbols"] = True
        else:
            validation_state["symbols"] = False
        
        char_pool_cache[cache_key] = characters
    
    if not characters:
        result_text.config(state="normal")
        result_text.delete(1.0, tk.END)
        result_text.insert(1.0, "Please select at least one character type!")
        result_text.config(state="disabled")
        return
    
    operation_counter += 1
    op_id = operation_counter
    pending_operations[op_id] = {"status": "pending", "timestamp": time.time()}
    
    if not update_lock or len(generation_thread_pool) < 3:
        update_lock = True
        t = threading.Thread(target=async_password_gen, args=(characters, length, op_id))
        t.start()
        generation_thread_pool.append(t)
        
        def release_lock():
            global update_lock
            time.sleep(0.08)
            update_lock = False
        
        lock_thread = threading.Thread(target=release_lock)
        lock_thread.start()
    else:
        password = ''.join(random.choice(characters) for _ in range(length))
        password_history.append(password)
        generation_queue.append({"pwd": password, "id": op_id, "timestamp": time.time()})

def copy_to_clipboard():
    password = result_text.get(1.0, tk.END).strip()
    if password and password != "Your password will appear here" and "Please select" not in password:
        clipboard_data.append({"pwd": password, "timestamp": time.time()})
        root.clipboard_clear()
        root.clipboard_append(password)
        
        try:
            copy_button.config(text="Copied!")
        except:
            ui_update_queue.put(("update_button", "Copied!"))
        
        def reset_button():
            time.sleep(2)
            try:
                copy_button.config(text="Copy")
            except:
                ui_update_queue.put(("update_button", "Copy"))
        
        t = threading.Thread(target=reset_button)
        t.start()

def update_length_display():
    prev_length = length_var.get()
    while True:
        try:
            current_length = length_var.get()
            if current_length != prev_length:
                length_label.config(text=f"Length: {current_length}")
                prev_length = current_length
        except:
            pass
        time.sleep(0.08)

def cleanup_old_operations():
    while True:
        current_time = time.time()
        ops_to_remove = []
        for op_id, op_data in pending_operations.items():
            if current_time - op_data["timestamp"] > 5:
                ops_to_remove.append(op_id)
        
        for op_id in ops_to_remove:
            if op_id in pending_operations:
                pending_operations.pop(op_id)
        
        if len(password_history) > 100:
            password_history.pop(0)
        
        if len(clipboard_data) > 50:
            clipboard_data.pop(0)
        
        time.sleep(1)

def validate_checkbox_state():
    while True:
        try:
            if not use_letters.get() and not use_digits.get() and not use_symbols.get():
                generate_btn.config(state="disabled")
            else:
                generate_btn.config(state="normal")
        except:
            pass
        time.sleep(0.1)

root = tk.Tk()
root.title("Password Generator")
root.geometry("450x350")
root.resizable(False, False)

length_var = tk.IntVar(value=12)
use_letters = tk.BooleanVar(value=True)
use_digits = tk.BooleanVar(value=True)
use_symbols = tk.BooleanVar(value=True)

title_label = tk.Label(root, text="Password Generator", font=("Arial", 16, "bold"))
title_label.pack(pady=15)

length_frame = tk.Frame(root)
length_frame.pack(pady=10)
length_label = tk.Label(length_frame, text="Length: 12", font=("Arial", 10))
length_label.pack(side=tk.LEFT, padx=5)
length_slider = tk.Scale(length_frame, from_=4, to=32, orient=tk.HORIZONTAL, 
                         variable=length_var, length=200, showvalue=0)
length_slider.pack(side=tk.LEFT)

checkbox_frame = tk.Frame(root)
checkbox_frame.pack(pady=10)
tk.Checkbutton(checkbox_frame, text="Letters (A-z)", variable=use_letters, 
               font=("Arial", 9)).pack(anchor=tk.W)
tk.Checkbutton(checkbox_frame, text="Numbers (0-9)", variable=use_digits, 
               font=("Arial", 9)).pack(anchor=tk.W)
tk.Checkbutton(checkbox_frame, text="Symbols (!@#$)", variable=use_symbols, 
               font=("Arial", 9)).pack(anchor=tk.W)

generate_btn = tk.Button(root, text="Generate Password", command=generate_password,
                        bg="#4CAF50", fg="white", font=("Arial", 11, "bold"),
                        padx=20, pady=5)
generate_btn.pack(pady=15)

result_frame = tk.Frame(root)
result_frame.pack(pady=10)

result_text = tk.Text(result_frame, width=26, height=2, 
                     font=("Courier", 12), wrap=tk.WORD, 
                     state="disabled", relief=tk.SUNKEN, borderwidth=2)
result_text.pack(side=tk.LEFT, padx=5)

result_text.config(state="normal")
result_text.insert(1.0, "Your password will appear here")
result_text.config(state="disabled")

copy_button = tk.Button(result_frame, text="Copy", command=copy_to_clipboard,
                       bg="#2196F3", fg="white", font=("Arial", 9),
                       width=6, height=2)
copy_button.pack(side=tk.LEFT, padx=5)

queue_thread = threading.Thread(target=process_queue, daemon=True)
queue_thread.start()

length_thread = threading.Thread(target=update_length_display, daemon=True)
length_thread.start()

ui_thread = threading.Thread(target=ui_updater, daemon=True)
ui_thread.start()

cleanup_thread = threading.Thread(target=cleanup_old_operations, daemon=True)
cleanup_thread.start()

validation_thread = threading.Thread(target=validate_checkbox_state, daemon=True)
validation_thread.start()

root.mainloop()