import Transaction from '../models/TransactionModel.js';
import Reservation from '../models/ReservationModel.js';
import db from '../config/db.js';

const generateTransactionRef = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `TXN-${year}${month}${day}-${random}`;
};

// ✅ ADD THIS FUNCTION: Convert datetime-local to MySQL format
const formatForMySQL = (datetimeString) => {
    if (!datetimeString) return null;
    // Convert "2024-12-25T14:30" to "2024-12-25 14:30:00"
    return datetimeString.replace('T', ' ') + ':00';
};

const TransactionController = {
    // Create new transaction with file upload
    async create(req, res) {
    let connection;
    
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();

        console.log('📦 Request body:', req.body);
        console.log('📄 Uploaded file:', req.file);
        console.log('👤 User from auth:', req.user); // Check if user data is available

        // Parse cart from JSON string
        const cart = typeof req.body.cart === 'string' 
            ? JSON.parse(req.body.cart) 
            : req.body.cart;

        const {
            fullName,
            contactNumber,
            address,
            checkInDate,
            checkOutDate
        } = req.body;

        // ✅ GET USER ID FROM AUTH MIDDLEWARE
        const user_id = req.user ? req.user.id : null;

        // ✅ FIX: Convert datetime-local format to MySQL datetime format
        const mysqlCheckInDate = formatForMySQL(checkInDate);
        const mysqlCheckOutDate = formatForMySQL(checkOutDate);

        console.log('🕒 Original checkInDate:', checkInDate);
        console.log('🕒 MySQL format checkInDate:', mysqlCheckInDate);
        console.log('🕒 Original checkOutDate:', checkOutDate);
        console.log('🕒 MySQL format checkOutDate:', mysqlCheckOutDate);
        console.log('👤 User ID for transaction:', user_id);

        // Validate required fields
        if (!fullName || !contactNumber || !address || !checkInDate || !checkOutDate) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        if (!cart || cart.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Cart cannot be empty'
            });
        }

        // Calculate totals
        const total_amount = cart.reduce((total, item) => 
            total + (parseFloat(item.amenity_price) * parseInt(item.quantity)), 0);
        const downpayment = total_amount * 0.2;
        const balance = total_amount - downpayment;
        const transaction_ref = generateTransactionRef();

        // Get filename if file was uploaded
        const proof_of_payment = req.file ? req.file.filename : null;

        // ✅ UPDATE: Create transaction WITH user_id
        const transactionId = await Transaction.create({
            transaction_ref,
            customer_name: fullName,
            contact_number: contactNumber,
            customer_address: address,
            total_amount,
            downpayment,
            balance,
            proof_of_payment,
            user_id: user_id // ✅ ADD USER ID HERE
        });

        // Create reservations - ✅ USE THE FORMATTED DATES
        const reservationsData = cart.map(item => ({
            transaction_id: transactionId,
            amenity_name: item.amenity_name,
            quantity: item.quantity,
            price: item.amenity_price,
            check_in_date: mysqlCheckInDate,      // Use formatted date with time
            check_out_date: mysqlCheckOutDate     // Use formatted date with time
        }));

        await Reservation.createMultiple(reservationsData);
        await connection.commit();
        
        res.status(201).json({
            success: true,
            message: 'Transaction created successfully',
            transaction_ref: transaction_ref,
            transaction_id: transactionId,
            total_amount: total_amount,
            downpayment: downpayment
        });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Transaction creation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create transaction',
            error: error.message
        });
    } finally {
        if (connection) connection.release();
    }
},

    // Other methods remain the same...
    async getAll(req, res) {
        try {
            const results = await Transaction.getAllWithReservations();
            const formattedResults = results.map(row => ({
                ...row,
                reservations: row.reservations_json ? JSON.parse(`[${row.reservations_json}]`) : []
            }));

            res.json({
                success: true,
                data: formattedResults
            });

        } catch (error) {
            console.error('Get all transactions error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch transactions',
                error: error.message
            });
        }
    },

    async getByRef(req, res) {
        try {
            const { transaction_ref } = req.params;
            const transaction = await Transaction.findByRef(transaction_ref);

            if (!transaction) {
                return res.status(404).json({
                    success: false,
                    message: 'Transaction not found'
                });
            }

            const reservations = await Reservation.findByTransactionId(transaction.id);
            const transactionWithReservations = {
                ...transaction,
                reservations
            };

            res.json({
                success: true,
                data: transactionWithReservations
            });

        } catch (error) {
            console.error('Get transaction by ref error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch transaction',
                error: error.message
            });
        }
    },

    async getByCustomer(req, res) {
    try {
        const { customer_name, contact_number } = req.query;
        
        if (!customer_name || !contact_number) {
            return res.status(400).json({
                success: false,
                message: 'Customer name and contact number are required'
            });
        }

        // Add validation to ensure exact matching
        const transactions = await Transaction.findByCustomer(
            customer_name.trim(), 
            contact_number.trim()
        );

        console.log('🔍 Search params:', { customer_name, contact_number });
        console.log('📊 Found transactions:', transactions.length);

        const transactionsWithReservations = await Promise.all(
            transactions.map(async (transaction) => {
                const reservations = await Reservation.findByTransactionId(transaction.id);
                return {
                    ...transaction,
                    reservations
                };
            })
        );

        res.json({
            success: true,
            data: transactionsWithReservations
        });

    } catch (error) {
        console.error('Get transactions by customer error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch transactions',
            error: error.message
        });
    }
},

    async updateStatus(req, res) {
        let connection;
        
        try {
            connection = await db.getConnection();
            await connection.beginTransaction();
            
            const { transaction_id } = req.params;
            const { booking_status } = req.body;

            const validStatuses = ['Pending', 'Confirmed', 'Cancelled', 'Completed'];
            if (!validStatuses.includes(booking_status)) {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Invalid status. Must be: Pending, Confirmed, Cancelled, or Completed'
                });
            }

            const transaction = await Transaction.findById(transaction_id);
            if (!transaction) {
                await connection.rollback();
                return res.status(404).json({
                    success: false,
                    message: 'Transaction not found'
                });
            }

            await Transaction.updateStatus(transaction_id, booking_status);
            await Reservation.updateStatusByTransaction(transaction_id, booking_status);
            await connection.commit();

            res.json({
                success: true,
                message: `Transaction ${booking_status.toLowerCase()} successfully`
            });

        } catch (error) {
            if (connection) await connection.rollback();
            console.error('Update transaction status error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update transaction status',
                error: error.message
            });
        } finally {
            if (connection) connection.release();
        }
    },

    async cancel(req, res) {
        let connection;
        
        try {
            connection = await db.getConnection();
            await connection.beginTransaction();
            
            const { transaction_id } = req.params;
            const transaction = await Transaction.findById(transaction_id);

            if (!transaction) {
                await connection.rollback();
                return res.status(404).json({
                    success: false,
                    message: 'Transaction not found'
                });
            }

            await Transaction.cancel(transaction_id);
            await Reservation.cancelByTransaction(transaction_id);
            await connection.commit();

            res.json({
                success: true,
                message: 'Transaction cancelled successfully'
            });

        } catch (error) {
            if (connection) await connection.rollback();
            console.error('Cancel transaction error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to cancel transaction',
                error: error.message
            });
        } finally {
            if (connection) connection.release();
        }
    },

    async updatePaymentStatus(req, res) {
        try {
            const { transaction_id } = req.params;
            const { payment_status } = req.body;

            const validStatuses = ['Partial', 'Fully Paid'];
            if (!validStatuses.includes(payment_status)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid payment status. Must be: Partial or Fully Paid'
                });
            }

            await db.query(
                'UPDATE TransactionDb SET payment_status = ? WHERE id = ?',
                [payment_status, transaction_id]
            );

            res.json({
                success: true,
                message: `Payment status updated to ${payment_status}`
            });

        } catch (error) {
            console.error('Update payment status error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update payment status',
                error: error.message
            });
        }
    }, 

    // Get transactions by logged-in user
async getMyTransactions(req, res) {
    try {
        // Assuming you have user authentication middleware that adds user to req
        const userId = req.user.id; // Or however you store logged-in user info
        
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }

        // First, get user details from your Users table
        const [users] = await db.query(
            'SELECT full_name, contact_number FROM Users WHERE id = ?',
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const user = users[0];

        // Then get transactions using user's details
        const transactions = await Transaction.findByCustomer(
            user.full_name, 
            user.contact_number
        );

        const transactionsWithReservations = await Promise.all(
            transactions.map(async (transaction) => {
                const reservations = await Reservation.findByTransactionId(transaction.id);
                return {
                    ...transaction,
                    reservations
                };
            })
        );

        res.json({
            success: true,
            data: transactionsWithReservations
        });

    } catch (error) {
        console.error('Get my transactions error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch your transactions',
            error: error.message
        });
    }
}
    
    

    
};

export default TransactionController;