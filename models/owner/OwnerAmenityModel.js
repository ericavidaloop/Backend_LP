import db from '../../config/db.js';

const OwnerAmenityModel = {
    getAll: async () => {
        const query = `
            SELECT 
                a.*, 
                -- CRITICAL FIX: Count reservations that are active today or confirmed for today/future
                (SELECT COUNT(b.id) 
                 FROM ReservationDb b 
                 WHERE b.amenity_id = a.id 
                 AND b.status IN ('Confirmed', 'Checked-In')
                 -- Check if the booking period spans the current date (CURDATE())
                 AND DATE(b.check_in_date) <= CURDATE()
                 AND DATE(b.check_out_date) >= CURDATE()
                ) as booked
            FROM AmenitiesDb a 
            ORDER BY a.id DESC
        `;

        const [rows] = await db.query(query);
        return rows;
    },

    getById: async (id) => {
        const [rows] = await db.query('SELECT * FROM AmenitiesDb WHERE id = ?', [id]);
        return rows[0];
    },

    create: async (data) => {
        const { image, name, type, description, capacity, price, available, quantity } = data;
        // NOTE: available status is calculated on the frontend, let's store it as boolean/int.
        return await db.query(
            'INSERT INTO AmenitiesDb (image, name, type, description, capacity, price, available, quantity) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [image, name, type, description, capacity, price, available, quantity]
        );
    },

    update: async (id, data) => {
        const { name, description, price, type, available, capacity, quantity, image } = data;
        // Use COALESCE in SQL to handle conditional updates cleanly if the field is not in the form
        let updateQuery = 'UPDATE AmenitiesDb SET name=?, description=?, price=?, type=?, available=?, capacity=?, quantity=?';
        const params = [name, description, price, type, available, capacity, quantity];
        
        if (image) {
            updateQuery += ', image=?';
            params.push(image);
        }
        
        updateQuery += ' WHERE id=?';
        params.push(id);

        return await db.query(updateQuery, params);
    },

    delete: async (id) => {
        return await db.query('DELETE FROM AmenitiesDb WHERE id = ?', [id]);
    }

};

export default OwnerAmenityModel;