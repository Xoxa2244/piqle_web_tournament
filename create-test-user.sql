-- Create test user for development
INSERT INTO users (id, email, name, role, "isActive", "createdAt", "updatedAt")
VALUES (
  'test-user-id',
  'test@example.com',
  'Test Tournament Director',
  'TD',
  true,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;
