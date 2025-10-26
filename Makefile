.PHONY: help build up down restart logs clean rebuild health

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

build: ## Build Docker images
	docker-compose build

up: ## Start all services
	docker-compose up -d

down: ## Stop all services
	docker-compose down

restart: ## Restart all services
	docker-compose restart

logs: ## View logs from all services
	docker-compose logs -f

logs-backend: ## View backend logs
	docker-compose logs -f backend

logs-frontend: ## View frontend logs
	docker-compose logs -f frontend

clean: ## Remove all containers, volumes, and images
	docker-compose down -v
	docker system prune -a -f

rebuild: ## Rebuild and restart all services
	docker-compose down
	docker-compose build --no-cache
	docker-compose up -d

health: ## Check health of services
	@echo "Checking backend health..."
	@curl -f http://localhost/health || echo "Backend is not responding"
	@echo "\n\nChecking Docker containers..."
	@docker-compose ps

status: ## Show status of all services
	docker-compose ps

shell-backend: ## Open shell in backend container
	docker-compose exec backend sh

shell-frontend: ## Open shell in frontend container
	docker-compose exec frontend sh

setup: ## Initial setup (copy env file)
	@if [ ! -f .env ]; then \
		cp .env.production .env; \
		echo ".env file created. Please edit it with your configuration."; \
	else \
		echo ".env file already exists."; \
	fi

dev-backend: ## Start backend in development mode (local, not Docker)
	npm --prefix backend run dev

dev-frontend: ## Start frontend in development mode (local, not Docker)
	npm run dev
