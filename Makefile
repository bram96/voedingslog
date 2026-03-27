.PHONY: setup test test-py test-ts typecheck build

## First-time dev environment setup
setup:
	python3 -m venv .venv
	.venv/bin/pip install pytest pytest-asyncio aiohttp homeassistant
	cd custom_components/voedingslog/frontend-src && pnpm install
	git config core.hooksPath .githooks
	@echo "Dev environment ready. Pre-commit hook activated."

## Run all tests
test: test-py typecheck test-ts

## Python tests
test-py:
	.venv/bin/pytest tests/ -q --tb=short

## TypeScript type check
typecheck:
	cd custom_components/voedingslog/frontend-src && pnpm typecheck

## TypeScript tests
test-ts:
	cd custom_components/voedingslog/frontend-src && pnpm test

## Build frontend
build:
	cd custom_components/voedingslog/frontend-src && pnpm build
