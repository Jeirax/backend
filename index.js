const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Database connection
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Middleware for database connection error handling
app.use(async (req, res, next) => {
  req.db = await pool.getConnection();
  req.db.release();
  next();
});

// Validation middleware
const validateRegister = [
  body('email').isEmail().withMessage('Email invalide'),
  body('password').isLength({ min: 6 }).withMessage('Le mot de passe doit contenir au moins 6 caractères'),
  body('nom').isLength({ min: 3 }).withMessage('Le nom d\'utilisateur doit contenir au moins 3 caractères'),
  body('prenom').isLength({ min: 3 }).withMessage('Le prénom d\'utilisateur doit contenir au moins 3 caractères'),
];

const validateLogin = [
  body('email').isEmail().withMessage('Email invalide'),
  body('password').exists().withMessage('Mot de passe requis')
];

const validateAssignTask = [
  body('personId').isInt(),
  body('taskId').isInt()
];

const validateUpdateTime = [
  body('personId').isInt(),
  body('taskId').isInt(),
  body('timeSpent').isFloat({ min: 0 })
];

// JWT middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Error handling middleware
const handleErrors = (err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Une erreur interne du serveur s\'est produite' });
};

// Routes
app.post('/api/register', validateRegister, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password, nom, prenom } = req.body;

  try {
    const [existingUser] = await pool.query('SELECT * FROM personne WHERE email = ?', [email]);
    if (existingUser.length > 0) {
      return res.status(400).json({ error: 'Cet email est déjà utilisé' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query('INSERT INTO personne (nom, email, password, prenom) VALUES (?, ?, ?,?)', [nom, email, hashedPassword, prenom]);
    
    res.status(201).json({ message: 'Utilisateur enregistré avec succès' });
  } catch (error) {
    next(error);
  }
});
app.post('/api/login', validateLogin, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password } = req.body;

  try {
    const [personnes] = await pool.query('SELECT * FROM personne WHERE email = ?', [email]);
    if (personnes.length === 0) {
      return res.status(400).json({ error: 'Email incorrect' });
    }

    const personne = personnes[0];
    const validPassword = await bcrypt.compare(password, personne.password);
    if (!validPassword) {
      return res.status(400).json({ error: ' mot de passe incorrect' });
    }

    const token = jwt.sign({ id: personne.id_P, email: personne.email }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token, user: { id: personne.id_P, nom:personne.nom, prenom: personne.prenom, email: personne.email } });
  } catch (error) {
    next(error);
  }
});

app.get('/api/tasks', authenticateToken, async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM v_taches_detaillees');
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.get('/api/persons', authenticateToken, async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM v_competences_personnes');
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.post('/api/assign-task', authenticateToken, validateAssignTask, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { personId, taskId } = req.body;
  try {
    await pool.query('CALL assigner_tache(?, ?)', [personId, taskId]);
    res.json({ message: 'Tâche assignée avec succès' });
  } catch (error) {
    next(error);
  }
});

app.post('/api/update-time', authenticateToken, validateUpdateTime, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { personId, taskId, timeSpent } = req.body;
  try {
    await pool.query('CALL update_temps_restant(?, ?, ?)', [personId, taskId, timeSpent]);
    res.json({ message: 'Temps mis à jour avec succès' });
  } catch (error) {
    next(error);
  }
});

// Error handling middleware
app.use(handleErrors);

const PORT = process.env.PORT || 5000;
const HOST = 'localhost';

app.listen(PORT, HOST, () => {
  console.log(`Serveur en cours d'exécution sur http://${HOST}:${PORT}`);
});