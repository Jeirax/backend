const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Get all tasks
app.get('/api/tasks', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM v_taches_detaillees');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all persons with their skills
app.get('/api/persons', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM v_competences_personnes');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Assign a task to a person
app.post('/api/assign-task', async (req, res) => {
  const { personId, taskId } = req.body;
  try {
    await pool.query('CALL assigner_tache(?, ?)', [personId, taskId]);
    res.json({ message: 'Task assigned successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update remaining time for a task
app.post('/api/update-time', async (req, res) => {
  const { personId, taskId, timeSpent } = req.body;
  try {
    await pool.query('CALL update_temps_restant(?, ?, ?)', [personId, taskId, timeSpent]);
    res.json({ message: 'Time updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// const PORT = process.env.PORT || 3000;
// app.listen(PORT, () => {
//   console.log(`Server running on port ${PORT}`);
// });

const PORT = process.env.PORT || 5000;
// const HOST = '192.168.88.92';
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});
