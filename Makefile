.PHONY: lint test format e2e macos-build macos-run macos-test

lint:
	npx eslint app/ tests/

test:
	npm test

format:
	npx prettier --write "app/**/*.{js,json}" "tests/**/*.js" "**/*.md" "*.json"

e2e:
	npm run test:e2e

macos-build:
	cd macos && swift build -c release && \
	rm -rf EthDecodeMac.app && \
	mkdir -p EthDecodeMac.app/Contents/MacOS \
	         EthDecodeMac.app/Contents/Resources/AppIcon.appiconset && \
	cp .build/release/EthDecodeMac EthDecodeMac.app/Contents/MacOS/ && \
	cp Assets.xcassets/AppIcon.appiconset/*.png \
	   EthDecodeMac.app/Contents/Resources/AppIcon.appiconset/ && \
	plutil -create xml1 EthDecodeMac.app/Contents/Info.plist && \
	plutil -insert CFBundleName        -string "EthDecodeMac" EthDecodeMac.app/Contents/Info.plist && \
	plutil -insert CFBundleExecutable  -string "EthDecodeMac" EthDecodeMac.app/Contents/Info.plist && \
	plutil -insert CFBundleIdentifier  -string "com.ethdecodmac.app" EthDecodeMac.app/Contents/Info.plist && \
	plutil -insert CFBundleVersion     -string "1" EthDecodeMac.app/Contents/Info.plist && \
	plutil -insert CFBundlePackageType -string "APPL" EthDecodeMac.app/Contents/Info.plist && \
	plutil -insert LSMinimumSystemVersion -string "14.0" EthDecodeMac.app/Contents/Info.plist && \
	plutil -insert CFBundleIconFile    -string "AppIcon" EthDecodeMac.app/Contents/Info.plist && \
	plutil -insert CFBundleIconName    -string "AppIcon" EthDecodeMac.app/Contents/Info.plist && \
	echo "Built: macos/EthDecodeMac.app"

macos-run:
	cd macos && swift run EthDecodeMac

macos-test:
	cd macos && swift run EthDecodeMacRunTests
