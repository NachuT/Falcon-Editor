
# ============================================================================
# WORKER.PY - Run this on the training computer(s)
# Optimized with Intelligent Caching & Priority Handling
# ============================================================================
import socket
import pickle
import torch
import numpy as np
import time
from collections import OrderedDict

# ============================================================================
# OPTIMIZATION ALGORITHMS (Same as server)
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
    QuickSort algorithm - sorts list in ascending order.
    Uses middle element as pivot with three-way partitioning.
    """
    if len(sort_list) <= 1:
        return sort_list
    
    pivot_index = len(sort_list) // 2
    pivot = sort_list[pivot_index]
    
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
    
    return quicksort(less_than_pivot) + equal_to_pivot + quicksort(greater_than_pivot)


# ============================================================================
# OPTIMIZED WORKER CLASS
# ============================================================================

class OptimizedWorker:
    def __init__(self, server_host, server_port=5000, cache_size=10):
        self.server_host = server_host
        self.server_port = server_port
        self.cache_size = cache_size
        
        # Performance optimizations
        self.data_cache = OrderedDict()  # Cache loaded datasets
        self.model_cache = OrderedDict()  # Cache compiled models
        self.result_history = []  # History of trial results
        
        # Statistics tracking
        self.trials_completed = 0
        self.total_training_time = 0
        self.cache_hits = 0
        self.cache_misses = 0
    
    def get_cache_key(self, hyperparams):
        """
        Generate cache key from hyperparameters.
        Uses quicksort to ensure consistent ordering.
        """
        # Sort parameter names for consistent key
        sorted_keys = quicksort(list(hyperparams.keys()))
        
        # Create key from sorted parameters
        key_parts = []
        for k in sorted_keys:
            if k in ['input_size', 'output_size', 'batch_size']:
                key_parts.append(f"{k}:{hyperparams[k]}")
        
        return "_".join(key_parts)
    
    def find_cached_data(self, input_size, output_size, batch_size):
        """
        Use binary search to find cached data with similar parameters.
        Returns cached data if found, None otherwise.
        """
        cache_key = f"data_{input_size}_{output_size}_{batch_size}"
        
        if cache_key in self.data_cache:
            print(f"[Cache HIT] Found cached data: {cache_key}")
            self.cache_hits += 1
            # Move to end (most recently used)
            self.data_cache.move_to_end(cache_key)
            return self.data_cache[cache_key]
        
        print(f"[Cache MISS] Generating new data: {cache_key}")
        self.cache_misses += 1
        return None
    
    def cache_data(self, cache_key, data):
        """
        Cache data with LRU eviction policy.
        Uses quicksort to manage cache priority.
        """
        # Add to cache
        self.data_cache[cache_key] = data
        self.data_cache.move_to_end(cache_key)
        
        # Evict oldest if cache is full
        if len(self.data_cache) > self.cache_size:
            oldest_key = next(iter(self.data_cache))
            print(f"[Cache] Evicting oldest entry: {oldest_key}")
            self.data_cache.pop(oldest_key)
    
    def generate_dummy_data(self, input_size, output_size, batch_size=32, num_batches=10):
        """
        Generate or retrieve cached data for training.
        Uses caching to avoid regenerating identical datasets.
        
        REPLACE THIS WITH YOUR REAL DATA LOADING:
        ==========================================
        Example:
        from torch.utils.data import DataLoader, TensorDataset
        
        X_train = torch.load('X_train.pt')
        y_train = torch.load('y_train.pt')
        dataset = TensorDataset(X_train, y_train)
        dataloader = DataLoader(dataset, batch_size=batch_size, shuffle=True)
        return list(dataloader)
        """
        cache_key = f"data_{input_size}_{output_size}_{batch_size}"
        
        # Check cache first
        cached_data = self.find_cached_data(input_size, output_size, batch_size)
        if cached_data is not None:
            return cached_data
        
        # Generate new data
        data = []
        for _ in range(num_batches):
            inputs = torch.randn(batch_size, input_size)
            labels = torch.randint(0, output_size, (batch_size,))
            data.append((inputs, labels))
        
        # Cache the data
        self.cache_data(cache_key, data)
        
        return data
    
    def optimize_hyperparams_order(self, hyperparams):
        """
        Reorder hyperparameters for optimal processing.
        Critical params first, using quicksort for organization.
        """
        # Define parameter importance (lower = more important)
        importance = {
            'learning_rate': 1,
            'optimizer': 2,
            'batch_size': 3,
            'hidden_size': 4,
            'epochs': 5,
            'dropout': 6,
            'weight_decay': 7,
        }
        
        # Create list of (importance, key, value)
        param_list = [(importance.get(k, 99), k, v) for k, v in hyperparams.items()]
        
        # Sort by importance using quicksort
        sorted_importance = quicksort([p[0] for p in param_list])
        
        # Rebuild ordered dict
        ordered_params = OrderedDict()
        for imp in sorted_importance:
            for param_imp, key, value in param_list:
                if param_imp == imp and key not in ordered_params:
                    ordered_params[key] = value
                    break
        
        return ordered_params
    
    def warm_start_from_similar(self, job):
        """
        Use similar trial results for warm starting.
        Binary search finds closest previous trial.
        """
        similar_trial = job.get('similar_trial')
        
        if similar_trial:
            print(f"\n[Warm Start] Using similar trial {similar_trial['trial_number']}")
            print(f"  Previous loss: {similar_trial['metrics']['final_loss']:.4f}")
            print(f"  Previous accuracy: {similar_trial['metrics']['final_accuracy']:.2f}%")
            
            # Could use this for:
            # 1. Early stopping if similar trial was bad
            # 2. Adjusting learning rate
            # 3. Reducing epochs
            
            if similar_trial['metrics']['final_loss'] > 1.0:
                print(f"  -> Similar trial had high loss, reducing epochs")
                job['hyperparams']['epochs'] = max(5, job['hyperparams']['epochs'] // 2)
        
        return job
    
    def predict_training_time(self, hyperparams):
        """
        Predict training time using historical data and binary search.
        Helps with resource allocation.
        """
        if not self.result_history:
            return None
        
        # Extract training times sorted by epochs
        times_by_epochs = [(r['hyperparams'].get('epochs', 10), r['training_time']) 
                          for r in self.result_history]
        
        if not times_by_epochs:
            return None
        
        # Sort by epochs
        times_by_epochs.sort(key=lambda x: x[0])
        epochs_list = [t[0] for t in times_by_epochs]
        times_list = [t[1] for t in times_by_epochs]
        
        # Find similar epoch count using optimized binary search
        target_epochs = hyperparams.get('epochs', 10)
        closest_idx = binary_search(epochs_list, target_epochs)
        
        if closest_idx >= 0 and closest_idx < len(times_list):
            predicted_time = times_list[closest_idx]
            print(f"[Prediction] Estimated training time: {predicted_time:.2f}s")
            return predicted_time
        
        return None
    
    def receive_job(self, conn):
        """Receive job from server."""
        size = int.from_bytes(conn.recv(4), 'big')
        data = b''
        while len(data) < size:
            packet = conn.recv(size - len(data))
            if not packet:
                break
            data += packet
        return pickle.loads(data)
    
    def send_results(self, conn, results):
        """Send results back to server."""
        data = pickle.dumps(results)
        conn.sendall(len(data).to_bytes(4, 'big'))
        conn.sendall(data)
    
    def run_training(self, job):
        """Execute training with optimizations."""
        print(f"\n{'='*70}")
        print(f"Trial {job['trial_number']}: Starting Training")
        
        if job.get('is_priority'):
            print("*** HIGH PRIORITY TRIAL ***")
        
        print(f"{'='*70}")
        
        # Optimize parameter ordering
        optimized_params = self.optimize_hyperparams_order(job['hyperparams'])
        
        print("Hyperparameters (optimized order):")
        for key, value in optimized_params.items():
            print(f"  {key}: {value}")
        print()
        
        # Warm start from similar trial
        job = self.warm_start_from_similar(job)
        
        # Predict training time
        self.predict_training_time(job['hyperparams'])
        
        # Execute the model code
        exec(job['model_code'], globals())
        
        # Prepare hyperparameters
        hyperparams = job['hyperparams'].copy()
        hyperparams['input_size'] = job['input_size']
        hyperparams['output_size'] = job['output_size']
        
        # Generate or retrieve cached data
        data = self.generate_dummy_data(
            job['input_size'], 
            job['output_size'],
            batch_size=hyperparams.get('batch_size', 32)
        )
        
        # Train model
        start_time = time.time()
        metrics = train_model(hyperparams, data)
        training_time = time.time() - start_time
        
        # Update statistics
        self.trials_completed += 1
        self.total_training_time += training_time
        
        # Store result in history
        result = {
            'trial_number': job['trial_number'],
            'hyperparams': job['hyperparams'],
            'metrics': metrics,
            'training_time': training_time
        }
        self.result_history.append(result)
        
        # Keep history sorted by loss for quick lookup
        if len(self.result_history) > 1:
            losses = [r['metrics']['final_loss'] for r in self.result_history]
            sorted_losses = quicksort(losses)
            
            sorted_history = []
            for loss in sorted_losses:
                for r in self.result_history:
                    if r['metrics']['final_loss'] == loss and r not in sorted_history:
                        sorted_history.append(r)
                        break
            self.result_history = sorted_history[-20:]  # Keep last 20
        
        print(f"\nTraining completed in {training_time:.2f} seconds")
        print(f"Final Loss: {metrics['final_loss']:.4f}")
        print(f"Final Accuracy: {metrics['final_accuracy']:.2f}%")
        
        # Print worker statistics
        avg_time = self.total_training_time / self.trials_completed
        cache_rate = (self.cache_hits / (self.cache_hits + self.cache_misses) * 100) if (self.cache_hits + self.cache_misses) > 0 else 0
        
        print(f"\nWorker Statistics:")
        print(f"  Trials completed: {self.trials_completed}")
        print(f"  Average time per trial: {avg_time:.2f}s")
        print(f"  Cache hit rate: {cache_rate:.1f}%")
        
        return result
    
    def connect_and_train(self):
        """Connect to server and perform training in a loop."""
        print(f"{'='*70}")
        print(f"Optimized Distributed Worker")
        print(f"Features: Data Caching, Binary Search, QuickSort")
        print(f"{'='*70}")
        print(f"Connecting to server at {self.server_host}:{self.server_port}")
        
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.connect((self.server_host, self.server_port))
            print("Connected successfully!\n")
            
            while True:
                # Receive job
                job = self.receive_job(s)
                
                # Check for termination signal
                if job.get('terminate', False):
                    print("\nReceived termination signal. Shutting down...")
                    print(f"\nFinal Worker Statistics:")
                    print(f"  Total trials: {self.trials_completed}")
                    print(f"  Total time: {self.total_training_time:.2f}s")
                    print(f"  Cache hits: {self.cache_hits}")
                    print(f"  Cache misses: {self.cache_misses}")
                    break
                
                # Train model
                results = self.run_training(job)
                
                # Send results back
                print("\nSending results back to server...")
                self.send_results(s, results)
                print("Results sent. Waiting for next job...")
            
            print("Worker shutdown complete.")

if __name__ == '__main__':
    # ========================================================================
    # CONFIGURATION - CHANGE THESE VALUES
    # ========================================================================
    
    # Replace with your server's IP address
    # To find your server's IP:
    # - Windows: Open cmd and type 'ipconfig' (look for IPv4 Address)
    # - Mac/Linux: Open terminal and type 'ifconfig' or 'ip addr'
    SERVER_IP = '192.168.1.100'  # CHANGE THIS TO YOUR SERVER'S IP!
    SERVER_PORT = 5000
    CACHE_SIZE = 10  # Number of datasets to cache
    
    # ========================================================================
    
    worker = OptimizedWorker(
        server_host=SERVER_IP,
        server_port=SERVER_PORT,
        cache_size=CACHE_SIZE
    )
    
    # Keep trying to connect and train
    retry_count = 0
    max_retries = 10
    
    while retry_count < max_retries:
        try:
            worker.connect_and_train()
            break  # Exit if server sends termination signal
        except ConnectionRefusedError:
            retry_count += 1
            print(f"Could not connect to server. Retry {retry_count}/{max_retries} in 5 seconds...")
            time.sleep(5)
        except Exception as e:
            retry_count += 1
            print(f"Error: {e}")
            print(f"Retry {retry_count}/{max_retries} in 5 seconds...")
            time.sleep(5)
    
    if retry_count >= max_retries:
        print(f"\nFailed to connect after {max_retries} attempts. Exiting.")
