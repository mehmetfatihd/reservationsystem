// server.js
require('dotenv').config(); // Load variables from .env file
const express = require('express');
const nodemailer = require('nodemailer'); // Use Nodemailer library
const path = require('path');
const db = require('./database'); // Use database.js module

const app = express();
const port = 3000;

// Admin email addresses (replace with real addresses)
const adminEmails = JSON.parse(process.env.EMAILS);

// Middleware
app.use(express.json()); // Parse incoming JSON data
app.use(express.urlencoded({ extended: true })); // Parse incoming form data
app.use(express.static(path.join(__dirname, 'public'))); // Serve public folder statically

// Homepage route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/reserve', async (req, res) => {
    const requestedDate = req.query.date; // URL'den ?date=... parametresini al

    if (!requestedDate) {
        return res.status(400).json({ error: 'Date query parameter is required.' });
    }

    // Tarih formatını doğrula (isteğe bağlı ama önerilir)
    // Örneğin: YYYY-MM-DD formatı kontrolü
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(requestedDate)) {
        return res.status(400).json({ error: 'Invalid date format. Please use YYYY-MM-DD.' });
    }

    try {
        console.log(`Workspaceing reservations for date: ${requestedDate}`);
        // Yeni eklenen veritabanı fonksiyonunu çağır
        const reservations = await db.findReservationsByDate(requestedDate);
        console.log(`Found ${reservations.length} reservations for ${requestedDate}`);
        res.status(200).json(reservations); // Rezervasyonları JSON formatında gönder
    } catch (error) {
        console.error(`Error fetching reservations for date ${requestedDate}:`, error);
        res.status(500).json({
            error: 'An error occurred while fetching reservations.',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

app.post('/reserve', async (req, res) => {
    const { name, email, date, time, duration } = req.body;

    // Enhanced validation
    if (!name || !email || !date || !time) {
        return res.status(400).json({ error: 'All fields are required.' });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    try {
        // Create new reservation object
        const newReservation = {
            name,
            email,
            date,
            time,
            duration,
            status: 'pending',
            requestedAt: new Date().toISOString()
        };

        // Add reservation to database (now using async/await)
        const addedReservation = await db.addReservation(newReservation);
        console.log('New reservation request added:', addedReservation);

        const reservationId = addedReservation.id;
        const baseUrl = process.env.BASE_URL || `http://192.168.31.30:${port}`;
        const fromEmail = process.env.GMAIL_USER; // Use Gmail username from .env
        const gmailPassword = process.env.GMAIL_PASS; // Use Gmail password from .env

        // Nodemailer transporter setup
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: fromEmail,
                pass: gmailPassword
            }
        });

        // Send emails to all admins (parallel processing)
        const emailPromises = adminEmails.map(async (adminEmail) => {
            const approveLink = `${baseUrl}/approve/${reservationId}/${encodeURIComponent(adminEmail)}`;
            const rejectLink = `${baseUrl}/reject/${reservationId}`;

            const mailOptionsAdmin = {
                to: adminEmail,
                from: fromEmail,
                subject: `New Billiard Reservation Request: ${date} ${time}`,
                text: `A new reservation request has been received:\n\n` +
                    `Reservation ID: ${reservationId}\n` +
                    `Name: ${name}\n` +
                    `Email: ${email}\n` +
                    `Date: ${date}\n` +
                    `Time: ${time}\n\n` +
                    `Duration: ${duration}\n\n` +
                    `Approve: ${approveLink}\n` +
                    `Reject: ${rejectLink}`,
                html: `<p>A new reservation request has been received:</p>
                    <ul>
                      <li><strong>Reservation ID:</strong> ${reservationId}</li>
                      <li><strong>Name:</strong> ${name}</li>
                      <li><strong>Email:</strong> ${email}</li>
                      <li><strong>Date:</strong> ${date}</li>
                      <li><strong>Time:</strong> ${time}</li>
                      <li><strong>Duration:</strong> ${duration}</li>
                    </ul>
                    <p><a href="${approveLink}" style="color: green;">APPROVE</a> | 
                      <a href="${rejectLink}" style="color: red;">REJECT</a></p>`
            };

            try {
                await transporter.sendMail(mailOptionsAdmin);
                console.log(`Email sent to ${adminEmail}`);
                return { success: true, email: adminEmail };
            } catch (error) {
                console.error(`Error sending to ${adminEmail}:`, error);
                return { success: false, email: adminEmail, error: error.message };
            }
        });

        // Wait for all emails to complete (but don't fail the request if some fail)
        await Promise.all(emailPromises);

        // Successful response
        res.status(200).json({
            message: 'Reservation request received. Approval pending.',
            reservationId: reservationId,
            note: 'You will receive a confirmation email once approved.'
        });

    } catch (error) {
        console.error('Reservation error:', error);
        res.status(500).json({
            error: 'An error occurred while processing your reservation',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

app.get('/approve/:reservationId/:adminEmail', async (req, res) => {
    const { reservationId, adminEmail } = req.params;
    const emailMapping = JSON.parse(process.env.EMAIL_MAPPING);
    const approvedEmail = decodeURIComponent(adminEmail);
    const decodedAdminEmail = emailMapping[approvedEmail];
    const fromEmail = process.env.GMAIL_USER; // Use Gmail username from .env

    console.log(`Approval attempt for ID: ${reservationId} by ${decodedAdminEmail}`);

    try {
        // 1. Validate admin email
        if (!adminEmails.includes(approvedEmail)) {
            console.error(`Unauthorized approval attempt by: ${approvedEmail}`);
            return res.status(403).send('Error: Unauthorized approval attempt.');
        }

        // 2. Find reservation (using await)
        const reservation = await db.findReservationById(reservationId);
        if (!reservation) {
            console.error(`Reservation not found: ${reservationId}`);
            return res.status(404).send('Error: Reservation not found.');
        }

        // 3. Status validation
        if (reservation.status === 'approved') {
            const message = `Reservation already approved by ${reservation.approvedBy}`;
            console.log(message);
            return res.status(400).send(message);
        }

        if (reservation.status === 'rejected') {
            console.log(`Cannot approve rejected reservation: ${reservationId}`);
            return res.status(400).send('Error: Cannot approve a rejected reservation.');
        }

        if (reservation.status !== 'pending') {
            console.log(`Invalid status for approval: ${reservation.status}`);
            return res.status(400).send(`Error: Current status (${reservation.status}) cannot be approved.`);
        }

        // 4. Update reservation
        const updates = {
            status: 'approved',
            approvedBy: decodedAdminEmail,
            approvedAt: new Date().toISOString()
        };

        const updatedReservation = await db.updateReservation(reservationId, updates);
        if (!updatedReservation) {
            throw new Error('Failed to update reservation');
        }

        console.log('Reservation approved:', updatedReservation);

        // 5. Send confirmation email

        // Nodemailer transporter setup
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: fromEmail,
                pass: process.env.GMAIL_PASS // Use Gmail password from .env
            }
        });

        const mailOptionsUser = {
            to: updatedReservation.email,
            from: fromEmail,
            subject: 'Your Billiard Reservation Has Been Approved!',
            text: `Hello ${updatedReservation.name},\n\n` +
                `Your reservation for ${updatedReservation.date} at ${updatedReservation.time} has been approved.\n\n` +
                `Approved by: ${decodedAdminEmail}\n` +
                `Reservation ID: ${reservationId}\n\n` +
                `Have a great game!`,
            html: `<div style="font-family: Arial, sans-serif; max-width: 600px;">
                    <h2 style="color: #2ecc71;">Reservation Approved!</h2>
                    <p>Hello ${updatedReservation.name},</p>
                    <p>Your reservation for <strong>${updatedReservation.date}</strong> at <strong>${updatedReservation.time}</strong> has been approved.</p>
                    <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0;">
                      <p><strong>Approved by:</strong> ${decodedAdminEmail}</p>
                      <p><strong>Reservation ID:</strong> ${reservationId}</p>
                    </div>
                    <p>Have a great game!</p>
                    <p style="color: #7f8c8d; font-size: 0.9em;">If you have any questions, please reply to this email.</p>
                  </div>`
        };

        await transporter.sendMail(mailOptionsUser);
        console.log(`Confirmation sent to ${updatedReservation.email}`);

        // 6. Success response
        res.send(`
          <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2ecc71;">Reservation Approved</h2>
            <p>Reservation ID: <strong>${reservationId}</strong></p>
            <p>User: <strong>${updatedReservation.name} (${updatedReservation.email})</strong></p>
            <p>Date/Time: <strong>${updatedReservation.date} at ${updatedReservation.time}</strong></p>
            <p style="color: #27ae60;">The user has been notified via email.</p>
            <p><a href="/" style="color: #3498db;">Return to dashboard</a></p>
          </div>
        `);

    } catch (error) {
        console.error('Approval process error:', error);

        const errorMessage = `
          <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; color: #e74c3c;">
            <h2>Approval Error</h2>
            <p>${error.message || 'An error occurred during approval'}</p>
            <p>Reservation ID: ${reservationId}</p>
            <p>Please try again or contact support.</p>
          </div>
        `;

        res.status(500).send(errorMessage);
    }
});

// server.js içindeki /reject endpoint'ini şu şekilde güncelleyin:
app.get('/reject/:reservationId', async (req, res) => { // async ekleyin
    const { reservationId } = req.params;

    console.log(`Rejection attempt for ID: ${reservationId}`);

    try { // try...catch bloğu ekleyin
        const reservation = await db.findReservationById(reservationId); // await ekleyin

        if (!reservation) {
            console.error(`Rejection failed: Reservation ID ${reservationId} not found.`);
            return res.status(404).send('Error: Reservation not found.');
        }

        // Status checks (bu kısımlar doğru görünüyor)
        if (reservation.status === 'rejected') {
            console.log(`Rejection ignored: Reservation ID ${reservationId} already rejected.`);
            return res.status(400).send('This reservation was already rejected.');
        }
        if (reservation.status === 'approved') {
            console.log(`Rejection failed: Reservation ID ${reservationId} was approved by ${reservation.approvedBy}.`);
            return res.status(400).send(`This reservation was previously approved by ${reservation.approvedBy}. Cannot be rejected.`);
        }
        if (reservation.status !== 'pending') {
            console.log(`Rejection failed: Reservation ID ${reservationId} has status ${reservation.status}.`);
            return res.status(400).send(`This reservation's status (${reservation.status}) is not suitable for rejection.`);
        }

        // Update reservation status
        const updatedReservation = await db.updateReservation(reservationId, { // await ekleyin
            status: 'rejected',
            rejectedAt: new Date().toISOString()
        });

        // updateReservation artık güncellenmiş objeyi döndürüyor, tekrar bulmaya gerek yok
        // if (!updatedReservation) { // Bu kontrol artık gereksiz olabilir, updateReservation hata fırlatır
        //     console.error(`Rejection failed: Could not update reservation ID ${reservationId}.`);
        //     return res.status(500).send('A server error occurred while updating the reservation.');
        // }

        console.log('Reservation rejected:', updatedReservation);

        // Daha bilgilendirici bir yanıt gönderelim
        res.send(`
          <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #e74c3c;">Reservation Rejected</h2>
            <p>Reservation ID: <strong>${reservationId}</strong></p>
            <p>User: <strong>${updatedReservation.name} (${updatedReservation.email})</strong></p><p>Date/Time:<strong>${updatedReservation.date} at ${updatedReservation.time}</strong></p>
            <p style="color: #c0392b;">The reservation has been marked as rejected.</p>
            <p><a href="/" style="color: #3498db;">Return to dashboard</a></p>
          </div>
        `);

    } catch (error) { // Hata yakalama ekleyin
        console.error(`Rejection process error for ID ${reservationId}:`, error);
        res.status(500).send(`
          <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; color: #e74c3c;">
            <h2>Rejection Error</h2>
            <p>${error.message || 'An error occurred during rejection'}</p>
            <p>Reservation ID: ${reservationId}</p>
            <p>Please try again or contact support.</p>
          </div>
        `);
    }
});
// Start server
app.listen(port, () => {
    console.log(`Billiard reservation server listening at http://localhost:${port}`);
    console.log('Gmail User configured:', process.env.GMAIL_USER ? 'Yes' : 'No! Check .env');
    console.log('Admin emails:', adminEmails);
});