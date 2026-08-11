import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';

const swaggerDocument = {
  openapi: '3.0.3',
  info: {
    title: 'WMS API',
    description: 'Warehouse Management System API',
    version: '1.0.0',
  },
  servers: [{ url: '/api', description: 'API v1' }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      TransactionType: {
        type: 'string',
        enum: ['RV', 'LN', 'RTV', 'RTI', 'ADJ', 'TRF'],
        description: 'RV=Receiving, LN=Issuing, RTV=Return to Vendor, RTI=Return from Issue, ADJ=Adjustment, TRF=Transfer',
      },
      TransactionStatus: {
        type: 'string',
        enum: ['draft', 'approved'],
      },
      UserRole: {
        type: 'string',
        enum: ['system_admin', 'warehouse_manager', 'department_manager', 'supervisor'],
      },
      RequestStatus: {
        type: 'string',
        enum: ['pending', 'dept_approved', 'forwarded', 'admin_approved', 'admin_rejected', 'issued', 'cancelled'],
      },
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              message: { type: 'string' },
              code: { type: 'string' },
              details: { type: 'object' },
            },
          },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login and get access + refresh tokens',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['username', 'password'],
                properties: {
                  username: { type: 'string' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Login successful' },
          '401': { description: 'Invalid credentials' },
        },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Refresh access token',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['refreshToken'],
                properties: { refreshToken: { type: 'string' } },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Token refreshed' },
          '401': { description: 'Invalid refresh token' },
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Logout and revoke refresh token',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { refreshToken: { type: 'string' } },
              },
            },
          },
        },
        responses: { '200': { description: 'Logged out' } },
      },
    },
    '/categories': {
      get: { tags: ['Categories'], summary: 'List all categories', responses: { '200': { description: 'Success' } } },
      post: { tags: ['Categories'], summary: 'Create category', responses: { '201': { description: 'Created' } } },
    },
    '/units': {
      get: { tags: ['Units'], summary: 'List all units', responses: { '200': { description: 'Success' } } },
      post: { tags: ['Units'], summary: 'Create unit', responses: { '201': { description: 'Created' } } },
    },
    '/suppliers': {
      get: { tags: ['Suppliers'], summary: 'List all suppliers', responses: { '200': { description: 'Success' } } },
      post: { tags: ['Suppliers'], summary: 'Create supplier', responses: { '201': { description: 'Created' } } },
    },
    '/departments': {
      get: { tags: ['Departments'], summary: 'List all departments', responses: { '200': { description: 'Success' } } },
      post: { tags: ['Departments'], summary: 'Create department', responses: { '201': { description: 'Created' } } },
    },
    '/warehouses': {
      get: { tags: ['Warehouses'], summary: 'List all warehouses', responses: { '200': { description: 'Success' } } },
      post: { tags: ['Warehouses'], summary: 'Create warehouse', responses: { '201': { description: 'Created' } } },
    },
    '/users': {
      get: { tags: ['Users'], summary: 'List all users (admin)', responses: { '200': { description: 'Success' } } },
      post: { tags: ['Users'], summary: 'Create user (admin)', responses: { '201': { description: 'Created' } } },
    },
    '/items': {
      get: { tags: ['Items'], summary: 'List all items', responses: { '200': { description: 'Success' } } },
      post: { tags: ['Items'], summary: 'Create item', responses: { '201': { description: 'Created' } } },
    },
    '/items/{id}': {
      get: { tags: ['Items'], summary: 'Get item card with movement history', responses: { '200': { description: 'Success' } } },
    },
    '/unit-conversions': {
      get: { tags: ['Unit Conversions'], summary: 'List all conversions', responses: { '200': { description: 'Success' } } },
      post: { tags: ['Unit Conversions'], summary: 'Create conversion', responses: { '201': { description: 'Created' } } },
    },
    '/transactions': {
      get: { tags: ['Transactions'], summary: 'List transactions (filterable by type/status)', responses: { '200': { description: 'Success' } } },
      post: {
        tags: ['Transactions'],
        summary: 'Create draft transaction',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['header', 'details'],
                properties: {
                  header: {
                    type: 'object',
                    required: ['type', 'warehouse_id'],
                    properties: {
                      type: { $ref: '#/components/schemas/TransactionType' },
                      warehouse_id: { type: 'integer' },
                      to_warehouse_id: { type: 'integer', description: 'Required for TRF' },
                      supplier_id: { type: 'integer' },
                      department_id: { type: 'integer', description: 'Required for LN' },
                      notes: { type: 'string' },
                    },
                  },
                  details: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['item_id', 'quantity', 'unit_code'],
                      properties: {
                        item_id: { type: 'integer' },
                        quantity: { type: 'number' },
                        unit_code: { type: 'string' },
                        unit_price: { type: 'number' },
                        batch_number: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: { '201': { description: 'Draft created' } },
      },
    },
    '/transactions/{id}': {
      get: { tags: ['Transactions'], summary: 'Get transaction details', responses: { '200': { description: 'Success' } } },
    },
    '/transactions/{id}/approve': {
      post: { tags: ['Transactions'], summary: 'Approve transaction (updates stock)', responses: { '200': { description: 'Approved' } } },
    },
    '/stock-movements': {
      get: { tags: ['Stock Movements'], summary: 'List all stock movements', responses: { '200': { description: 'Success' } } },
    },
    '/stock-movements/item/{itemId}': {
      get: { tags: ['Stock Movements'], summary: 'Get movements for an item', responses: { '200': { description: 'Success' } } },
    },
    '/reports/inventory': {
      get: { tags: ['Reports'], summary: 'Inventory report with filters', responses: { '200': { description: 'Success' } } },
    },
    '/reports/item-card/{id}': {
      get: { tags: ['Reports'], summary: 'Detailed item card report', responses: { '200': { description: 'Success' } } },
    },
    '/settings': {
      get: { tags: ['Settings'], summary: 'Get all settings (admin)', responses: { '200': { description: 'Success' } } },
      put: { tags: ['Settings'], summary: 'Update settings (admin)', responses: { '200': { description: 'Updated' } } },
    },
    '/requests': {
      get: { tags: ['Material Requests'], summary: 'List material requests', responses: { '200': { description: 'Success' } } },
      post: { tags: ['Material Requests'], summary: 'Create material request', responses: { '201': { description: 'Created' } } },
    },
    '/alerts': {
      get: { tags: ['Alerts'], summary: 'List alerts', responses: { '200': { description: 'Success' } } },
    },
    '/alerts/summary': {
      get: { tags: ['Alerts'], summary: 'Alert summary counts', responses: { '200': { description: 'Success' } } },
    },
    '/inventory': {
      get: { tags: ['Inventory'], summary: 'Inventory management', responses: { '200': { description: 'Success' } } },
    },
    '/batches': {
      get: { tags: ['Batches'], summary: 'List batches', responses: { '200': { description: 'Success' } } },
    },
  },
};

const router = Router();

router.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'WMS API Documentation',
}));

router.get('/docs.json', (_req, res) => {
  res.json(swaggerDocument);
});

export default router;
export { swaggerDocument };
