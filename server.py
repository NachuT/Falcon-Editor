# ============================================================================
# SERVER.PY - Run this on the main computer
# Optimized with Binary Search & QuickSort for Cloud Computing
# ============================================================================
import socket
import pickle
import json
from typing import Dict, List, Any, Tuple
import threading
import optuna
from optuna.trial import Trial
from optuna.samplers import TPESampler
from optuna.pruners import MedianPruner
import time

# ============================================================================
# OPTIMIZATION ALGORITHMS
# ============================================================================

def binary_search(search_list, target):
    """
    Optimized binary search - finds closest value to target in sorted list.
    Returns index of closest value.
    Uses middle - 1 optimization for exact matches.
    """
    if not search_list:
        return -1
    
    lower = 0
    upper = len(search_list) - 1
    
    while lower <= upper:  # Changed to <= for proper termination
        middle = (upper + lower) // 2
        
        if search_list[middle] == target:
            return middle  # Exact match found!
        elif target > search_list[middle]:
            lower = middle + 1  # Target is in upper half
        else:
            upper = middle - 1  # Target is in lower half (OPTIMIZED - skip middle)
    
    # No exact match - find closest value
    # 'lower' now points to where target would be inserted
    if lower >= len(search_list):
        return len(search_list) - 1  # Target larger than all elements
    if lower == 0:
        return 0  # Target smaller than all elements
    
    # Compare lower and lower-1 to find closest
    if abs(search_list[lower-1] - target) < abs(search_list[lower] - target):
        return lower - 1
    return lower


def quicksort(sort_list):
    """
    Fixed quicksort algorithm - sorts list in ascending order.
    Uses divide and conquer with proper pivot selection.
    """
    if len(sort_list) <= 1:
        return sort_list
    
    # Use middle element as pivot
    pivot_index = len(sort_list) // 2
    pivot = sort_list[pivot_index]
    
    # Partition into three groups
    less_than_pivot = []
    equal_to_pivot = []
    greater_than_pivot = []
    
    for num in sort_list:
        if num < pivot:
            less_than_pivot.append(num)
        elif num == pivot:
            equal_to_pivot.append(num)
        else:
            greater_than_pivot.append(num)
    
    # Recursively sort and combine
    return quicksort(less_than_pivot) + equal_to_pivot + quicksort(greater_than_pivot)


# ============================================================================
# OPTIMIZED DISTRIBUTED SERVER
# ============================================================================

class OptimizedOptunaServer:
    def __init__(self, host='0.0.0.0', port=5000, n_trials=20, study_name='distributed_hp_tuning'):
        self.host = host
        self.port = port
        self.n_trials = n_trials
        self.study_name = study_name
        
        # Advanced sampler configuration
        sampler = TPESampler(
            n_startup_trials=10,
            multivariate=True,
            seed=42
        )
        
        pruner = MedianPruner(
            n_startup_trials=5,
            n_warmup_steps=3,
            interval_steps=1
        )
        
        # Create Optuna study
        self.study = optuna.create_study(
            study_name=study_name,
            storage=f'sqlite:///{study_name}.db',
            direction='minimize',
            sampler=sampler,
            pruner=pruner,
            load_if_exists=True
        )
        
        # Cloud computing optimizations
        self.results = []
        self.active_trials = {}
        self.worker_performance = {}  # Track worker speeds
        self.sorted_results = []      # Sorted by loss for quick access
        self.lock = threading.Lock()
        self.completed_trials = 0
        
        # Priority queue for trial assignment
        self.worker_queue = []  # List of (worker_speed, worker_addr, connection_time)
        
    def track_worker_performance(self, addr, training_time):
        """
        Track worker performance for intelligent job distribution.
        Uses quicksort to maintain sorted list of workers by speed.
        """
        with self.lock:
            if addr not in self.worker_performance:
                self.worker_performance[addr] = []
            
            self.worker_performance[addr].append(training_time)
            
            # Calculate average speed (lower is faster)
            avg_time = sum(self.worker_performance[addr]) / len(self.worker_performance[addr])
            
            print(f"[Performance] Worker {addr}: avg time = {avg_time:.2f}s")
    
    def get_worker_priority(self, addr):
        """
        Calculate worker priority (lower = higher priority = faster).
        Used for intelligent job assignment.
        """
        if addr not in self.worker_performance:
            return float('inf')  # New workers get lower priority initially
        
        avg_time = sum(self.worker_performance[addr]) / len(self.worker_performance[addr])
        return avg_time
    
    def find_similar_trial(self, hyperparams):
        """
        Use binary search to find similar trials for warm-starting.
        Searches sorted results to find trials with similar loss values.
        """
        if not self.sorted_results:
            return None
        
        # Extract a representative value (e.g., learning rate) for comparison
        search_value = hyperparams.get('learning_rate', 0.001)
        
        # Create sorted list of learning rates from results
        lr_values = quicksort([r['hyperparams'].get('learning_rate', 0.001) 
                               for r in self.sorted_results])
        
        if not lr_values:
            return None
        
        # Find closest trial using binary search
        closest_idx = binary_search(lr_values, search_value)
        
        if closest_idx >= 0 and closest_idx < len(self.sorted_results):
            similar_trial = self.sorted_results[closest_idx]
            print(f"[Optimization] Found similar trial with LR={lr_values[closest_idx]:.6f}")
            return similar_trial
        
        return None
    
    def update_sorted_results(self):
        """
        Maintain sorted list of results using quicksort.
        Enables fast lookup of best/worst trials for pruning decisions.
        """
        if not self.results:
            return
        
        # Extract loss values
        losses = [r['metrics']['final_loss'] for r in self.results]
        
        # Sort using quicksort
        sorted_losses = quicksort(losses)
        
        # Rebuild sorted results list
        self.sorted_results = []
        for loss in sorted_losses:
            for result in self.results:
                if result['metrics']['final_loss'] == loss and result not in self.sorted_results:
                    self.sorted_results.append(result)
                    break
        
        # Print performance quartiles
        if len(sorted_losses) >= 4:
            q1 = sorted_losses[len(sorted_losses)//4]
            median = sorted_losses[len(sorted_losses)//2]
            q3 = sorted_losses[3*len(sorted_losses)//4]
            print(f"[Stats] Loss Q1={q1:.4f}, Median={median:.4f}, Q3={q3:.4f}")
    
    def should_prioritize_trial(self, trial_params):
        """
        Decide if trial should be prioritized based on similar successful trials.
        Uses binary search to check if parameters are in promising regions.
        """
        if len(self.sorted_results) < 5:
            return False  # Not enough data yet
        
        # Get top 25% of trials
        top_quartile = self.sorted_results[:len(self.sorted_results)//4 + 1]
        
        # Check if trial parameters are similar to top performers
        similar_count = 0
        for top_trial in top_quartile:
            # Compare key hyperparameters
            lr_diff = abs(trial_params.get('learning_rate', 0) - 
                         top_trial['hyperparams'].get('learning_rate', 0))
            
            if lr_diff < 0.001:  # Close learning rate
                similar_count += 1
        
        return similar_count > 0
    
    def define_hyperparameter_space(self, trial: Trial) -> Dict[str, Any]:
        """Define the hyperparameter search space."""
        hyperparams = {
            'learning_rate': trial.suggest_float('learning_rate', 1e-5, 1e-1, log=True),
            'hidden_size': trial.suggest_categorical('hidden_size', [64, 128, 256, 512]),
            'batch_size': trial.suggest_categorical('batch_size', [16, 32, 64, 128]),
            'epochs': trial.suggest_int('epochs', 5, 20),
            'dropout': trial.suggest_float('dropout', 0.0, 0.5),
            'weight_decay': trial.suggest_float('weight_decay', 1e-6, 1e-2, log=True),
            'optimizer': trial.suggest_categorical('optimizer', ['adam', 'sgd', 'adamw']),
        }
        return hyperparams
    
    def get_model_code(self) -> str:
        """Return the model code as a string."""
        model_code = '''
import torch
import torch.nn as nn
import torch.optim as optim

class FlexibleNet(nn.Module):
    def __init__(self, input_size, hidden_size, output_size, dropout=0.0):
        super(FlexibleNet, self).__init__()
        self.fc1 = nn.Linear(input_size, hidden_size)
        self.dropout = nn.Dropout(dropout)
        self.relu = nn.ReLU()
        self.fc2 = nn.Linear(hidden_size, hidden_size // 2)
        self.fc3 = nn.Linear(hidden_size // 2, output_size)
    
    def forward(self, x):
        x = self.fc1(x)
        x = self.dropout(x)
        x = self.relu(x)
        x = self.fc2(x)
        x = self.relu(x)
        x = self.fc3(x)
        return x

def train_model(hyperparams, data):
    """Train model with given hyperparameters"""
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    
    model = FlexibleNet(
        input_size=hyperparams['input_size'],
        hidden_size=hyperparams['hidden_size'],
        output_size=hyperparams['output_size'],
        dropout=hyperparams['dropout']
    ).to(device)
    
    # Select optimizer
    if hyperparams['optimizer'] == 'adam':
        optimizer = optim.Adam(model.parameters(), 
                              lr=hyperparams['learning_rate'],
                              weight_decay=hyperparams['weight_decay'])
    elif hyperparams['optimizer'] == 'sgd':
        optimizer = optim.SGD(model.parameters(), 
                             lr=hyperparams['learning_rate'],
                             weight_decay=hyperparams['weight_decay'],
                             momentum=0.9)
    else:  # adamw
        optimizer = optim.AdamW(model.parameters(), 
                               lr=hyperparams['learning_rate'],
                               weight_decay=hyperparams['weight_decay'])
    
    criterion = nn.CrossEntropyLoss()
    
    # Training loop
    losses = []
    accuracies = []
    
    for epoch in range(hyperparams['epochs']):
        model.train()
        total_loss = 0
        correct = 0
        total = 0
        
        for inputs, labels in data:
            inputs, labels = inputs.to(device), labels.to(device)
            
            optimizer.zero_grad()
            outputs = model(inputs)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()
            
            total_loss += loss.item()
            _, predicted = outputs.max(1)
            total += labels.size(0)
            correct += predicted.eq(labels).sum().item()
        
        epoch_loss = total_loss / len(data)
        epoch_acc = 100. * correct / total
        losses.append(epoch_loss)
        accuracies.append(epoch_acc)
    
    return {
        'final_loss': losses[-1],
        'final_accuracy': accuracies[-1],
        'all_losses': losses,
        'all_accuracies': accuracies
    }
'''
        return model_code
    
    def send_job(self, conn, addr):
        """Send optimized job to worker based on performance."""
        with self.lock:
            if self.completed_trials >= self.n_trials:
                conn.sendall(pickle.dumps({'terminate': True}))
                return False
            
            # Create a new trial
            trial = self.study.ask()
            hyperparams = self.define_hyperparameter_space(trial)
            
            # Check if trial should be prioritized
            is_priority = self.should_prioritize_trial(hyperparams)
            
            # Find similar trial for warm starting
            similar_trial = self.find_similar_trial(hyperparams)
            
            # Store trial info
            self.active_trials[addr] = {
                'trial': trial,
                'start_time': time.time(),
                'hyperparams': hyperparams
            }
            
            # Prepare job
            job = {
                'terminate': False,
                'trial_number': trial.number,
                'hyperparams': hyperparams,
                'model_code': self.get_model_code(),
                'input_size': 10,
                'output_size': 2,
                'is_priority': is_priority,
                'similar_trial': similar_trial,
            }
            
            priority_str = " [HIGH PRIORITY]" if is_priority else ""
            similar_str = f" [Similar to Trial {similar_trial['trial_number']}]" if similar_trial else ""
            
            print(f"\n[Trial {trial.number}]{priority_str}{similar_str} Sending to {addr}")
            print(f"  Hyperparameters: {json.dumps(hyperparams, indent=2)}")
            
            data = pickle.dumps(job)
            conn.sendall(len(data).to_bytes(4, 'big'))
            conn.sendall(data)
            return True
    
    def receive_results(self, conn, addr):
        """Receive and process training results with optimization."""
        size = int.from_bytes(conn.recv(4), 'big')
        data = b''
        while len(data) < size:
            packet = conn.recv(size - len(data))
            if not packet:
                break
            data += packet
        
        result = pickle.loads(data)
        
        with self.lock:
            trial_info = self.active_trials.pop(addr, None)
            if trial_info:
                trial = trial_info['trial']
                elapsed_time = time.time() - trial_info['start_time']
                
                # Track worker performance
                self.track_worker_performance(addr, result['training_time'])
                
                # Report result to Optuna
                objective_value = result['metrics']['final_loss']
                self.study.tell(trial, objective_value)
                
                self.completed_trials += 1
                self.results.append(result)
                
                # Update sorted results for fast lookup
                self.update_sorted_results()
                
                # Calculate ranking
                rank = len([r for r in self.sorted_results 
                           if r['metrics']['final_loss'] < objective_value]) + 1
                
                print(f"\n[Trial {result['trial_number']}] Results received from {addr}")
                print(f"  Final Loss: {result['metrics']['final_loss']:.4f} (Rank: {rank}/{len(self.results)})")
                print(f"  Final Accuracy: {result['metrics']['final_accuracy']:.2f}%")
                print(f"  Training Time: {result['training_time']:.2f}s")
                print(f"  Progress: {self.completed_trials}/{self.n_trials} trials completed")
        
        return result
    
    def handle_client(self, conn, addr):
        """Handle connection from worker computer."""
        print(f"\n[Connection] Worker connected from {addr}")
        try:
            while True:
                if not self.send_job(conn, addr):
                    break
                self.receive_results(conn, addr)
                
                with self.lock:
                    if self.completed_trials >= self.n_trials:
                        break
        except Exception as e:
            print(f"[Error] Error handling client {addr}: {e}")
            with self.lock:
                self.active_trials.pop(addr, None)
        finally:
            conn.close()
            print(f"[Connection] Worker {addr} disconnected")
    
    def print_results(self):
        """Print final results with optimized statistics."""
        print("\n" + "="*70)
        print("HYPERPARAMETER TUNING COMPLETE!")
        print("="*70)
        
        best_trial = self.study.best_trial
        print(f"\nBest Trial: {best_trial.number}")
        print(f"Best Value (Loss): {best_trial.value:.6f}")
        print(f"\nBest Hyperparameters:")
        print(json.dumps(best_trial.params, indent=2))
        
        print(f"\nTop 5 Trials (using quicksort):")
        print("-" * 70)
        for i, result in enumerate(self.sorted_results[:5], 1):
            print(f"{i}. Trial {result['trial_number']}: Loss={result['metrics']['final_loss']:.6f}")
            print(f"   Params: {result['hyperparams']}")
        
        # Worker performance statistics
        print(f"\nWorker Performance Summary:")
        print("-" * 70)
        worker_speeds = []
        for addr, times in self.worker_performance.items():
            avg_time = sum(times) / len(times)
            worker_speeds.append((avg_time, addr, len(times)))
        
        sorted_workers = quicksort([w[0] for w in worker_speeds])
        for speed in sorted_workers:
            for avg_time, addr, num_trials in worker_speeds:
                if avg_time == speed:
                    print(f"  {addr}: {avg_time:.2f}s avg ({num_trials} trials)")
                    break
        
        print(f"\nStudy saved to: {self.study_name}.db")
        print("="*70)
    
    def start(self):
        """Start the optimized server."""
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.bind((self.host, self.port))
            s.listen()
            print(f"="*70)
            print(f"Optimized Optuna Distributed Server")
            print(f"Using Binary Search & QuickSort for Cloud Optimization")
            print(f"="*70)
            print(f"Server listening on {self.host}:{self.port}")
            print(f"Study name: {self.study_name}")
            print(f"Target trials: {self.n_trials}")
            print("Waiting for worker connections...\n")
            
            threads = []
            try:
                while self.completed_trials < self.n_trials:
                    s.settimeout(1.0)
                    try:
                        conn, addr = s.accept()
                        thread = threading.Thread(target=self.handle_client, args=(conn, addr))
                        thread.daemon = True
                        thread.start()
                        threads.append(thread)
                    except socket.timeout:
                        continue
                
                for thread in threads:
                    thread.join()
                
                self.print_results()
                
            except KeyboardInterrupt:
                print("\n\nServer interrupted by user")
                self.print_results()

if __name__ == '__main__':
    server = OptimizedOptunaServer(
        host='0.0.0.0',
        port=5000,
        n_trials=20,
        study_name='optimized_hp_tuning'
    )
    server.start()
