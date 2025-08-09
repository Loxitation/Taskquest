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
        document.getElementById('theme').value = settings.theme || 'default';
        document.getElementById('notifications-enabled').value = String(settings.notifications !== false);
        
    } catch (error) {
        console.error('Error loading profile:', error);
        showAlert('Error loading profile data', 'error');
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
        theme: document.getElementById('theme').value,
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
            showAlert('Profile updated successfully');
            // Update current user data
            currentUser.profile_settings = profile_settings;
        } else {
            const data = await response.json();
            showAlert(data.error || 'Failed to update profile', 'error');
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

// Handle Gotify form submission
document.getElementById('gotify-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const gotify_url = document.getElementById('gotify-url').value;
    const gotify_token = document.getElementById('gotify-token').value;
    
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
            showAlert('Notification settings updated successfully');
            // Update current user data
            currentUser.gotify_url = gotify_url;
            currentUser.gotify_token = gotify_token;
        } else {
            const data = await response.json();
            showAlert(data.error || 'Failed to update notification settings', 'error');
        }
    } catch (error) {
        console.error('Error updating notification settings:', error);
        showAlert('Error updating notification settings', 'error');
    }
});

// Handle preferences form submission
document.getElementById('preferences-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const profile_settings = {
        ...currentUser.profile_settings,
        theme: document.getElementById('theme').value,
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
