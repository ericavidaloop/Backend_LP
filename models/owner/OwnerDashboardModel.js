import db from '../../config/db.js';

const OwnerDashboardModel = {
    fixDate(dateField) { 
        return `CAST(${dateField} AS DATE)`; 
    },

    // SALES STATS BOXES (Uses PH Time for all stats)
    getSalesStatsBoxes: async () => {
        const phTimeNow = `CONVERT_TZ(NOW(), '+00:00', '+08:00')`;
        const phDateToday = `DATE(${phTimeNow})`;
        const phMonth = `MONTH(${phTimeNow})`;
        const phYear = `YEAR(${phTimeNow})`;
        
        const [todayRows] = await db.query(`SELECT IFNULL(SUM(amount), 0) as total FROM sales WHERE DATE(date) = ${phDateToday}`);
        const [monthRows] = await db.query(`SELECT IFNULL(SUM(amount), 0) as total FROM sales WHERE MONTH(date) = ${phMonth} AND YEAR(date) = ${phYear}`);
        const [yearRows] = await db.query(`SELECT IFNULL(SUM(amount), 0) as total FROM sales WHERE YEAR(date) = ${phYear}`);

        return {
            today: parseFloat(todayRows[0].total) || 0,
            thisMonth: parseFloat(monthRows[0].total) || 0,
            thisYear: parseFloat(yearRows[0].total) || 0
        };
    },

    getSalesHistory: async (startDate, endDate, category, paymentMethod) => {
        let query = "SELECT * FROM sales"; 
        const params = [];
        const conditions = [];

        if (startDate) { conditions.push(`date >= ?`); params.push(`${startDate} 00:00:00`); }
        if (endDate) { conditions.push(`date <= ?`); params.push(`${endDate} 23:59:59`); }
        if (category && category !== 'All') { conditions.push(`serviceType = ?`); params.push(category); }
        if (paymentMethod && paymentMethod !== 'All') { conditions.push(`paymentMethod = ?`); params.push(paymentMethod); }

        if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
        query += " ORDER BY date DESC";

        const [rows] = await db.query(query, params);
        return rows;
    },

    getSalesForChart: async (year, month, filterType) => {
        let chartQuery = '';
        let chartParams = [year];
        if (filterType === 'monthly') {
            chartQuery = `SELECT DATE_FORMAT(date, '%b') as label, MONTH(date) as sort_key, IFNULL(SUM(amount), 0) as total FROM sales WHERE YEAR(date) = ? GROUP BY MONTH(date), label, sort_key ORDER BY sort_key`;
        } else if (filterType === 'weekly') {
            chartQuery = `SELECT CONCAT('Week ', WEEK(date)) as label, WEEK(date) as sort_key, IFNULL(SUM(amount), 0) as total FROM sales WHERE YEAR(date) = ? GROUP BY WEEK(date), label, sort_key ORDER BY sort_key`;
        } else if (filterType === 'daily') {
            chartQuery = `SELECT DATE_FORMAT(date, '%d') as label, DAY(date) as sort_key, IFNULL(SUM(amount), 0) as total FROM sales WHERE YEAR(date) = ? AND MONTH(date) = ? GROUP BY DAY(date), label, sort_key ORDER BY sort_key`;
            chartParams.push(month);
        }
        if(chartQuery) { const [rows] = await db.query(chartQuery, chartParams); return rows; }
        return [];
    },
}