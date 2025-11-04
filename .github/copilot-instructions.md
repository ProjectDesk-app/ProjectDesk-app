# Copilot Instructions for ProjectDesk

## Project Overview
ProjectDesk is a web-based project management application designed for academic environments, facilitating collaboration between students, supervisors, and administrators. The application enables project tracking, task management, notifications, and team collaboration.

## Technology Stack
- **Framework**: Next.js 14 with TypeScript (Pages Router)
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: NextAuth.js with support for:
  - Local credentials (email/password with bcrypt)
  - Azure AD (configurable via environment variables)
- **Styling**: Tailwind CSS
- **UI Components**: Headless UI, Heroicons, Lucide React
- **Notifications**: react-hot-toast for user feedback
- **Email**: AWS SES
- **Drag & Drop**: @dnd-kit
- **State Management**: SWR for data fetching

## Architecture & Structure

### Directory Structure
```
src/
├── pages/              # Next.js pages and API routes
│   ├── api/           # API endpoints
│   │   ├── admin/     # Admin-specific endpoints
│   │   ├── projects/  # Project management endpoints
│   │   ├── tasks/     # Task management endpoints
│   │   ├── notifications/
│   │   ├── assistance/
│   │   └── auth/      # NextAuth configuration
│   ├── admin/         # Admin dashboard pages
│   ├── supervisor/    # Supervisor-specific pages
│   ├── projects/      # Project pages
│   └── tasks/         # Task pages
├── components/        # React components
│   ├── admin/         # Admin components
│   ├── projects/      # Project components
│   └── account/       # Account-related components
├── lib/              # Utility libraries
│   ├── auth.ts       # NextAuth configuration
│   ├── authRoles.ts  # Role-based access control
│   ├── prisma.ts     # Prisma client instance
│   ├── mailer.ts     # Email utilities
│   └── tokens.ts     # Token generation/validation
└── styles/           # Global styles

prisma/
├── schema.prisma     # Database schema
└── migrations/       # Database migrations
```

## Database Schema

### Key Models
- **User**: Supports three roles (STUDENT, SUPERVISOR, ADMIN) with email verification
- **Project**: Projects managed by supervisors with students as members or collaborators
- **Task**: Tasks within projects with assignees, dependencies, and flags
- **TaskSet**: Reusable task templates
- **Notification**: System notifications for various events
- **Comment**: Comments on tasks
- **ProjectMember**: Join table for project membership
- **EmailVerification**: Email verification tokens
- **PasswordResetToken**: Password reset tokens

### User Roles
- `STUDENT`: Can be assigned to projects and tasks
- `SUPERVISOR`: Can create/manage projects and supervise students
- `ADMIN`: Full system access, user management

## Coding Conventions

### TypeScript
- Use TypeScript for all new files
- Prefer type inference where possible
- Define interfaces for complex data structures
- Use `@/` path alias for imports from `src/` directory

### API Routes
- Follow RESTful conventions
- Use `requireRole()` from `@/lib/authRoles` for authorization
- Return consistent error responses: `{ error: string }`
- Use HTTP status codes appropriately (200, 201, 400, 401, 403, 404, 500)
- Structure:
  ```typescript
  import { requireRole } from "@/lib/authRoles";
  
  export default async function handler(req, res) {
    const auth = await requireRole(req, res, ["ADMIN", "SUPERVISOR"]);
    if (!auth.authorized) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    // Handle request
  }
  ```

### Components
- Use functional components with TypeScript
- Follow Next.js best practices for pages and components
- Use Tailwind CSS for styling (avoid inline styles)
- Keep components small and focused
- Extract reusable logic into custom hooks or utilities

### Prisma
- Use the prisma client from `@/lib/prisma`
- Always include proper relations in queries
- Use transactions for multi-step operations
- Handle errors gracefully

### Authentication
- Authentication can be configured via environment variables:
  - `AZURE_AD_ENABLED`: Enable Azure AD authentication
  - `LOCAL_AUTH_ENABLED`: Enable local credentials (default: true)
- Use `getServerSession()` for server-side auth checks
- Session management via JWT strategy

## Development Guidelines

### Scripts
- `npm run dev`: Start development server
- `npm run build`: Build for production
- `npm run lint`: Run ESLint
- `npm run prisma:generate`: Generate Prisma client
- `npm run prisma:migrate`: Run database migrations
- `npm run db:seed`: Seed database

### Environment Variables Required
- `DATABASE_URL`: PostgreSQL connection string
- `NEXTAUTH_SECRET`: NextAuth secret key
- `NEXTAUTH_URL`: Application URL
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`: For SES email
- `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID`: For Azure AD (optional)

### Code Style
- Use 2-space indentation
- Use semicolons
- Prefer `const` over `let`
- Use template literals for string interpolation
- Use async/await over promises chains
- Add meaningful variable names

### Security
- Always validate user input
- Sanitize data before database operations
- Use parameterized queries (Prisma handles this)
- Implement proper role-based access control
- Never expose sensitive data in API responses
- Use environment variables for secrets

## Feature-Specific Guidelines

### Project Management
- Projects have supervisors (required), students, and collaborators
- Projects can be archived or completed
- Status tracking: "On Track", "At Risk", "Behind Schedule"
- Projects contain tasks organized in a hierarchical structure

### Task Management
- Tasks support dependencies (blocking/blocked relationships)
- Tasks can be flagged for attention
- Multi-assignment support (multiple assignees per task)
- Task sets (templates) can be applied to projects
- Tasks have priorities, due dates, and completion tracking

### Notifications
- System generates notifications for key events
- Notifications link to relevant entities (projects, tasks)
- Support for unread counts and mark as read

### Email System
- Uses AWS SES for sending emails
- Email templates for verification, password reset, etc.
- Graceful error handling for email failures

## Testing
- No existing test infrastructure
- When adding features, ensure manual testing of:
  - API endpoints with different user roles
  - UI components across different states
  - Database operations and relations
  - Email functionality (if modified)

## Common Patterns

### Data Fetching in Pages
```typescript
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(r => r.json());
const { data, error, mutate } = useSWR('/api/endpoint', fetcher);
```

### Role-Based UI Rendering
```typescript
import { useSession } from 'next-auth/react';

const { data: session } = useSession();
const isAdmin = session?.user?.role === 'ADMIN';
```

### Error Handling
```typescript
try {
  // operation
} catch (error) {
  console.error('Operation failed:', error);
  return res.status(500).json({ error: 'Operation failed' });
}
```

## Important Notes
- The application uses Next.js Pages Router (not App Router)
- Prisma client should be imported from `@/lib/prisma`, not instantiated directly
- Authentication is handled via NextAuth with JWT sessions
- All dates should be handled as Date objects or ISO strings
- Use toast notifications (react-hot-toast) for user feedback in UI
