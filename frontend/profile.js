// Profile Settings JavaScript

let currentUser = null;

// Initialize profile page
window.addEventListener('load', async () => {
    await checkAuth();
    await loadUserProfile();
});

// Check authentication
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
        
        // Set username in nav bar
        document.getElementById('current-username').textContent = currentUser.username;
        
        // Show admin link if user is admin
        if (currentUser.role === 'admin') {
            document.getElementById('admin-link').style.display = 'inline';
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = '/login.html';
    }
}

// Load user profile data
async function loadUserProfile() {
    try {
        // Fill in account information
        document.getElementById('username').value = currentUser.username;
        document.getElementById('role').value = currentUser.role.toUpperCase();
        document.getElementById('email').value = currentUser.email || '';
        document.getElementById('gotify-url').value = currentUser.gotify_url || '';
        document.getElementById('gotify-token').value = currentUser.gotify_token || '';
        
        // Load profile settings
        const settings = currentUser.profile_settings || {};
        document.getElementById('display-name').value = settings.displayName || currentUser.username;
        document.getElementById('notifications-enabled').value = String(settings.notifications !== false);
        
        // Load notification preferences
        const notificationPrefs = currentUser.notification_preferences || {
            content: {
                taskName: true,
                timeWorked: true,
                playerName: true,
                difficulty: false,
                urgency: false,
                dueDate: false,
                taskNote: false,
                commentary: false,
                rating: true,
                expGained: true
            },
            types: {
                taskSubmission: true,
                taskApproval: true,
                taskDecline: true,
                levelUp: true,
                rewardRedeemed: true,
                newTask: false,
                reminders: true
            }
        };
        
        // Load content preferences
        const content = notificationPrefs.content || {};
        document.getElementById('content-task-name').checked = content.taskName !== false;
        document.getElementById('content-time-worked').checked = content.timeWorked !== false;
        document.getElementById('content-player-name').checked = content.playerName !== false;
        document.getElementById('content-difficulty').checked = content.difficulty === true;
        document.getElementById('content-urgency').checked = content.urgency === true;
        document.getElementById('content-due-date').checked = content.dueDate === true;
        document.getElementById('content-task-note').checked = content.taskNote === true;
        document.getElementById('content-commentary').checked = content.commentary === true;
        document.getElementById('content-rating').checked = content.rating !== false;
        document.getElementById('content-exp-gained').checked = content.expGained !== false;
        
        // Load type preferences
        const types = notificationPrefs.types || {};
        document.getElementById('type-task-submission').checked = types.taskSubmission !== false;
        document.getElementById('type-task-approval').checked = types.taskApproval !== false;
        document.getElementById('type-task-decline').checked = types.taskDecline !== false;
        document.getElementById('type-level-up').checked = types.levelUp !== false;
        document.getElementById('type-reward-redeemed').checked = types.rewardRedeemed !== false;
        document.getElementById('type-new-task').checked = types.newTask === true;
        document.getElementById('type-reminders').checked = types.reminders !== false;
        
        // Load reminder settings
        const reminders = notificationPrefs.reminders || {
            enabled: false,
            dailyTime: '08:00',
            dueDateWarning: true,
            dueDateDays: 1,
            frequency: 'once',
            weekdays: {
                monday: true,
                tuesday: true,
                wednesday: true,
                thursday: true,
                friday: true,
                saturday: false,
                sunday: false
            }
        };
        
        document.getElementById('reminders-enabled').checked = reminders.enabled === true;
        document.getElementById('daily-reminder-time').value = reminders.dailyTime || '08:00';
        document.getElementById('due-date-warnings').checked = reminders.dueDateWarning !== false;
        document.getElementById('due-date-days').value = reminders.dueDateDays || 1;
        document.getElementById('reminder-frequency').value = reminders.frequency || 'once';
        
        // Load weekday preferences
        const weekdays = reminders.weekdays || {};
        document.getElementById('remind-monday').checked = weekdays.monday !== false;
        document.getElementById('remind-tuesday').checked = weekdays.tuesday !== false;
        document.getElementById('remind-wednesday').checked = weekdays.wednesday !== false;
        document.getElementById('remind-thursday').checked = weekdays.thursday !== false;
        document.getElementById('remind-friday').checked = weekdays.friday !== false;
        document.getElementById('remind-saturday').checked = weekdays.saturday === true;
        document.getElementById('remind-sunday').checked = weekdays.sunday === true;
        
        // Load privacy/display settings
        const privacy = notificationPrefs.privacy || {};
        document.getElementById('show-other-players-tasks').checked = privacy.showOtherPlayersTasks === true;
        document.getElementById('show-player-stats').checked = privacy.showPlayerStats !== false;
        document.getElementById('show-notification-previews').checked = privacy.showNotificationPreviews !== false;
        
        // Setup conditional display for reminder settings
        toggleReminderSettings();
        toggleDueDateSettings();
        
    } catch (error) {
        console.error('Error loading profile:', error);
        showAlert('Fehler beim Laden der Profildaten', 'error');
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

// Toggle reminder settings visibility
function toggleReminderSettings() {
    const enabled = document.getElementById('reminders-enabled').checked;
    const settings = document.getElementById('daily-reminder-settings');
    settings.style.display = enabled ? 'block' : 'none';
}

// Toggle due date settings visibility
function toggleDueDateSettings() {
    const enabled = document.getElementById('due-date-warnings').checked;
    const settings = document.getElementById('due-date-settings');
    settings.style.display = enabled ? 'block' : 'none';
}

// Password strength checker
function checkPasswordStrength(password) {
    const strengthEl = document.getElementById('password-strength');
    let strength = 0;
    let message = '';
    
    if (password.length >= 8) strength++;
    if (/[a-z]/.test(password)) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;
    
    if (strength < 3) {
        message = 'Weak - Use longer password with mixed case, numbers, and symbols';
        strengthEl.className = 'password-strength strength-weak';
    } else if (strength < 5) {
        message = 'Medium - Consider adding more character types';
        strengthEl.className = 'password-strength strength-medium';
    } else {
        message = 'Strong - Good password!';
        strengthEl.className = 'password-strength strength-strong';
    }
    
    strengthEl.textContent = message;
}

// Handle profile form submission
document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const profile_settings = {
        displayName: document.getElementById('display-name').value,
        notifications: document.getElementById('notifications-enabled').value === 'true'
    };
    
    try {
        const response = await fetch('/api/auth/profile', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                profile_settings,
                gotify_url: '', // Keep existing values
                gotify_token: '' // Keep existing values
            })
        });
        
        if (response.ok) {
            showAlert('Profil erfolgreich aktualisiert');
            // Update current user data
            currentUser.profile_settings = profile_settings;
        } else {
            const data = await response.json();
            showAlert(data.error || 'Fehler beim Aktualisieren des Profils', 'error');
        }
    } catch (error) {
        console.error('Error updating profile:', error);
        showAlert('Error updating profile', 'error');
    }
});

// Handle password form submission
document.getElementById('password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    
    if (newPassword !== confirmPassword) {
        showAlert('New passwords do not match', 'error');
        return;
    }
    
    if (newPassword.length < 6) {
        showAlert('New password must be at least 6 characters long', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/auth/password', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                currentPassword,
                newPassword
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showAlert('Password changed successfully');
            // Clear form
            document.getElementById('password-form').reset();
            document.getElementById('password-strength').textContent = '';
        } else {
            showAlert(data.error || 'Failed to change password', 'error');
        }
    } catch (error) {
        console.error('Error changing password:', error);
        showAlert('Error changing password', 'error');
    }
});

// Helper function to show Gotify-specific messages
function showGotifyMessage(message, type = 'success') {
    const messagesDiv = document.getElementById('gotify-messages');
    messagesDiv.innerHTML = '';
    
    const messageElement = document.createElement('div');
    messageElement.className = `alert ${type === 'error' ? 'alert-error' : 'alert-success'}`;
    messageElement.style.padding = '0.75rem';
    messageElement.style.borderRadius = '4px';
    messageElement.style.marginTop = '0.5rem';
    
    if (type === 'error') {
        messageElement.style.backgroundColor = '#fee';
        messageElement.style.color = '#c33';
        messageElement.style.border = '1px solid #fcc';
    } else {
        messageElement.style.backgroundColor = '#efe';
        messageElement.style.color = '#363';
        messageElement.style.border = '1px solid #cfc';
    }
    
    messageElement.textContent = message;
    messagesDiv.appendChild(messageElement);
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        messageElement.remove();
    }, 5000);
}

// Handle Gotify form submission
document.getElementById('gotify-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const gotify_url = document.getElementById('gotify-url').value.trim();
    const gotify_token = document.getElementById('gotify-token').value.trim();
    
    // Validate URL doesn't end with /message
    if (gotify_url.endsWith('/message')) {
        showGotifyMessage('❌ Fehler: URL darf nicht mit "/message" enden! Bitte nur die Basis-URL eingeben.', 'error');
        return;
    }
    
    if (!gotify_url || !gotify_token) {
        showGotifyMessage('❌ Bitte füllen Sie beide Felder aus.', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/auth/profile', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                gotify_url,
                gotify_token,
                profile_settings: currentUser.profile_settings
            })
        });
        
        if (response.ok) {
            showGotifyMessage('✅ Gotify-Einstellungen erfolgreich aktualisiert!');
            // Update current user data
            currentUser.gotify_url = gotify_url;
            currentUser.gotify_token = gotify_token;
        } else {
            const data = await response.json();
            showGotifyMessage(`❌ Fehler: ${data.error || 'Einstellungen konnten nicht aktualisiert werden'}`, 'error');
        }
    } catch (error) {
        console.error('Error updating notification settings:', error);
        showGotifyMessage('❌ Netzwerkfehler beim Aktualisieren der Einstellungen', 'error');
    }
});

// Handle notification preferences form submission
document.getElementById('notification-preferences-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const notification_preferences = {
        content: {
            taskName: document.getElementById('content-task-name').checked,
            timeWorked: document.getElementById('content-time-worked').checked,
            playerName: document.getElementById('content-player-name').checked,
            difficulty: document.getElementById('content-difficulty').checked,
            urgency: document.getElementById('content-urgency').checked,
            dueDate: document.getElementById('content-due-date').checked,
            taskNote: document.getElementById('content-task-note').checked,
            commentary: document.getElementById('content-commentary').checked,
            rating: document.getElementById('content-rating').checked,
            expGained: document.getElementById('content-exp-gained').checked
        },
        types: {
            taskSubmission: document.getElementById('type-task-submission').checked,
            taskApproval: document.getElementById('type-task-approval').checked,
            taskDecline: document.getElementById('type-task-decline').checked,
            levelUp: document.getElementById('type-level-up').checked,
            rewardRedeemed: document.getElementById('type-reward-redeemed').checked,
            newTask: document.getElementById('type-new-task').checked,
            reminders: document.getElementById('type-reminders').checked
        },
        reminders: {
            enabled: document.getElementById('reminders-enabled').checked,
            dailyTime: document.getElementById('daily-reminder-time').value,
            dueDateWarning: document.getElementById('due-date-warnings').checked,
            dueDateDays: parseInt(document.getElementById('due-date-days').value),
            frequency: document.getElementById('reminder-frequency').value,
            weekdays: {
                monday: document.getElementById('remind-monday').checked,
                tuesday: document.getElementById('remind-tuesday').checked,
                wednesday: document.getElementById('remind-wednesday').checked,
                thursday: document.getElementById('remind-thursday').checked,
                friday: document.getElementById('remind-friday').checked,
                saturday: document.getElementById('remind-saturday').checked,
                sunday: document.getElementById('remind-sunday').checked
            }
        },
        privacy: {
            showOtherPlayersTasks: document.getElementById('show-other-players-tasks').checked,
            showPlayerStats: document.getElementById('show-player-stats').checked,
            showNotificationPreviews: document.getElementById('show-notification-previews').checked
        }
    };
    
    try {
        const response = await fetch('/api/auth/profile', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                gotify_url: currentUser.gotify_url,
                gotify_token: currentUser.gotify_token,
                profile_settings: currentUser.profile_settings,
                notification_preferences
            })
        });
        
        if (response.ok) {
            showAlert('Benachrichtigungs-Einstellungen erfolgreich aktualisiert');
            currentUser.notification_preferences = notification_preferences;
        } else {
            const data = await response.json();
            showAlert(data.error || 'Benachrichtigungs-Einstellungen konnten nicht aktualisiert werden', 'error');
        }
    } catch (error) {
        console.error('Error updating notification preferences:', error);
        showAlert('Fehler beim Aktualisieren der Benachrichtigungs-Einstellungen', 'error');
    }
});

// Handle test notification button
document.getElementById('test-notification').addEventListener('click', async (e) => {
    e.preventDefault();
    
    const button = e.target;
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Wird gesendet...';
    
    // Clear any previous messages
    document.getElementById('gotify-messages').innerHTML = '';
    
    try {
        // Get current form values (not saved preferences)
        const currentContentPrefs = {
            taskName: document.getElementById('content-task-name').checked,
            timeWorked: document.getElementById('content-time-worked').checked,
            playerName: document.getElementById('content-player-name').checked,
            difficulty: document.getElementById('content-difficulty').checked,
            urgency: document.getElementById('content-urgency').checked,
            dueDate: document.getElementById('content-due-date').checked,
            taskNote: document.getElementById('content-task-note').checked,
            commentary: document.getElementById('content-commentary').checked,
            rating: document.getElementById('content-rating').checked,
            expGained: document.getElementById('content-exp-gained').checked
        };
        
        const response = await fetch('/api/auth/test-notification', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                message: 'TaskQuest Test-Benachrichtigung',
                contentPreferences: currentContentPrefs
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showGotifyMessage('✅ Test-Benachrichtigung erfolgreich gesendet! Prüfen Sie Ihr Telefon.');
        } else {
            if (data.error && data.error.includes('not configured')) {
                showGotifyMessage('❌ Gotify nicht konfiguriert. Bitte geben Sie zuerst URL und Token ein.', 'error');
            } else if (data.error && data.error.includes('404')) {
                showGotifyMessage('❌ Fehler 404: Überprüfen Sie die Gotify-URL. Verwenden Sie NICHT "/message" am Ende!', 'error');
            } else {
                showGotifyMessage(`❌ Fehler beim Senden der Test-Benachrichtigung: ${data.error || 'Unbekannter Fehler'}`, 'error');
            }
        }
    } catch (error) {
        console.error('Error sending test notification:', error);
        showGotifyMessage('❌ Netzwerkfehler beim Senden der Test-Benachrichtigung', 'error');
    } finally {
        button.disabled = false;
        button.textContent = originalText;
    }
});

// Handle preferences form submission
document.getElementById('preferences-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const profile_settings = {
        ...currentUser.profile_settings,
        notifications: document.getElementById('notifications-enabled').value === 'true'
    };
    
    try {
        const response = await fetch('/api/auth/profile', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                profile_settings,
                gotify_url: currentUser.gotify_url,
                gotify_token: currentUser.gotify_token
            })
        });
        
        if (response.ok) {
            showAlert('Preferences updated successfully');
            // Update current user data
            currentUser.profile_settings = profile_settings;
        } else {
            const data = await response.json();
            showAlert(data.error || 'Failed to update preferences', 'error');
        }
    } catch (error) {
        console.error('Error updating preferences:', error);
        showAlert('Error updating preferences', 'error');
    }
});

// Password strength checking on input
document.getElementById('new-password').addEventListener('input', (e) => {
    checkPasswordStrength(e.target.value);
});

// Logout function
async function logout() {
    try {
        const response = await fetch('/api/auth/logout', {
            method: 'POST',
            credentials: 'include'
        });
        
        if (response.ok) {
            localStorage.removeItem('taskquest_user');
            window.location.href = '/login.html';
        } else {
            showAlert('Logout failed', 'error');
        }
    } catch (error) {
        console.error('Logout error:', error);
        showAlert('Logout error', 'error');
    }
}

// Make logout function globally available
window.logout = logout;
