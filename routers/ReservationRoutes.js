import express from 'express';
import ReservationController from '../controller/ReservationController.js';

const router = express.Router();

// Get all reservations (admin)
router.get('/', ReservationController.getAll);

// Get reservation by ID
router.get('/:id', ReservationController.getById);

// Update reservation
router.put('/:id', ReservationController.update);

// Delete reservation
router.delete('/:id', ReservationController.delete);

export default router;