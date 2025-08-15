// Smart DOM updates that preserve user input and focus
export class SmartUpdater {
  constructor() {
    this.preserveState = new Map();
    this.deferredUpdates = [];
    this.updateInProgress = false;
  }

  // Check if any input elements are currently focused or being edited
  isUserInteracting() {
    const activeElement = document.activeElement;
    if (!activeElement) return false;

    // Check if it's an input element
    const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeElement.tagName);
    
    // Check if it's contenteditable
    const isContentEditable = activeElement.contentEditable === 'true';
    
    // Check if user is typing (has selection or cursor position)
    if (isInput || isContentEditable) {
      // Additional check: see if there's actual content being typed
      if (activeElement.type === 'text' || activeElement.tagName === 'TEXTAREA') {
        return activeElement.selectionStart !== activeElement.selectionEnd || 
               activeElement.value.length > 0;
      }
      return true;
    }
    
    return false;
  }

  // Preserve the state of all input elements in a container
  preserveInputStates(container = document) {
    const inputs = container.querySelectorAll('input, textarea, select');
    const states = new Map();
    
    inputs.forEach(input => {
      const id = this.getElementId(input);
      states.set(id, {
        value: input.value,
        selectionStart: input.selectionStart,
        selectionEnd: input.selectionEnd,
        focus: input === document.activeElement,
        scrollTop: input.scrollTop,
        scrollLeft: input.scrollLeft
      });
    });
    
    return states;
  }

  // Restore the state of input elements
  restoreInputStates(states, container = document) {
    if (!states) return;
    
    const inputs = container.querySelectorAll('input, textarea, select');
    
    inputs.forEach(input => {
      const id = this.getElementId(input);
      const state = states.get(id);
      
      if (state) {
        // Restore value
        if (input.value !== state.value) {
          input.value = state.value;
        }
        
        // Restore cursor position and selection
        if (typeof state.selectionStart === 'number') {
          try {
            input.setSelectionRange(state.selectionStart, state.selectionEnd);
          } catch (e) {
            // Some input types don't support selection
          }
        }
        
        // Restore scroll position
        if (typeof state.scrollTop === 'number') {
          input.scrollTop = state.scrollTop;
          input.scrollLeft = state.scrollLeft;
        }
        
        // Restore focus
        if (state.focus) {
          input.focus();
        }
      }
    });
  }

  // Generate a unique ID for an element
  getElementId(element) {
    // Use existing ID if available
    if (element.id) return element.id;
    
    // Use data attributes
    if (element.dataset.taskid) return `task-${element.dataset.taskid}-${element.className}`;
    
    // Use class and position as fallback
    const parent = element.closest('.task-card, .dashboard-card, .section');
    if (parent) {
      const index = Array.from(parent.querySelectorAll(element.tagName.toLowerCase())).indexOf(element);
      return `${parent.className}-${element.tagName}-${index}`;
    }
    
    // Last resort: use element position in DOM
    const allInputs = document.querySelectorAll('input, textarea, select');
    const index = Array.from(allInputs).indexOf(element);
    return `input-${index}`;
  }

  // Smart update function that preserves user interaction
  async smartUpdate(updateFunction, targetContainer = null) {
    // If user is actively interacting, defer the update
    if (this.isUserInteracting()) {
      console.log('User is typing, deferring update...');
      this.deferredUpdates.push({ updateFunction, targetContainer, timestamp: Date.now() });
      
      // Set up a listener to execute deferred updates when user stops interacting
      this.scheduleDelayedUpdate();
      return false; // Update was deferred
    }

    // Execute the update immediately
    return this.executeUpdate(updateFunction, targetContainer);
  }

  // Execute the actual update with state preservation
  async executeUpdate(updateFunction, targetContainer = null) {
    if (this.updateInProgress) return false;
    
    this.updateInProgress = true;
    
    try {
      // Preserve input states before update
      const states = this.preserveInputStates(targetContainer);
      
      // Execute the update
      await updateFunction();
      
      // Restore input states after a small delay to ensure DOM is updated
      setTimeout(() => {
        this.restoreInputStates(states, targetContainer);
        this.updateInProgress = false;
      }, 50);
      
      return true; // Update was executed
    } catch (error) {
      console.error('Error during smart update:', error);
      this.updateInProgress = false;
      return false;
    }
  }

  // Schedule delayed update execution
  scheduleDelayedUpdate() {
    if (this.delayedUpdateTimer) return; // Already scheduled
    
    this.delayedUpdateTimer = setTimeout(() => {
      this.checkForDelayedUpdates();
    }, 1000); // Check every second
  }

  // Check if we can execute deferred updates
  checkForDelayedUpdates() {
    this.delayedUpdateTimer = null;
    
    if (!this.isUserInteracting() && this.deferredUpdates.length > 0) {
      console.log(`Executing ${this.deferredUpdates.length} deferred updates...`);
      
      // Execute all deferred updates
      const updates = [...this.deferredUpdates];
      this.deferredUpdates = [];
      
      // Execute updates in sequence
      updates.forEach(async ({ updateFunction, targetContainer }) => {
        await this.executeUpdate(updateFunction, targetContainer);
      });
    } else if (this.deferredUpdates.length > 0) {
      // User still interacting, schedule another check
      this.scheduleDelayedUpdate();
    }
  }

  // Force execute all deferred updates (useful for critical updates)
  async forceExecuteDeferredUpdates() {
    if (this.deferredUpdates.length === 0) return;
    
    console.log('Force executing deferred updates...');
    const updates = [...this.deferredUpdates];
    this.deferredUpdates = [];
    
    for (const { updateFunction, targetContainer } of updates) {
      await this.executeUpdate(updateFunction, targetContainer);
    }
  }

  // Clean up old deferred updates (older than 30 seconds)
  cleanupDeferredUpdates() {
    const now = Date.now();
    this.deferredUpdates = this.deferredUpdates.filter(
      update => (now - update.timestamp) < 30000
    );
  }
}

// Create a global instance
export const smartUpdater = new SmartUpdater();

// Set up periodic cleanup
setInterval(() => {
  smartUpdater.cleanupDeferredUpdates();
}, 30000);
