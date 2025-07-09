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

Server will be running at `http://localhost:8080`

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

- `GET /health` - check if the server is running.
- `POST /segmentation` - Generated script and segment it into parts.
   - takes in ```{prompt: string}``` as parameter.
   - returns 
   ```
   {
    segments: [
        {
            id: string, 
            visual: string, 
            narration: string
        }...], 
   style: string
   }
   ```
- `POST /image-gen` - Generate images
   - takes in ```{visual_prompt: string}``` as parameter
   - returns 
   ```
   {
        "images": [
            {
                "url": string,
                "content_type": "image/png",
                "file_name": "output.png",
                "file_size": number
            }
        ],
        "seed": number
    }
   ```
- `POST /video-gen` - Generate videos
   - takes in ```{narration_prompt: string, image_url: string}``` as parameters.
   - returns 
   ```
   {
        "video": {
            "url": string,
            "content_type": "video/mp4",
            "file_name": "output.mp4",
            "file_size": number
        }
    }
   ```

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