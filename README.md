## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run start:dev

# Build for production
npm run build

# Start production server
npm run start:prod
```

Server will be running at `http://localhost:3000`

## Project Structure

```
src/
├── modules/          # Feature modules
│   └── users/       # Example module
│       ├── dto/     # Data transfer objects
│       ├── module   # Module definition
│       ├── controller # Route handlers
│       └── service  # Business logic
│
├── common/          # Shared components
│   ├── decorators/  # Custom decorators
│   ├── guards/      # Route guards
│   ├── interceptors/# Request/Response handlers
│   ├── middleware/  # HTTP middleware
│   └── pipes/      # Data transformation
│
├── config/         # Configuration files
├── interfaces/     # TypeScript interfaces
├── types/         # Type definitions
└── utils/         # Helper functions
```

## Available Scripts

- `npm run start` - Start in development
- `npm run start:dev` - Start with hot reload
- `npm run build` - Build for production
- `npm run start:prod` - Start production server
- `npm run lint` - Check code style
- `npm run format` - Format code

## Adding New Features

### 1. Create a Module

```bash
nest g module modules/your-feature
```

### 2. Add Components

```bash
nest g controller modules/your-feature
nest g service modules/your-feature
```

### 3. Create DTOs

Add in `modules/your-feature/dto/`

- `create-feature.dto.ts`
- `update-feature.dto.ts`

## Common Patterns

### Module Structure

Each feature module should have:

- `module.ts` - Module definition
- `controller.ts` - Route handlers
- `service.ts` - Business logic
- `dto/` - Data transfer objects

### API Endpoints

Standard REST patterns:

- `GET /` - List all
- `GET /:id` - Get one
- `POST /` - Create
- `PATCH /:id` - Update
- `DELETE /:id` - Delete

## Best Practices

1. **Modularity**

   - Keep modules focused and independent
   - Use feature-based organization

2. **Code Organization**

   - Follow the established folder structure
   - Keep related files together

3. **Naming Conventions**
   - Use descriptive, consistent names
   - Follow NestJS naming patterns
