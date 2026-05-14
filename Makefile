.PHONY: lint test format e2e

lint:
	npx eslint app/ tests/

test:
	npm test

format:
	npx prettier --write "app/**/*.{js,json}" "tests/**/*.js" "**/*.md" "*.json"

e2e:
	npm run test:e2e
