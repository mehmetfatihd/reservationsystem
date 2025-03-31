// script.js
document.addEventListener('DOMContentLoaded', () => {
    // Get form references (simplified to match server.js)
    const reservationForm = document.getElementById('reservation-form');
    const nameInput = document.getElementById('name');
    const emailInput = document.getElementById('email');
    const dateInput = document.getElementById('date');
    const timeInput = document.getElementById('time');
    const durationInput = document.getElementById('duration');
    const reservationList = document.getElementById('reservation-list');
    const selectedDateDisplay = document.getElementById('selected-date-display');
    const formMessage = document.getElementById('form-message');
    const listMessage = document.getElementById('list-message');

    // Update API URL to match server.js endpoint
    const API_URL = `http://${window.location.host}/reserve`; // Changed to match server.js route

    // --- Helper Functions ---
    const showMessage = (element, message, type = 'error') => {
        element.textContent = message;
        element.className = `message ${type}`;
        setTimeout(() => {
            element.textContent = '';
            element.className = 'message';
        }, 7000);
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'No date selected';
        try {
            const date = new Date(dateString + 'T00:00:00');
            return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        } catch (e) { return dateString; }
    };

    // --- Core Functions ---
    const fetchAndDisplayReservations = async (date) => {
        selectedDateDisplay.textContent = formatDate(date);
        reservationList.innerHTML = '<li>Loading...</li>';
        listMessage.textContent = '';

        if (!date) {
            reservationList.innerHTML = '<li>Please select a date.</li>';
            return;
        }

        try {
            // Note: Your server.js doesn't have a GET endpoint for reservations
            // This is just a placeholder - you'll need to implement this on the backend
            const response = await fetch(`${API_URL}?date=${date}`);
            if (!response.ok) throw new Error(`Server error: ${response.status}`);
            
            const reservations = await response.json();

            reservationList.innerHTML = '';

            if (reservations.length === 0) {
                reservationList.innerHTML = '<li>No reservations found for this date.</li>';
            } else {
                reservations.forEach(res => {
                    const listItem = document.createElement('li');
                    let statusText = res.status.charAt(0).toUpperCase() + res.status.slice(1);
                    let statusStyle = res.status === 'approved' ? 'color: green;' : 
                                    res.status === 'pending' ? 'color: orange;' : 'color: red;';
                    
                    listItem.innerHTML = `
                        ${res.time}| ${res.duration} min | ${res.name}| 
                        <span style="${statusStyle}">${statusText}</span>
                        ${res.approvedBy ? `by ${res.approvedBy}` : ''}
                    `;
                    reservationList.appendChild(listItem);
                });
            }
        } catch (error) {
            console.error('Error fetching reservations:', error);
            showMessage(listMessage, `Note: Reservation listing not fully implemented`, 'info');
            reservationList.innerHTML = '<li>Live reservation display coming soon</li>';
        }
    };

    const handleFormSubmit = async (event) => {
        event.preventDefault();
        formMessage.textContent = '';

        const reservationData = {
            name: nameInput.value.trim(),
            email: emailInput.value.trim(),
            date: dateInput.value,
            time: timeInput.value,
            duration: durationInput.value
        };

        // Basic validation
        if (!reservationData.name || !reservationData.email || !reservationData.date || !reservationData.time) {
            showMessage(formMessage, 'Please fill in all required fields.', 'error');
            return;
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reservationData.email)) {
            showMessage(formMessage, 'Please enter a valid email address.', 'error');
            return;
        }

        // UI feedback
        const submitButton = reservationForm.querySelector('button[type="submit"]');
        const originalButtonText = submitButton.textContent;
        submitButton.disabled = true;
        submitButton.textContent = 'Sending...';

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(reservationData)
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(error || 'Request failed');
            }

            // Success - matches server.js response
            showMessage(formMessage, 
                'Reservation request received! You will receive an email with confirmation details.', 
                'success');
            
            reservationForm.reset();
            dateInput.value = reservationData.date; // Keep date selected
            fetchAndDisplayReservations(reservationData.date);

        } catch (error) {
            console.error('Reservation error:', error);
            showMessage(formMessage, `Error: ${error.message}`, 'error');
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = originalButtonText;
        }
    };

    // --- Event Listeners ---
    dateInput.addEventListener('change', (event) => fetchAndDisplayReservations(event.target.value));
    reservationForm.addEventListener('submit', handleFormSubmit);

    // Initialize
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;
    fetchAndDisplayReservations(today);
});