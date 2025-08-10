// Enhanced Admin Panel JavaScript

let currentUser = null;
let users = [];
let config = [];
let levelTitles = [];
let rewards = [];

// Initialize admin panel
window.addEventListener('load', async () => {
    await checkAuth();
    await loadUsers();
    await loadConfig();
    await loadLevelTitles();
    await loadRewards();
});

// Check authentication and admin role
async function checkAuth() {
    try {
        const response = await fetch('/api/auth/me', {
            credentials: 'include'
        });
        
        if (!response.ok) {
            window.location.href = '/login.html';
            return;
        }
        
        currentUser = await response.json();
        
        if (currentUser.role !== 'admin') {
            alert('Zugriff verweigert. Admin-Berechtigung erforderlich.');
            window.location.href = '/';
            return;
        }
        
        document.getElementById('admin-username').textContent = currentUser.username;
    } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = '/login.html';
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
            <td>${user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}</td>
            <td>
                <span style="padding: 0.25rem 0.5rem; border-radius: 3px; font-size: 0.8rem; color: white; background: ${user.is_active ? '#10b981' : '#6b7280'}">
                    ${user.is_active ? 'Active' : 'Inactive'}
                </span>
            </td>
            <td class="user-actions">
                ${user.id !== currentUser.id ? `
                    <button class="btn ${user.role === 'admin' ? 'btn-warning' : 'btn-success'}" 
                            style="font-size: 0.8rem; padding: 0.25rem 0.5rem; margin-right: 0.5rem;" 
                            onclick="toggleUserRole(${user.id}, '${user.role}')">
                        ${user.role === 'admin' ? 'Admin entziehen' : 'Admin machen'}
                    </button>
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

// Render configuration grid
function renderConfigGrid() {
    // Categorize config items
    const categories = {
        exp: [],
        rewards: [],
        general: []
    };
    
    config.forEach(item => {
        if (item.config_key.includes('exp_') || item.config_key.includes('level_')) {
            categories.exp.push(item);
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
}

function renderConfigCategory(containerId, items) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = '';
    
    items.forEach(item => {
        // Skip level_titles and rewards_config - handled separately
        if (item.config_key === 'level_titles' || item.config_key === 'rewards_config') {
            return;
        }
        
        const configDiv = document.createElement('div');
        configDiv.className = 'config-item';
        
        let inputElement = '';
        if (item.config_key === 'rewards_enabled' || item.config_key.includes('_enabled')) {
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
            <label>${item.config_key.replace(/_/g, ' ').toUpperCase()}</label>
            ${inputElement}
            <div class="description">${item.description || ''}</div>
        `;
        
        container.appendChild(configDiv);
    });
    
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
            levelTitles = JSON.parse(titleConfig.config_value || '[]');
        } catch (e) {
            levelTitles = ['Novice', 'Apprentice', 'Journeyman', 'Expert', 'Master'];
        }
    } else {
        levelTitles = ['Novice', 'Apprentice', 'Journeyman', 'Expert', 'Master'];
    }
    renderLevelTitlesTable();
}

// Render level titles table
function renderLevelTitlesTable() {
    const tbody = document.getElementById('level-titles-tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    levelTitles.forEach((title, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>Level ${index + 1}</td>
            <td><input type="text" value="${title}" data-level="${index}" /></td>
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
    levelTitles.push(`Level ${levelTitles.length + 1} Title`);
    renderLevelTitlesTable();
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
    // Collect titles from inputs
    const inputs = document.querySelectorAll('#level-titles-tbody input');
    const newTitles = [];
    inputs.forEach(input => {
        if (input.value.trim()) {
            newTitles.push(input.value.trim());
        }
    });
    
    levelTitles = newTitles;
    
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
            showAlert('Level-Titel erfolgreich aktualisiert');
        } else {
            showAlert('Fehler beim Aktualisieren der Level-Titel', 'error');
        }
    } catch (error) {
        console.error('Error saving level titles:', error);
        showAlert('Error saving level titles', 'error');
    }
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
    
    container.innerHTML = '';
    
    // Group rewards by type for better organization
    const rewardsByType = {
        bonus: rewards.filter(r => r.type === 'bonus'),
        milestone: rewards.filter(r => r.type === 'milestone'),
        achievement: rewards.filter(r => r.type === 'achievement')
    };
    
    Object.entries(rewardsByType).forEach(([type, typeRewards]) => {
        if (typeRewards.length === 0) return;
        
        const typeHeader = document.createElement('h4');
        typeHeader.style.cssText = 'color: #ffb347; margin: 1.5rem 0 1rem 0; border-bottom: 1px solid #3a3a3a; padding-bottom: 0.5rem;';
        typeHeader.textContent = type === 'bonus' ? 'Bonus Belohnungen' : 
                                type === 'milestone' ? 'Meilenstein Belohnungen' : 'Errungenschaften';
        container.appendChild(typeHeader);
        
        typeRewards.forEach((reward) => {
            const rewardDiv = document.createElement('div');
            rewardDiv.className = 'reward-item';
            rewardDiv.style.cssText = 'margin-bottom: 1rem; padding: 1rem; border: 1px solid #3a3a3a; border-radius: 8px; background: rgba(255,179,71,0.05);';
            
            // Generate type-specific fields
            let typeSpecificFields = '';
            
            if (type === 'bonus') {
                typeSpecificFields = `
                    <div>
                        <label style="color: #f3f3f3; font-size: 0.9rem;">Bonus EXP:</label>
                        <input type="number" placeholder="Bonus EXP" value="${reward.bonus_exp || 0}" 
                               style="width: 100%; padding: 0.5rem; border: 1px solid #3a3a3a; border-radius: 4px; background: #232526; color: #f3f3f3; box-sizing: border-box;" 
                               onchange="updateRewardFieldDB(${reward.id}, 'bonus_exp', parseInt(this.value))" />
                    </div>
                `;
            } else if (type === 'milestone') {
                typeSpecificFields = `
                    <div>
                        <label style="color: #f3f3f3; font-size: 0.9rem;">Anzahl Aufgaben:</label>
                        <input type="number" placeholder="Anzahl" value="${reward.requirement_count || 1}" 
                               style="width: 100%; padding: 0.5rem; border: 1px solid #3a3a3a; border-radius: 4px; background: #232526; color: #f3f3f3; box-sizing: border-box;" 
                               onchange="updateRewardFieldDB(${reward.id}, 'requirement_count', parseInt(this.value))" />
                    </div>
                    <div>
                        <label style="color: #f3f3f3; font-size: 0.9rem;">Wiederholbar:</label>
                        <select style="width: 100%; padding: 0.5rem; border: 1px solid #3a3a3a; border-radius: 4px; background: #232526; color: #f3f3f3; box-sizing: border-box;"
                                onchange="updateRewardFieldDB(${reward.id}, 'is_repeatable', this.value === 'true')">
                            <option value="false" ${!reward.is_repeatable ? 'selected' : ''}>Nein</option>
                            <option value="true" ${reward.is_repeatable ? 'selected' : ''}>Ja</option>
                        </select>
                    </div>
                `;
            } else { // achievement
                typeSpecificFields = `
                    <div>
                        <label style="color: #f3f3f3; font-size: 0.9rem;">Einmalig erreichbar:</label>
                        <select style="width: 100%; padding: 0.5rem; border: 1px solid #3a3a3a; border-radius: 4px; background: #232526; color: #f3f3f3; box-sizing: border-box;"
                                onchange="updateRewardFieldDB(${reward.id}, 'is_one_time', this.value === 'true')">
                            <option value="true" ${reward.is_one_time ? 'selected' : ''}>Ja</option>
                            <option value="false" ${!reward.is_one_time ? 'selected' : ''}>Nein</option>
                        </select>
                    </div>
                `;
            }
            
            rewardDiv.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.8rem;">
                    <h5 style="color: #ffb347; margin: 0; flex-grow: 1; margin-right: 1rem;">${reward.icon || '🏆'} ${reward.name || 'Unbenannt'}</h5>
                    <div style="display: flex; gap: 0.5rem;">
                        <button class="btn btn-sm" onclick="toggleRewardActive(${reward.id})" 
                                style="background: ${reward.active ? '#28a745' : '#6c757d'}; color: white; padding: 0.25rem 0.75rem;">
                            ${reward.active ? 'Aktiv' : 'Inaktiv'}
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="deleteReward(${reward.id})" style="padding: 0.25rem 0.5rem;">
                            🗑️
                        </button>
                    </div>
                </div>
                <div style="margin-bottom: 0.8rem;">
                    <div style="margin-bottom: 0.5rem;">
                        <label style="color: #f3f3f3; font-size: 0.9rem;">Name:</label>
                        <input type="text" placeholder="Belohnungsname" value="${reward.name || ''}" 
                               style="width: 100%; padding: 0.5rem; border: 1px solid #3a3a3a; border-radius: 4px; background: #232526; color: #f3f3f3; box-sizing: border-box;" 
                               onchange="updateRewardFieldDB(${reward.id}, 'name', this.value)" />
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
                        <div>
                            <label style="color: #f3f3f3; font-size: 0.9rem;">Icon:</label>
                            <input type="text" placeholder="🏆" value="${reward.icon || '🏆'}" 
                                   style="width: 100%; padding: 0.5rem; border: 1px solid #3a3a3a; border-radius: 4px; background: #232526; color: #f3f3f3; box-sizing: border-box;" 
                                   onchange="updateRewardFieldDB(${reward.id}, 'icon', this.value)" />
                        </div>
                        <div>
                            <label style="color: #f3f3f3; font-size: 0.9rem;">Level:</label>
                            <input type="number" placeholder="Level" value="${reward.level || 1}" min="1" max="10" 
                                   style="width: 100%; padding: 0.5rem; border: 1px solid #3a3a3a; border-radius: 4px; background: #232526; color: #f3f3f3; box-sizing: border-box;" 
                                   onchange="updateRewardFieldDB(${reward.id}, 'level', parseInt(this.value))" />
                        </div>
                    </div>
                </div>
                <div style="margin-bottom: 0.8rem;">
                    <label style="color: #f3f3f3; font-size: 0.9rem;">Beschreibung:</label>
                    <input type="text" placeholder="Beschreibung" value="${reward.description || ''}" 
                           style="width: 100%; padding: 0.5rem; border: 1px solid #3a3a3a; border-radius: 4px; background: #232526; color: #f3f3f3; box-sizing: border-box;" 
                           onchange="updateRewardFieldDB(${reward.id}, 'description', this.value)" />
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.5rem;">
                    ${typeSpecificFields}
                </div>
            `;
            container.appendChild(rewardDiv);
        });
    });
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
            // Reset save button
            const saveButton = document.querySelector('.btn-success');
            if (saveButton) {
                saveButton.textContent = 'Alle Änderungen speichern';
                saveButton.style.background = '#7ed957';
            }
            // Reload config to reflect changes
            await loadConfig();
        } else {
            showAlert('Fehler beim Speichern der Konfiguration', 'error');
        }
    } catch (error) {
        console.error('Error saving config:', error);
        showAlert('Fehler beim Speichern der Konfiguration', 'error');
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
            const step1 = confirm('⚠️ WARNUNG: Möchten Sie wirklich ALLE Daten unwiderruflich löschen?\n\nDies umfasst:\n- Alle Aufgaben und deren Verlauf\n- Benutzer-EXP und Statistiken\n- Systemkonfigurationen\n- Archivierte Daten\n\nKlicken Sie "OK" um fortzufahren oder "Abbrechen" um abzubrechen.');
            
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
