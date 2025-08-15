// Enhanced Admin Panel JavaScript

let currentUser = null;
let users = [];
let config = [];
let levelTitles = [];
let rewards = [];

// Initialize admin panel
window.addEventListener('load', async () => {
    // Check if user is already authenticated
    try {
        const response = await fetch('/api/auth/me', {
            credentials: 'include'
        });
        
        if (response.ok) {
            const user = await response.json();
            if (user.role === 'admin') {
                // User is authenticated and is admin
                currentUser = user;
                document.getElementById('login-overlay').style.display = 'none';
                document.getElementById('admin-content').style.display = 'block';
                
                // Update user navigation
                updateUserNavigation();
                
                await loadUsers();
                await loadConfig();
                await loadLevelTitles();
                await loadRewards();
                
                // Show default tab (users) and render initial content
                showTab('users');
                
                // Ensure config grid is rendered after tabs are set up
                if (config && config.length > 0) {
                    renderConfigGrid();
                }
                
                return;
            }
        }
    } catch (error) {
        console.log('Not authenticated, showing login form');
    }
    
    // Show login form
    document.getElementById('login-overlay').style.display = 'flex';
    document.getElementById('admin-content').style.display = 'none';
    
    // Setup login form
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
});

// Handle login form submission
async function handleLogin(event) {
    event.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('login-error');
    
    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({ username, password })
        });
        
        if (response.ok) {
            const user = await response.json();
            if (user.role === 'admin') {
                currentUser = user;
                document.getElementById('login-overlay').style.display = 'none';
                document.getElementById('admin-content').style.display = 'block';
                
                // Update user navigation
                updateUserNavigation();
                
                await loadUsers();
                await loadConfig();
                await loadLevelTitles();
                await loadRewards();
            } else {
                errorDiv.textContent = 'Zugriff verweigert. Admin-Berechtigung erforderlich.';
                errorDiv.style.display = 'block';
            }
        } else {
            const error = await response.json();
            errorDiv.textContent = error.error || 'Login fehlgeschlagen';
            errorDiv.style.display = 'block';
        }
    } catch (error) {
        console.error('Login error:', error);
        errorDiv.textContent = 'Verbindungsfehler';
        errorDiv.style.display = 'block';
    }
}

// Update user navigation (similar to dashboard)
function updateUserNavigation() {
    const userNav = document.getElementById('user-nav');
    if (!userNav || !currentUser) return;
    
    userNav.innerHTML = `
        <span style="font-weight: 600;">${currentUser.username}</span>
        ${currentUser.role === 'admin' ? '<span style="color: #ef4444; font-size: 0.8rem; margin-left: 0.5rem;">ADMIN</span>' : ''}
        <div style="margin-top: 0.25rem; font-size: 0.8rem;">
            <a href="/profile.html" style="color: #93c5fd; text-decoration: none; margin-right: 0.5rem;">Profile</a>
            <a href="/" style="color: #10b981; text-decoration: none; margin-right: 0.5rem;">Dashboard</a>
            <a href="#" onclick="logout()" style="color: #f87171; text-decoration: none;">Logout</a>
        </div>
    `;
}

// Tab functionality
window.showTab = function(tabName) {
    // Hide all tab contents
    const allTabs = document.querySelectorAll('.tab-content');
    allTabs.forEach(tab => tab.classList.remove('active'));
    
    // Remove active class from all tab buttons
    const allButtons = document.querySelectorAll('.tab-button');
    allButtons.forEach(button => button.classList.remove('active'));
    
    // Show selected tab
    const selectedTab = document.getElementById(tabName + '-tab');
    if (selectedTab) {
        selectedTab.classList.add('active');
    }
    
    // Add active class to clicked button
    const selectedButton = event?.target || document.querySelector(`[onclick="showTab('${tabName}')"]`);
    if (selectedButton) {
        selectedButton.classList.add('active');
    }
    
    // Tab-specific initialization
    if (tabName === 'rewards') {
        renderRewards();
    } else if (tabName === 'users') {
        renderUsersTable();
    } else if (tabName === 'level') {
        renderLevelTitlesTable();
    }
};

// Logout function
async function logout() {
    try {
        await fetch('/api/auth/logout', {
            method: 'POST',
            credentials: 'include'
        });
    } catch (error) {
        console.error('Logout error:', error);
    }
    
    // Redirect to main page
    window.location.href = '/';
}

// Reset application function
async function resetApplication() {
    if (!confirm('⚠️ WARNUNG: Dies wird alle Daten (Benutzer, Aufgaben, Fortschritt) unwiderruflich löschen!\n\nMöchten Sie wirklich fortfahren?')) {
        return;
    }
    
    if (!confirm('🔴 LETZTE WARNUNG: Alle Daten werden gelöscht!\n\nSind Sie absolut sicher?')) {
        return;
    }
    
    try {
        const response = await fetch('/api/reset', {
            method: 'POST',
            credentials: 'include'
        });
        
        if (response.ok) {
            showAlert('System wurde erfolgreich zurückgesetzt! Seite wird neu geladen...', 'success');
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        } else {
            showAlert('Fehler beim Zurücksetzen des Systems', 'error');
        }
    } catch (error) {
        console.error('Reset error:', error);
        showAlert('Verbindungsfehler beim Zurücksetzen', 'error');
    }
}

// Show alert message
function showAlert(message, type = 'success') {
    const container = document.getElementById('alert-container');
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    
    container.appendChild(alert);
    
    setTimeout(() => {
        alert.remove();
    }, 5000);
}

// Load all users
async function loadUsers() {
    try {
        const response = await fetch('/api/admin/users', {
            credentials: 'include'
        });
        
        if (response.ok) {
            users = await response.json();
            renderUsersTable();
        } else {
            showAlert('Fehler beim Laden der Benutzer', 'error');
        }
    } catch (error) {
        console.error('Error loading users:', error);
        showAlert('Fehler beim Laden der Benutzer', 'error');
    }
}

// Render users table
function renderUsersTable() {
    const tbody = document.getElementById('users-tbody');
    tbody.innerHTML = '';
    
    users.forEach(user => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${user.id}</td>
            <td>${user.username}</td>
            <td>
                <span style="padding: 0.25rem 0.5rem; border-radius: 3px; font-size: 0.8rem; color: white; background: ${user.role === 'admin' ? '#ef4444' : '#3b82f6'}">
                    ${user.role.toUpperCase()}
                </span>
            </td>
            <td>${user.email || '-'}</td>
            <td>${new Date(user.created_at).toLocaleDateString()}</td>
            <td>${user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Nie'}</td>
            <td>
                <span style="padding: 0.25rem 0.5rem; border-radius: 3px; font-size: 0.8rem; color: white; background: ${user.is_active ? '#10b981' : '#6b7280'}">
                    ${user.is_active ? 'Aktiv' : 'Inaktiv'}
                </span>
            </td>
            <td class="user-actions">
                ${user.id !== currentUser.id ? `
                    ${(user.role === 'admin' && currentUser.id !== 1) ? 
                        '<span style="color: #6b7280; font-size: 0.8rem;">Nur Core-Admin kann Admin-Rechte entziehen</span>' : 
                        `<button class="btn ${user.role === 'admin' ? 'btn-warning' : 'btn-success'}" 
                                style="font-size: 0.8rem; padding: 0.25rem 0.5rem; margin-right: 0.5rem;" 
                                onclick="toggleUserRole(${user.id}, '${user.role}')">
                            ${user.role === 'admin' ? 'Admin entziehen' : 'Admin machen'}
                        </button>`
                    }
                    <button class="btn btn-danger" style="font-size: 0.8rem; padding: 0.25rem 0.5rem;" onclick="deleteUser(${user.id})">
                        Löschen
                    </button>
                ` : '<span style="color: #6b7280; font-size: 0.8rem;">Aktueller Benutzer</span>'}
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Delete user
async function deleteUser(userId) {
    if (!confirm('Sind Sie sicher, dass Sie diesen Benutzer löschen möchten? Diese Aktion kann nicht rückgängig gemacht werden.')) {
        return;
    }

    try {
        const response = await fetch(`/api/admin/users/${userId}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        if (response.ok) {
            showAlert('Benutzer erfolgreich gelöscht');
            await loadUsers();
        } else {
            const error = await response.json();
            showAlert(error.error || 'Fehler beim Löschen des Benutzers', 'error');
        }
    } catch (error) {
        console.error('Error deleting user:', error);
        showAlert('Fehler beim Löschen des Benutzers', 'error');
    }
}

// Toggle user role between admin and user
async function toggleUserRole(userId, currentRole) {
    // Only allow core admin (user ID 1) to remove admin rights
    if (currentRole === 'admin' && currentUser.id !== 1) {
        showAlert('Nur der Core-Administrator (User ID 1) kann Admin-Rechte entziehen.', 'error');
        return;
    }
    
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    const action = newRole === 'admin' ? 'Admin-Rechte gewähren für' : 'Admin-Rechte entziehen von';
    
    if (!confirm(`Sind Sie sicher, dass Sie ${action} diesen Benutzer möchten?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/admin/users/${userId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ role: newRole })
        });

        if (response.ok) {
            showAlert(`Benutzerrolle erfolgreich zu ${newRole === 'admin' ? 'Administrator' : 'Benutzer'} geändert`);
            await loadUsers();
        } else {
            const error = await response.json();
            showAlert(error.error || 'Fehler beim Aktualisieren der Benutzerrolle', 'error');
        }
    } catch (error) {
        console.error('Error updating user role:', error);
        showAlert('Fehler beim Aktualisieren der Benutzerrolle', 'error');
    }
}

// Load system configuration
async function loadConfig() {
    try {
        const response = await fetch('/api/admin/config', {
            credentials: 'include'
        });
        
        if (response.ok) {
            config = await response.json();
            renderConfigGrid();
        } else {
            showAlert('Fehler beim Laden der Konfiguration', 'error');
        }
    } catch (error) {
        console.error('Error loading config:', error);
        showAlert('Fehler beim Laden der Konfiguration', 'error');
    }
}

// Get German labels for configuration keys
function getGermanLabel(key) {
    const labels = {
        'exp_base_formula': 'XP Grundformel',
        'exp_urgency_formula': 'XP Dringlichkeitsformel',
        'exp_time_bonus': 'XP Zeitbonus',
        'exp_early_bonus': 'XP Rechtzeitig-Bonus',
        'exp_penalty_start_days': 'Strafbeginn (Tage)',
        'exp_penalty_max_days': 'Maximale Strafe (Tage)',
        'exp_multiplier_diff_1': 'Schwierigkeit Level 1',
        'exp_multiplier_diff_2': 'Schwierigkeit Level 2',
        'exp_multiplier_diff_3': 'Schwierigkeit Level 3',
        'exp_multiplier_diff_4': 'Schwierigkeit Level 4',
        'exp_multiplier_diff_5': 'Schwierigkeit Level 5',
        'exp_multiplier_urg_1': 'Dringlichkeit Level 1',
        'exp_multiplier_urg_2': 'Dringlichkeit Level 2',
        'exp_multiplier_urg_3': 'Dringlichkeit Level 3',
        'exp_multiplier_urg_4': 'Dringlichkeit Level 4',
        'exp_multiplier_urg_5': 'Dringlichkeit Level 5',
        'level_exp_base': 'Level XP Basis',
        'level_exp_multiplier': 'Level XP Multiplikator',
        'level_titles': 'Level Titel',
        'level_emoji': 'Level Emoji',
        'rewards_enabled': 'Belohnungen aktiviert',
        'rewards_config': 'Belohnungskonfiguration',
        'auto_approve_tasks': 'Aufgaben automatisch genehmigen',
        'max_daily_tasks': 'Maximale tägliche Aufgaben',
        'notification_system': 'Benachrichtigungssystem'
    };
    
    return labels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

// Render configuration grid
function renderConfigGrid() {
    // Categorize config items
    const categories = {
        exp: [],
        rewards: [],
        general: [],
        level: []
    };
    
    config.forEach(item => {
        if (item.config_key.includes('exp_')) {
            categories.exp.push(item);
        } else if (item.config_key.includes('level_')) {
            categories.level.push(item);
        } else if (item.config_key.includes('reward')) {
            categories.rewards.push(item);
        } else {
            categories.general.push(item);
        }
    });
    
    // Render each category
    renderConfigCategory('exp-config', categories.exp);
    renderConfigCategory('rewards-config-section', categories.rewards);
    renderConfigCategory('general-config', categories.general);
    renderLevelConfig();
}

function renderConfigCategory(containerId, items) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = '';
    
    // Group multiplier items for better display
    const multiplierItems = items.filter(item => item.config_key.includes('_multiplier_'));
    const otherItems = items.filter(item => !item.config_key.includes('_multiplier_') && 
                                           item.config_key !== 'level_titles' && 
                                           item.config_key !== 'rewards_config');
    
    // Render non-multiplier items first
    otherItems.forEach(item => {
        const configDiv = document.createElement('div');
        configDiv.className = 'config-item';
        
        let inputElement = '';
        if (item.config_key === 'rewards_enabled' || 
            item.config_key === 'notification_system' || 
            item.config_key === 'auto_approve_tasks' ||
            item.config_key.includes('_enabled') ||
            item.config_value === 'true' || 
            item.config_value === 'false') {
            inputElement = `
                <select data-key="${item.config_key}" onchange="handleConfigChange('${item.config_key}', this); autoSaveConfig();">
                    <option value="true" ${item.config_value === 'true' ? 'selected' : ''}>Aktiviert</option>
                    <option value="false" ${item.config_value === 'false' ? 'selected' : ''}>Deaktiviert</option>
                </select>
            `;
        } else {
            const inputType = (item.config_key.includes('_formula') || item.config_key.includes('_bonus') || item.config_key.includes('_multiplier') || item.config_key.includes('_days')) ? 'number' : 'text';
            const step = inputType === 'number' ? 'step="0.1"' : '';
            inputElement = `<input type="${inputType}" ${step} data-key="${item.config_key}" value="${item.config_value || ''}" onchange="handleConfigChange('${item.config_key}', this); autoSaveConfig();" />`;
        }
        
        configDiv.innerHTML = `
            <label>${getGermanLabel(item.config_key)}</label>
            ${inputElement}
            <div class="description">${item.description || ''}</div>
        `;
        
        container.appendChild(configDiv);
    });
    
    // Render multipliers in organized groups
    if (multiplierItems.length > 0) {
        const diffMultipliers = multiplierItems.filter(item => item.config_key.includes('_diff_'));
        const urgMultipliers = multiplierItems.filter(item => item.config_key.includes('_urg_'));
        
        if (diffMultipliers.length > 0) {
            const diffSection = document.createElement('div');
            diffSection.className = 'multiplier-section';
            diffSection.innerHTML = `
                <h5 style="color: #7ed957; margin: 1rem 0 0.5rem 0; border-bottom: 1px solid #555; padding-bottom: 0.3rem;">🎯 Schwierigkeits-Multiplikatoren</h5>
                <div class="multiplier-grid"></div>
            `;
            container.appendChild(diffSection);
            
            const diffGrid = diffSection.querySelector('.multiplier-grid');
            diffMultipliers.forEach(item => {
                const level = item.config_key.split('_').pop();
                const configDiv = document.createElement('div');
                configDiv.className = 'multiplier-item';
                configDiv.innerHTML = `
                    <label>Level ${level}</label>
                    <input type="number" step="0.1" data-key="${item.config_key}" value="${item.config_value || ''}" onchange="handleConfigChange('${item.config_key}', this); autoSaveConfig();" />
                    <div class="description">${item.description || ''}</div>
                `;
                diffGrid.appendChild(configDiv);
            });
        }
        
        if (urgMultipliers.length > 0) {
            const urgSection = document.createElement('div');
            urgSection.className = 'multiplier-section';
            urgSection.innerHTML = `
                <h5 style="color: #ff6b35; margin: 1rem 0 0.5rem 0; border-bottom: 1px solid #555; padding-bottom: 0.3rem;">⚡ Dringlichkeits-Multiplikatoren</h5>
                <div class="multiplier-grid"></div>
            `;
            container.appendChild(urgSection);
            
            const urgGrid = urgSection.querySelector('.multiplier-grid');
            urgMultipliers.forEach(item => {
                const level = item.config_key.split('_').pop();
                const configDiv = document.createElement('div');
                configDiv.className = 'multiplier-item';
                configDiv.innerHTML = `
                    <label>Level ${level}</label>
                    <input type="number" step="0.1" data-key="${item.config_key}" value="${item.config_value || ''}" onchange="handleConfigChange('${item.config_key}', this); autoSaveConfig();" />
                    <div class="description">${item.description || ''}</div>
                `;
                urgGrid.appendChild(configDiv);
            });
        }
    }
    
    // Add special handling for rewards management in rewards section
    if (containerId === 'rewards-config-section') {
        const rewardsManagementDiv = document.createElement('div');
        rewardsManagementDiv.innerHTML = `
            <div class="config-item" style="border-top: 2px solid #ffb347; margin-top: 1rem; padding-top: 1rem;">
                <h4 style="color: #ffb347; margin-bottom: 1rem;">🎁 Belohnungsobjekte verwalten</h4>
                <div id="rewards-list"></div>
                <div style="margin-top: 1rem;">
                    <button class="btn btn-primary" onclick="addReward()">Belohnung hinzufügen</button>
                    <button class="btn btn-success" onclick="saveRewards()">Belohnungen speichern</button>
                </div>
            </div>
        `;
        container.appendChild(rewardsManagementDiv);
    }
}

// Handle individual config changes
function handleConfigChange(configKey, element) {
    const saveButton = document.querySelector('.btn-success');
    if (saveButton) {
        saveButton.textContent = 'Änderungen speichern *';
        saveButton.style.background = '#ff8c42';
    }
}

// Auto-save configuration after a delay
function autoSaveConfig() {
    clearTimeout(window.configSaveTimeout);
    window.configSaveTimeout = setTimeout(() => {
        saveAllConfigSilently();
    }, 1500); // Wait 1.5 seconds after last change
}

// Save all configuration without showing success message (for auto-save)
async function saveAllConfigSilently() {
    try {
        const configData = {};
        
        // Collect all config values from all categories, excluding rewards management inputs
        const selectors = [
            '#exp-config input[data-key], #exp-config select[data-key]',
            '#rewards-config-section input[data-key], #rewards-config-section select[data-key]', 
            '#general-config input[data-key], #general-config select[data-key]'
        ];
        
        selectors.forEach(selector => {
            const inputs = document.querySelectorAll(selector);
            inputs.forEach(input => {
                const key = input.dataset.key;
                if (key) {
                    configData[key] = input.value;
                }
            });
        });
        
        // Add level titles if they exist
        if (levelTitles && levelTitles.length > 0) {
            configData.level_titles = JSON.stringify(levelTitles);
        }
        
        const response = await fetch('/api/admin/config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify(configData)
        });
        
        if (response.ok) {
            // Reset save button
            const saveButton = document.querySelector('.btn-success');
            if (saveButton) {
                saveButton.textContent = 'Konfiguration speichern';
                saveButton.style.background = '#7ed957';
            }
        } else {
            console.error('Auto-save failed:', await response.json());
        }
    } catch (error) {
        console.error('Error auto-saving config:', error);
    }
}

// Load level titles
async function loadLevelTitles() {
    const titleConfig = config.find(c => c.config_key === 'level_titles');
    if (titleConfig) {
        try {
            const parsed = JSON.parse(titleConfig.config_value || '[]');
            // Check if it's the old format (array of strings) or new format (array of objects)
            if (parsed.length > 0 && typeof parsed[0] === 'string') {
                // Convert old format to new format with emojis
                levelTitles = parsed.map((title, index) => ({
                    title: title,
                    emoji: index === 0 ? '🐷' : '🎯' // Default emojis
                }));
            } else {
                levelTitles = parsed;
            }
        } catch (e) {
            levelTitles = [
                { title: 'Anfänger', emoji: '🐷' },
                { title: 'Lehrling', emoji: '🎯' },
                { title: 'Geselle', emoji: '⚔️' },
                { title: 'Experte', emoji: '🏆' },
                { title: 'Meister', emoji: '👑' }
            ];
        }
    } else {
        levelTitles = [
            { title: 'Anfänger', emoji: '🐷' },
            { title: 'Lehrling', emoji: '🎯' },
            { title: 'Geselle', emoji: '⚔️' },
            { title: 'Experte', emoji: '🏆' },
            { title: 'Meister', emoji: '👑' }
        ];
    }
    renderLevelTitlesTable();
}

// Render level titles table
function renderLevelTitlesTable() {
    const tbody = document.getElementById('level-titles-tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    levelTitles.forEach((levelData, index) => {
        // Handle both old format (string) and new format (object)
        const title = typeof levelData === 'string' ? levelData : levelData.title;
        const emoji = typeof levelData === 'string' ? '🐷' : (levelData.emoji || '🐷');
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>Level ${index + 1}</td>
            <td><input type="text" value="${title}" data-level="${index}" data-field="title" style="width: 100%; padding: 0.5rem; border: 1px solid #555; border-radius: 4px; background: rgba(0,0,0,0.3); color: #f3f3f3;" onchange="updateLevelData(${index}, 'title', this.value)" /></td>
            <td><input type="text" value="${emoji}" data-level="${index}" data-field="emoji" style="width: 60px; padding: 0.5rem; border: 1px solid #555; border-radius: 4px; background: rgba(0,0,0,0.3); color: #f3f3f3; text-align: center; font-size: 1.2em;" maxlength="2" onchange="updateLevelData(${index}, 'emoji', this.value)" /></td>
            <td>
                <button class="btn btn-danger" style="font-size: 0.8rem; padding: 0.25rem 0.5rem;" onclick="removeLevelTitle(${index})">
                    Remove
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Add new level title
function addLevelTitle() {
    levelTitles.push({
        title: `Level ${levelTitles.length + 1} Title`,
        emoji: '🎯'
    });
    renderLevelTitlesTable();
}

// Update level data (title or emoji)
function updateLevelData(index, field, value) {
    if (index >= 0 && index < levelTitles.length) {
        // Ensure levelTitles[index] is an object
        if (typeof levelTitles[index] === 'string') {
            levelTitles[index] = {
                title: levelTitles[index],
                emoji: '🐷'
            };
        }
        levelTitles[index][field] = value;
        
        // Auto-save the changes
        saveLevelTitles();
    }
}

// Remove level title
function removeLevelTitle(index) {
    if (confirm('Are you sure you want to remove this level title?')) {
        levelTitles.splice(index, 1);
        renderLevelTitlesTable();
    }
}

// Save level titles
async function saveLevelTitles() {
    // Data is already updated via updateLevelData function, just save to server
    try {
        const response = await fetch('/api/admin/config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                level_titles: JSON.stringify(levelTitles)
            })
        });
        
        if (response.ok) {
            showAlert('Level-Titel und Emojis erfolgreich aktualisiert');
        } else {
            showAlert('Fehler beim Aktualisieren der Level-Titel', 'error');
        }
    } catch (error) {
        console.error('Error saving level titles:', error);
        showAlert('Error saving level titles', 'error');
    }
}

// Render level configuration section
function renderLevelConfig() {
    const container = document.getElementById('level-config');
    if (!container) return;
    
    container.innerHTML = `
        <div class="config-item">
            <label>Level-System Konfiguration:</label>
            <small>Verwalten Sie Level-Titel und Emojis für jedes Level einzeln</small>
        </div>
    `;
    
    // Render the enhanced level titles table
    renderLevelTitlesTable();
}

// Load rewards
async function loadRewards() {
    try {
        const response = await fetch('/api/admin/rewards', {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('Fehler beim Laden der Belohnungen');
        }
        
        rewards = await response.json();
        renderRewards();
    } catch (error) {
        console.error('Error loading rewards:', error);
        showAlert('Fehler beim Laden der Belohnungen: ' + error.message, 'error');
        rewards = [];
        renderRewards();
    }
}

// Render rewards
function renderRewards() {
    const container = document.getElementById('rewards-list');
    if (!container) return;
    
    // Clear the container and set up the new layout
    container.innerHTML = `
        <div style="margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center;">
            <div>
                <button class="btn btn-primary" onclick="addReward()">➕ Neue Belohnung</button>
                <button class="btn btn-success" style="margin-left: 0.5rem;" onclick="saveRewards()">💾 Alle speichern</button>
            </div>
        </div>
        
        <!-- Table View -->
        <div id="rewards-table-view">
            <div style="max-height: 70vh; overflow-y: auto;">
                <table class="rewards-table" style="width: 100%; border-collapse: collapse; background: rgba(35, 37, 38, 0.8); border-radius: 8px; overflow: hidden;">
                    <thead>
                        <tr style="background: linear-gradient(135deg, #ffb347 0%, #ff8c42 100%);">
                            <th style="padding: 0.75rem; color: #232526; font-weight: bold;">Name</th>
                            <th style="padding: 0.75rem; color: #232526; font-weight: bold;">Typ</th>
                            <th style="padding: 0.75rem; color: #232526; font-weight: bold;">Level</th>
                            <th style="padding: 0.75rem; color: #232526; font-weight: bold;">Status</th>
                            <th style="padding: 0.75rem; color: #232526; font-weight: bold;">Aktionen</th>
                        </tr>
                    </thead>
                    <tbody id="rewards-table-body">
                        <!-- Table rows will be populated here -->
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    renderRewardsTable();
}

// Render rewards as a table
function renderRewardsTable() {
    const tableBody = document.getElementById('rewards-table-body');
    if (!tableBody) return;
    
    tableBody.innerHTML = '';
    
    rewards.forEach(reward => {
        const row = document.createElement('tr');
        row.style.cssText = 'border-bottom: 1px solid #3a3a3a;';
        
        const typeText = reward.type === 'bonus' ? 'Bonus' : 
                        reward.type === 'milestone' ? 'Meilenstein' : 'Errungenschaft';
        
        row.innerHTML = `
            <td style="padding: 0.75rem; color: #f3f3f3;">${reward.icon || '🏆'} ${reward.name || 'Unbenannt'}</td>
            <td style="padding: 0.75rem; color: #ccc;">${typeText}</td>
            <td style="padding: 0.75rem; color: #ccc;">${reward.level || 1}</td>
            <td style="padding: 0.75rem;">
                <span style="background: ${reward.active ? '#28a745' : '#6c757d'}; color: white; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem;">
                    ${reward.active ? 'Aktiv' : 'Inaktiv'}
                </span>
            </td>
            <td style="padding: 0.75rem;">
                <button class="btn btn-sm" onclick="openRewardEditModal(${JSON.stringify(reward).replace(/"/g, '&quot;')})" 
                        style="background: #007bff; color: white; margin-right: 0.25rem; padding: 0.25rem 0.5rem;">
                    ✏️ Bearbeiten
                </button>
                <button class="btn btn-sm" onclick="deleteReward(${reward.id})" 
                        style="background: #dc3545; color: white; padding: 0.25rem 0.5rem;">
                    🗑️
                </button>
            </td>
        `;
        
        tableBody.appendChild(row);
    });
}

// Open reward edit modal
function openRewardEditModal(reward) {
    // Create modal overlay
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
    `;
    
    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
        background: linear-gradient(135deg, #232526 0%, #414345 100%);
        border: 1px solid #3a3a3a;
        border-radius: 12px;
        padding: 2rem;
        max-width: 500px;
        width: 90%;
        max-height: 80vh;
        overflow-y: auto;
    `;
    
    // Generate type-specific fields
    let typeSpecificFields = '';
    if (reward.type === 'bonus') {
        typeSpecificFields = `
            <div style="margin-bottom: 1rem;">
                <label style="color: #f3f3f3; font-size: 0.9rem; display: block; margin-bottom: 0.5rem;">Bonus XP:</label>
                <input type="number" id="bonus_exp" value="${reward.bonus_exp || 0}" 
                       style="width: 100%; padding: 0.5rem; border: 1px solid #3a3a3a; border-radius: 4px; background: #232526; color: #f3f3f3;" />
            </div>
        `;
    } else if (reward.type === 'milestone') {
        typeSpecificFields = `
            <div style="margin-bottom: 1rem;">
                <label style="color: #f3f3f3; font-size: 0.9rem; display: block; margin-bottom: 0.5rem;">Anzahl Aufgaben:</label>
                <input type="number" id="requirement_count" value="${reward.requirement_count || 1}" 
                       style="width: 100%; padding: 0.5rem; border: 1px solid #3a3a3a; border-radius: 4px; background: #232526; color: #f3f3f3;" />
            </div>
            <div style="margin-bottom: 1rem;">
                <label style="color: #f3f3f3; font-size: 0.9rem; display: block; margin-bottom: 0.5rem;">Wiederholbar:</label>
                <select id="is_repeatable" style="width: 100%; padding: 0.5rem; border: 1px solid #3a3a3a; border-radius: 4px; background: #232526; color: #f3f3f3;">
                    <option value="false" ${!reward.is_repeatable ? 'selected' : ''}>Nein</option>
                    <option value="true" ${reward.is_repeatable ? 'selected' : ''}>Ja</option>
                </select>
            </div>
        `;
    } else { // achievement
        typeSpecificFields = `
            <div style="margin-bottom: 1rem;">
                <label style="color: #f3f3f3; font-size: 0.9rem; display: block; margin-bottom: 0.5rem;">Einmalig erreichbar:</label>
                <select id="is_one_time" style="width: 100%; padding: 0.5rem; border: 1px solid #3a3a3a; border-radius: 4px; background: #232526; color: #f3f3f3;">
                    <option value="true" ${reward.is_one_time ? 'selected' : ''}>Ja</option>
                    <option value="false" ${!reward.is_one_time ? 'selected' : ''}>Nein</option>
                </select>
            </div>
        `;
    }
    
    modalContent.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
            <h3 style="color: #ffb347; margin: 0;">Belohnung bearbeiten</h3>
            <button id="modal-close-x" 
                    style="background: none; border: none; color: #ccc; font-size: 1.5rem; cursor: pointer;">×</button>
        </div>
        
        <div style="margin-bottom: 1rem;">
            <label style="color: #f3f3f3; font-size: 0.9rem; display: block; margin-bottom: 0.5rem;">Name:</label>
            <input type="text" id="reward_name" value="${reward.name || ''}" placeholder="Belohnungsname" 
                   style="width: 100%; padding: 0.5rem; border: 1px solid #3a3a3a; border-radius: 4px; background: #232526; color: #f3f3f3;" />
        </div>
        
        <div style="margin-bottom: 1rem;">
            <label style="color: #f3f3f3; font-size: 0.9rem; display: block; margin-bottom: 0.5rem;">Typ:</label>
            <select id="reward_type" onchange="updateRewardFields()" style="width: 100%; padding: 0.5rem; border: 1px solid #3a3a3a; border-radius: 4px; background: #232526; color: #f3f3f3;">
                <option value="achievement" ${reward.type === 'achievement' ? 'selected' : ''}>Errungenschaft</option>
                <option value="milestone" ${reward.type === 'milestone' ? 'selected' : ''}>Meilenstein</option>
                <option value="bonus" ${reward.type === 'bonus' ? 'selected' : ''}>Bonus</option>
            </select>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
            <div>
                <label style="color: #f3f3f3; font-size: 0.9rem; display: block; margin-bottom: 0.5rem;">Icon:</label>
                <input type="text" id="reward_icon" value="${reward.icon || '🏆'}" placeholder="🏆" 
                       style="width: 100%; padding: 0.5rem; border: 1px solid #3a3a3a; border-radius: 4px; background: #232526; color: #f3f3f3;" />
            </div>
            <div>
                <label style="color: #f3f3f3; font-size: 0.9rem; display: block; margin-bottom: 0.5rem;">Level:</label>
                <input type="number" id="reward_level" value="${reward.level || 1}" min="1" max="10" 
                       style="width: 100%; padding: 0.5rem; border: 1px solid #3a3a3a; border-radius: 4px; background: #232526; color: #f3f3f3;" />
            </div>
        </div>
        
        <div style="margin-bottom: 1rem;">
            <label style="color: #f3f3f3; font-size: 0.9rem; display: block; margin-bottom: 0.5rem;">Beschreibung:</label>
            <input type="text" id="reward_description" value="${reward.description || ''}" placeholder="Beschreibung" 
                   style="width: 100%; padding: 0.5rem; border: 1px solid #3a3a3a; border-radius: 4px; background: #232526; color: #f3f3f3;" />
        </div>
        
        <div id="type-specific-fields">
            ${typeSpecificFields}
        </div>
        
        <div style="margin-bottom: 1rem;">
            <label style="color: #f3f3f3; font-size: 0.9rem; display: block; margin-bottom: 0.5rem;">Status:</label>
            <select id="reward_active" style="width: 100%; padding: 0.5rem; border: 1px solid #3a3a3a; border-radius: 4px; background: #232526; color: #f3f3f3;">
                <option value="true" ${reward.active ? 'selected' : ''}>Aktiv</option>
                <option value="false" ${!reward.active ? 'selected' : ''}>Inaktiv</option>
            </select>
        </div>
        
        <div style="display: flex; gap: 1rem; justify-content: flex-end;">
            <button id="modal-cancel" 
                    class="btn" style="background: #6c757d; color: white; padding: 0.75rem 1.5rem; cursor: pointer;">
                Abbrechen
            </button>
            <button id="modal-save" 
                    class="btn" style="background: #28a745; color: white; padding: 0.75rem 1.5rem; cursor: pointer;">
                Speichern
            </button>
        </div>
    `;
    
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    
    // Attach event listeners after DOM is created
    const closeButton = modal.querySelector('#modal-close-x');
    const cancelButton = modal.querySelector('#modal-cancel');
    const saveButton = modal.querySelector('#modal-save');
    
    // Close modal handlers
    const closeModal = () => modal.remove();
    closeButton.addEventListener('click', closeModal);
    cancelButton.addEventListener('click', closeModal);
    
    // Save button handler
    saveButton.addEventListener('click', () => saveRewardFromModal(reward.id));
    
    // Close modal on overlay click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

// Save reward from modal
async function saveRewardFromModal(rewardId) {
    try {
        const reward = rewards.find(r => r.id === rewardId);
        if (!reward) return;
        
        // Update reward with form values
        reward.name = document.getElementById('reward_name').value;
        reward.type = document.getElementById('reward_type').value;
        reward.icon = document.getElementById('reward_icon').value;
        reward.level = parseInt(document.getElementById('reward_level').value);
        reward.description = document.getElementById('reward_description').value;
        reward.active = document.getElementById('reward_active').value === 'true';
        
        // Update type-specific fields based on current type
        const currentType = document.getElementById('reward_type').value;
        if (currentType === 'bonus') {
            reward.bonus_exp = parseInt(document.getElementById('bonus_exp').value);
        } else if (currentType === 'milestone') {
            reward.requirement_count = parseInt(document.getElementById('requirement_count').value);
            reward.is_repeatable = document.getElementById('is_repeatable').value === 'true';
        } else if (currentType === 'achievement') {
            reward.is_one_time = document.getElementById('is_one_time').value === 'true';
        }
        
        // Save to database
        const response = await fetch(`/api/admin/rewards/${rewardId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify(reward)
        });
        
        if (!response.ok) {
            throw new Error('Fehler beim Speichern der Belohnung');
        }
        
        // Close modal and refresh view
        const modalElement = document.querySelector('[style*="position: fixed"]');
        if (modalElement) {
            modalElement.remove();
        }
        renderRewardsTable();
        showAlert('Belohnung erfolgreich gespeichert!', 'success');
        
    } catch (error) {
        console.error('Error saving reward:', error);
        showAlert('Fehler beim Speichern der Belohnung: ' + error.message, 'error');
    }
}

// Update reward field in database with auto-save
async function updateRewardFieldDB(rewardId, field, value) {
    try {
        const reward = rewards.find(r => r.id === rewardId);
        if (!reward) return;
        
        // Update local data
        reward[field] = value;
        
        // Auto-save after a short delay
        clearTimeout(window.rewardSaveTimeout);
        window.rewardSaveTimeout = setTimeout(async () => {
            try {
                const response = await fetch(`/api/admin/rewards/${rewardId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include',
                    body: JSON.stringify(reward)
                });
                
                if (!response.ok) {
                    throw new Error('Fehler beim Speichern der Belohnung');
                }
            } catch (error) {
                console.error('Error saving reward:', error);
                showAlert('Fehler beim Speichern der Belohnung: ' + error.message, 'error');
            }
        }, 1500);
    } catch (error) {
        console.error('Error updating reward field:', error);
    }
}

// Update reward fields based on type selection
function updateRewardFields() {
    const typeSelect = document.getElementById('reward_type');
    const typeSpecificContainer = document.getElementById('type-specific-fields');
    
    if (!typeSelect || !typeSpecificContainer) return;
    
    const selectedType = typeSelect.value;
    let typeSpecificFields = '';
    
    if (selectedType === 'bonus') {
        typeSpecificFields = `
            <div style="margin-bottom: 1rem;">
                <label style="color: #f3f3f3; font-size: 0.9rem; display: block; margin-bottom: 0.5rem;">Bonus XP:</label>
                <input type="number" id="bonus_exp" value="0" 
                       style="width: 100%; padding: 0.5rem; border: 1px solid #3a3a3a; border-radius: 4px; background: #232526; color: #f3f3f3;" />
            </div>
        `;
    } else if (selectedType === 'milestone') {
        typeSpecificFields = `
            <div style="margin-bottom: 1rem;">
                <label style="color: #f3f3f3; font-size: 0.9rem; display: block; margin-bottom: 0.5rem;">Anzahl Aufgaben:</label>
                <input type="number" id="requirement_count" value="1" 
                       style="width: 100%; padding: 0.5rem; border: 1px solid #3a3a3a; border-radius: 4px; background: #232526; color: #f3f3f3;" />
            </div>
            <div style="margin-bottom: 1rem;">
                <label style="color: #f3f3f3; font-size: 0.9rem; display: block; margin-bottom: 0.5rem;">Wiederholbar:</label>
                <select id="is_repeatable" style="width: 100%; padding: 0.5rem; border: 1px solid #3a3a3a; border-radius: 4px; background: #232526; color: #f3f3f3;">
                    <option value="false">Nein</option>
                    <option value="true">Ja</option>
                </select>
            </div>
        `;
    } else { // achievement
        typeSpecificFields = `
            <div style="margin-bottom: 1rem;">
                <label style="color: #f3f3f3; font-size: 0.9rem; display: block; margin-bottom: 0.5rem;">Einmalig erreichbar:</label>
                <select id="is_one_time" style="width: 100%; padding: 0.5rem; border: 1px solid #3a3a3a; border-radius: 4px; background: #232526; color: #f3f3f3;">
                    <option value="true">Ja</option>
                    <option value="false">Nein</option>
                </select>
            </div>
        `;
    }
    
    typeSpecificContainer.innerHTML = typeSpecificFields;
}

// Toggle reward active status
async function toggleRewardActive(rewardId) {
    try {
        const reward = rewards.find(r => r.id === rewardId);
        if (!reward) return;
        
        reward.active = !reward.active;
        
        const response = await fetch(`/api/admin/rewards/${rewardId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify(reward)
        });
        
        if (!response.ok) {
            throw new Error('Fehler beim Ändern des Belohnungsstatus');
        }
        
        renderRewards();
        showAlert('Belohnungsstatus geändert', 'success');
    } catch (error) {
        console.error('Error toggling reward status:', error);
        showAlert('Fehler beim Ändern des Belohnungsstatus: ' + error.message, 'error');
    }
}

// Delete reward
async function deleteReward(rewardId) {
    if (!confirm('Sind Sie sicher, dass Sie diese Belohnung löschen möchten?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/admin/rewards/${rewardId}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('Fehler beim Löschen der Belohnung');
        }
        
        // Remove from local array
        rewards = rewards.filter(r => r.id !== rewardId);
        renderRewards();
        showAlert('Belohnung gelöscht', 'success');
    } catch (error) {
        console.error('Error deleting reward:', error);
        showAlert('Fehler beim Löschen der Belohnung: ' + error.message, 'error');
    }
}

// Update individual reward field with auto-save
function updateRewardField(index, field, value) {
    if (rewards[index]) {
        rewards[index][field] = value;
        // Auto-save after a short delay
        clearTimeout(window.rewardSaveTimeout);
        window.rewardSaveTimeout = setTimeout(() => {
            saveRewardsSilently();
        }, 1000);
    }
}

// Save rewards without showing success message (for auto-save)
async function saveRewardsSilently() {
    try {
        const rewardsEnabledSelect = document.querySelector('select[data-key="rewards_enabled"]');
        const rewardsEnabled = rewardsEnabledSelect ? rewardsEnabledSelect.value === 'true' : true;
        
        const response = await fetch('/api/admin/config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                rewards_config: JSON.stringify(rewards),
                rewards_enabled: rewardsEnabled.toString()
            })
        });
        
        if (!response.ok) {
            console.error('Auto-save failed:', await response.json());
        }
    } catch (error) {
        console.error('Error auto-saving rewards:', error);
    }
}

// Save rewards with success message (for manual save button)
async function saveRewards() {
    try {
        await saveRewardsSilently();
        showAlert('Belohnungen erfolgreich gespeichert!', 'success');
    } catch (error) {
        console.error('Error saving rewards:', error);
        showAlert('Fehler beim Speichern der Belohnungen: ' + error.message, 'error');
    }
}

// Add new reward
async function addReward() {
    try {
        const newReward = {
            name: 'Neue Belohnung',
            type: 'achievement',
            description: 'Beschreibung eingeben',
            bonus_exp: 0,
            requirement_count: 1,
            is_repeatable: false,
            is_one_time: true,
            icon: '🏆',
            color: '#FFD700',
            level: 1
        };
        
        const response = await fetch('/api/admin/rewards', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify(newReward)
        });
        
        if (!response.ok) {
            throw new Error('Fehler beim Erstellen der Belohnung');
        }
        
        const result = await response.json();
        newReward.id = result.id;
        rewards.push(newReward);
        renderRewards();
        showAlert('Neue Belohnung hinzugefügt', 'success');
    } catch (error) {
        console.error('Error adding reward:', error);
        showAlert('Fehler beim Hinzufügen der Belohnung: ' + error.message, 'error');
    }
}

// Save all configuration
async function saveAllConfig() {
    const configData = {};
    
    // Show loading state on save buttons
    const saveButtons = document.querySelectorAll('.btn-success');
    const originalStates = [];
    
    saveButtons.forEach((button, index) => {
        originalStates[index] = {
            text: button.textContent,
            disabled: button.disabled
        };
        button.textContent = '💾 Speichere...';
        button.disabled = true;
    });
    
    // Collect all config values from all categories, excluding rewards management inputs
    const selectors = [
        '#exp-config input, #exp-config select',
        '#rewards-config-section input[data-key], #rewards-config-section select[data-key]', 
        '#general-config input, #general-config select'
    ];
    
    selectors.forEach(selector => {
        const inputs = document.querySelectorAll(selector);
        inputs.forEach(input => {
            const key = input.dataset.key;
            if (key) {
                configData[key] = input.value;
            }
        });
    });
    
    try {
        const response = await fetch('/api/admin/config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify(configData)
        });
        
        if (response.ok) {
            showAlert('Konfiguration erfolgreich gespeichert');
            
            // Enhanced save button feedback
            const saveButtons = document.querySelectorAll('.btn-success');
            saveButtons.forEach(button => {
                const originalText = button.textContent;
                const originalBg = button.style.background;
                
                // Show success state
                button.textContent = '✅ Erfolgreich gespeichert';
                button.style.background = '#22c55e';
                button.style.transform = 'scale(1.02)';
                button.disabled = true;
                
                // Reset after 2 seconds
                setTimeout(() => {
                    button.textContent = originalText;
                    button.style.background = originalBg;
                    button.style.transform = 'scale(1)';
                    button.disabled = false;
                }, 2000);
            });
            
            // Reload config to reflect changes
            await loadConfig();
        } else {
            showAlert('Fehler beim Speichern der Konfiguration', 'error');
            
            // Restore button states on error
            saveButtons.forEach((button, index) => {
                button.textContent = originalStates[index].text;
                button.disabled = originalStates[index].disabled;
            });
        }
    } catch (error) {
        console.error('Error saving config:', error);
        showAlert('Fehler beim Speichern der Konfiguration', 'error');
        
        // Restore button states on error
        saveButtons.forEach((button, index) => {
            button.textContent = originalStates[index].text;
            button.disabled = originalStates[index].disabled;
        });
    }
}

// Show create user modal
function showCreateUserModal() {
    document.getElementById('create-user-modal').style.display = 'block';
}

// Close create user modal
function closeCreateUserModal() {
    document.getElementById('create-user-modal').style.display = 'none';
    document.getElementById('create-user-form').reset();
}

// Handle create user form submission
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('create-user-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = {
                username: document.getElementById('new-username').value,
                password: document.getElementById('new-password').value,
                role: document.getElementById('new-role').value,
                email: document.getElementById('new-email').value
            };
            
            try {
                const response = await fetch('/api/admin/users', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include',
                    body: JSON.stringify(formData)
                });
                
                if (response.ok) {
                    showAlert('User created successfully');
                    closeCreateUserModal();
                    await loadUsers();
                } else {
                    const error = await response.json();
                    showAlert(error.error || 'Failed to create user', 'error');
                }
            } catch (error) {
                console.error('Error creating user:', error);
                showAlert('Error creating user', 'error');
            }
        });
    }
    
    // Initialize reset button
    setupResetButton();
});

// Logout function
function logout() {
    fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
    }).then(() => {
        window.location.href = '/login.html';
    });
}

// Setup reset button functionality
function setupResetButton() {
    const resetBtn = document.getElementById('reset-app');
    if (resetBtn) {
        resetBtn.onclick = async () => {
            // Enhanced confirmation for admin panel
            const step1 = confirm('⚠️ WARNUNG: Möchten Sie wirklich ALLE Daten unwiderruflich löschen?\n\nDies umfasst:\n- Alle Aufgaben und deren Verlauf\n- Benutzer-XP und Statistiken\n- Systemkonfigurationen\n- Archivierte Daten\n\nKlicken Sie "OK" um fortzufahren oder "Abbrechen" um abzubrechen.');
            
            if (!step1) return;
            
            const val = prompt('Zur finalen Bestätigung geben Sie "RESET" ein (in Großbuchstaben):');
            if (val && val.trim() === 'RESET') {
                try {
                    showAlert('Setze System zurück...', 'info');
                    
                    const response = await fetch('/api/reset', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                    });
                    
                    if (response.ok) {
                        showAlert('System erfolgreich zurückgesetzt! Die Seite wird neu geladen...', 'success');
                        setTimeout(() => {
                            window.location.href = '/';
                        }, 2000);
                    } else {
                        throw new Error('Reset fehlgeschlagen');
                    }
                } catch (error) {
                    console.error('Reset error:', error);
                    showAlert('Fehler beim Zurücksetzen des Systems: ' + error.message, 'error');
                }
            } else if (val !== null) {
                showAlert('Falscher Bestätigungstext. Reset abgebrochen.', 'error');
            }
        };
    }
}

// Global functions for HTML onclick events
window.deleteUser = deleteUser;
window.addLevelTitle = addLevelTitle;
window.removeLevelTitle = removeLevelTitle;
window.saveLevelTitles = saveLevelTitles;
window.addReward = addReward;
window.updateRewardFieldDB = updateRewardFieldDB;
window.toggleRewardActive = toggleRewardActive;
window.deleteReward = deleteReward;
window.saveAllConfig = saveAllConfig;
window.showCreateUserModal = showCreateUserModal;
window.closeCreateUserModal = closeCreateUserModal;
window.setupResetButton = setupResetButton;
window.autoSaveConfig = autoSaveConfig;
window.logout = logout;
window.openRewardEditModal = openRewardEditModal;
window.saveRewardFromModal = saveRewardFromModal;
window.updateRewardFields = updateRewardFields;
window.resetApplication = resetApplication;
window.updateLevelData = updateLevelData;
