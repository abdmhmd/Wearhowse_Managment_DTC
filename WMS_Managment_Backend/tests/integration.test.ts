import request from 'supertest';
import { pool } from '../src/config/database';
import { hashPassword } from '../src/utils/crypto';
import { shortId, TEST_PREFIX, seedCategory, seedUnit, seedWarehouse, seedUser, seedItem } from './helpers';

const prefix = `${TEST_PREFIX}int_test_`;
let app: any;
let token: string;
let userId: number;
let username: string;
let catCode: string;
let unitCode: string;
let whId: number;
let itemId: number;

beforeAll(async () => {
  // Create test data for integration tests
  username = `${prefix}${shortId()}`;
  const password_hash = await hashPassword('testPass123');
  const userRes = await pool.query(
    `INSERT INTO users (username, password_hash, full_name, role, is_active)
     VALUES ($1, $2, $3, 'system_admin', true) RETURNING id`,
    [username, password_hash, username]
  );
  userId = userRes.rows[0].id;

  catCode = await seedCategory();
  unitCode = await seedUnit();
  whId = await seedWarehouse();
  itemId = await seedItem(catCode, unitCode, whId, 100);

  // Import app after env is set
  app = (await import('../src/app')).default;
});

afterAll(async () => {
  await pool.query('DELETE FROM stock_movements USING transactions WHERE stock_movements.transaction_id = transactions.id AND transactions.transaction_no LIKE $1', [`${prefix}%`]);
  await pool.query('DELETE FROM transaction_details USING transactions WHERE transaction_details.transaction_id = transactions.id AND transactions.transaction_no LIKE $1', [`${prefix}%`]);
  await pool.query('DELETE FROM transactions WHERE transaction_no LIKE $1', [`${prefix}%`]);
  await pool.query('DELETE FROM items WHERE item_code LIKE $1', [`${prefix}%`]);
  await pool.query('DELETE FROM warehouses WHERE code LIKE $1', [`${prefix}%`]);
  await pool.query('DELETE FROM categories WHERE code LIKE $1', [`${prefix}%`]);
  await pool.query('DELETE FROM units WHERE code LIKE $1', [`${prefix}%`]);
  await pool.query('DELETE FROM users WHERE username LIKE $1', [`${prefix}%`]);
});

describe('API Integration Tests', () => {
  // --- Health Check ---
  describe('GET /health', () => {
    test('returns ok status', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('healthy');
    });
  });

  // --- Authentication Flow ---
  describe('POST /api/auth/login', () => {
    test('login with valid credentials returns token', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username, password: 'testPass123' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      token = res.body.data.token;
    });

    test('login with wrong password returns 401', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username, password: 'wrongpass' });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('login with unknown username returns 401', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'nonexistent_user', password: 'testPass123' });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('login with missing fields returns 400', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // --- Protected routes (401 without token) ---
  describe('Protected routes (401)', () => {
    test('GET /api/categories without token returns 401', async () => {
      const res = await request(app).get('/api/categories');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('GET /api/items without token returns 401', async () => {
      const res = await request(app).get('/api/items');
      expect(res.status).toBe(401);
    });

    test('GET /api/users without token returns 401', async () => {
      const res = await request(app).get('/api/users');
      expect(res.status).toBe(401);
    });

    test('GET /api/transactions without token returns 401', async () => {
      const res = await request(app).get('/api/transactions');
      expect(res.status).toBe(401);
    });
  });

  // --- Authenticated CRUD operations ---
  describe('Authenticated CRUD', () => {
    let createdCategoryCode: string;

    test('POST /api/categories creates a category', async () => {
      createdCategoryCode = `${prefix}${shortId()}`;
      const res = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: createdCategoryCode, name_ar: 'Integration Test Cat' });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.code).toBe(createdCategoryCode);
    });

    test('GET /api/categories returns categories', async () => {
      const res = await request(app)
        .get('/api/categories')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('GET /api/categories/:code returns single category', async () => {
      const res = await request(app)
        .get(`/api/categories/${createdCategoryCode}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.code).toBe(createdCategoryCode);
    });

    test('PUT /api/categories/:code updates category', async () => {
      const res = await request(app)
        .put(`/api/categories/${createdCategoryCode}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name_ar: 'Updated Cat' });
      expect(res.status).toBe(200);
      expect(res.body.data.name_ar).toBe('Updated Cat');
    });

    test('DELETE /api/categories/:code deletes category', async () => {
      const res = await request(app)
        .delete(`/api/categories/${createdCategoryCode}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // --- Transaction Flow ---
  describe('Transaction Workflow', () => {
    let draftTxNo: string;

    test('POST /api/transactions creates draft', async () => {
      draftTxNo = `${prefix}${shortId()}`;
      const res = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${token}`)
        .send({
          header: {
            transaction_no: draftTxNo,
            type: 'RV',
            warehouse_id: whId,
          },
          details: [{
            item_id: itemId,
            quantity: 25,
            unit_code: unitCode,
            unit_price: 10,
          }],
        });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('draft');
    });

    test('GET /api/transactions lists transactions', async () => {
      const res = await request(app)
        .get('/api/transactions')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('POST /api/transactions/:id/approve approves the draft', async () => {
      // First get the transaction ID
      const listRes = await request(app)
        .get('/api/transactions')
        .set('Authorization', `Bearer ${token}`)
        .query({ transaction_no: draftTxNo });
      
      // find the transaction from list
      const allRes = await request(app)
        .get('/api/transactions')
        .set('Authorization', `Bearer ${token}`);
      
      const tx = allRes.body.data.find((t: any) => t.transaction_no === draftTxNo);
      expect(tx).toBeDefined();

      const res = await request(app)
        .post(`/api/transactions/${tx.id}/approve`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('Cannot approve already approved transaction', async () => {
      // Create and approve a transaction first
      const txNo = `${prefix}${shortId()}`;
      const createRes = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${token}`)
        .send({
          header: { transaction_no: txNo, type: 'RV', warehouse_id: whId },
          details: [{ item_id: itemId, quantity: 5, unit_code: unitCode, unit_price: 10 }],
        });
      const txId = createRes.body.data.id;

      // Approve once
      await request(app)
        .post(`/api/transactions/${txId}/approve`)
        .set('Authorization', `Bearer ${token}`);

      // Approve again
      const res = await request(app)
        .post(`/api/transactions/${txId}/approve`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('Cannot approve non-existent transaction', async () => {
      const res = await request(app)
        .post('/api/transactions/999999999/approve')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });
  });

  // --- Stock Movements ---
  describe('Stock Movements', () => {
    test('GET /api/stock-movements returns movements', async () => {
      const res = await request(app)
        .get('/api/stock-movements')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('GET /api/stock-movements/item/:itemId returns movements by item', async () => {
      const res = await request(app)
        .get(`/api/stock-movements/item/${itemId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    });
  });

  // --- Reports ---
  describe('Reports', () => {
    test('GET /api/reports/inventory returns report', async () => {
      const res = await request(app)
        .get('/api/reports/inventory')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.pagination).toBeDefined();
    });

    test('GET /api/reports/item-card/:id returns item card', async () => {
      const res = await request(app)
        .get(`/api/reports/item-card/${itemId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    });
  });

  // --- Role-based authorization via API ---
  describe('Role Authorization', () => {
    let accountantToken: string;

    beforeAll(async () => {
      const acctUsername = `${prefix}acct_${shortId()}`;
      const acctHash = await hashPassword('acctPass123');
      await pool.query(
        `INSERT INTO users (username, password_hash, full_name, role, is_active)
         VALUES ($1, $2, $3, 'accountant', true)`,
        [acctUsername, acctHash, acctUsername]
      );
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ username: acctUsername, password: 'acctPass123' });
      accountantToken = loginRes.body.data?.token;
    });

    test('accountant cannot create categories (403)', async () => {
      const res = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${accountantToken}`)
        .send({ code: `${prefix}${shortId()}`, name_ar: 'Should Fail' });
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    test('accountant cannot approve transactions (403)', async () => {
      const res = await request(app)
        .post('/api/transactions/1/approve')
        .set('Authorization', `Bearer ${accountantToken}`);
      expect(res.status).toBe(403);
    });

    test('accountant can view reports (if permitted)', async () => {
      // Reports permit warehouse_manager, system_admin, and accountant
      const res = await request(app)
        .get('/api/reports/inventory')
        .set('Authorization', `Bearer ${accountantToken}`);
      expect(res.status).toBe(200);
    });
  });
});
