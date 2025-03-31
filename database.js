// database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database file path
const DB_PATH = path.join(__dirname, 'reservations.db');

// Connect to SQLite database (creates file if doesn't exist)
const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
        console.error('Database connection error:', err.message);
        process.exit(1); // Exit if we can't connect to DB
    } else {
        console.log('Connected to the SQLite database.');
        initializeDatabase();
    }
});

// Initialize database structure
function initializeDatabase() {
    db.run(`
        CREATE TABLE IF NOT EXISTS reservations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            duration TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            requestedAt TEXT NOT NULL,
            approvedBy TEXT,
            approvedAt TEXT,
            rejectedAt TEXT
        )
    `, (err) => {
        if (err) {
            console.error('Error creating table:', err.message);
        } else {
            console.log('Reservations table ready');
        }
    });
}

// Database operations
const database = {
    // Add new reservation
    addReservation: (reservation) => {
        return new Promise((resolve, reject) => {
            const sql = `
                INSERT INTO reservations (name, email, date, time, duration, status, requestedAt)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `;
            const params = [
                reservation.name,
                reservation.email,
                reservation.date,
                reservation.time,
                reservation.duration,
                reservation.status || 'pending',
                reservation.requestedAt || new Date().toISOString()
            ];

            db.run(sql, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ ...reservation, id: this.lastID });
                }
            });
        });
    },

    // Find reservation by ID
    findReservationById: (id) => {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM reservations WHERE id = ?', [id], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row || null);
                }
            });
        });
    },
// database.js içine ekleyin (mevcut fonksiyonların arasına)

// Find reservations by date
    findReservationsByDate: (date) => {
        return new Promise((resolve, reject) => {
            // ORDER BY time ASC ekleyerek zamanına göre sıralı getirelim
            const sql = 'SELECT id, name, email, date, time, duration, status, approvedBy FROM reservations WHERE date = ? ORDER BY time ASC';
            db.all(sql, [date], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows || []); // Hata yoksa boş dizi döndür
                }
            });
        });
    },

    // Update reservation
    updateReservation: (id, updates) => {
        return new Promise((resolve, reject) => {
            // Build dynamic update query
            const fields = [];
            const values = [];
            
            for (const [key, value] of Object.entries(updates)) {
                fields.push(`${key} = ?`);
                values.push(value);
            }
            
            if (fields.length === 0) {
                reject(new Error('No fields to update'));
                return;
            }

            values.push(id); // Add ID for WHERE clause
            
            const sql = `
                UPDATE reservations 
                SET ${fields.join(', ')} 
                WHERE id = ?
            `;

            db.run(sql, values, function(err) {
                if (err) {
                    reject(err);
                } else if (this.changes === 0) {
                    reject(new Error('Reservation not found'));
                } else {
                    database.findReservationById(id).then(resolve).catch(reject);
                }
            });
        });
    },

    // Get all reservations (for debugging)
    getAllReservations: () => {
        return new Promise((resolve, reject) => {
            db.all('SELECT * FROM reservations', (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },

    // Close database connection
    close: () => {
        return new Promise((resolve, reject) => {
            db.close((err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }
};

module.exports = database;