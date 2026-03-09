# Tapper contracts — build, test, deploy
# Run from contracts/ directory.

SHELL := /bin/bash
CONTRACTS_DIR := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))

# Optional: set RPC_URL for deploy targets (e.g. https://mainnet.base.org or http://127.0.0.1:8545)
RPC_URL ?= http://127.0.0.1:8545
# Private key for deployment (optional; can use PRIVATE_KEY or DEPLOYER_PRIVATE_KEY in .env)
PRIVATE_KEY ?=

.PHONY: build test test-contract anvil deploy-token deploy deploy-local verify clean

# Build contracts
build:
	cd $(CONTRACTS_DIR) && forge build

# Run all tests
test: build
	cd $(CONTRACTS_DIR) && forge test

# Alias for test (helper for "test contract")
test-contract: test

# Run Anvil local node (background: make anvil &)
anvil:
	cd $(CONTRACTS_DIR) && anvil

# Deploy MockERC20 (test USDT-like token) to RPC_URL.
# Sets TOKEN_ADDRESS in env for next deploy; optionally mint more with cast.
deploy-token: build
	cd $(CONTRACTS_DIR) && set -a && [ -f .env ] && . ./.env && set +a && \
	KEY=$${DEPLOYER_PRIVATE_KEY:-$$PRIVATE_KEY} && \
	forge script script/DeployMockERC20.s.sol \
		--rpc-url $${RPC_URL:-http://127.0.0.1:8545} \
		$${KEY:+--private-key $$KEY} \
		--broadcast
	@echo "Set TOKEN_ADDRESS to the deployed MockERC20 address (see output above)."

# Deploy TapperVault. Requires TOKEN_ADDRESS and OWNER_ADDRESS (set in .env or env).
# Example: TOKEN_ADDRESS=0x... OWNER_ADDRESS=0x... make deploy
deploy: build
	cd $(CONTRACTS_DIR) && set -a && [ -f .env ] && . ./.env && set +a && \
	test -n "$$TOKEN_ADDRESS" || (echo "TOKEN_ADDRESS is required (set in contracts/.env or env)"; exit 1) && \
	test -n "$$OWNER_ADDRESS" || (echo "OWNER_ADDRESS is required (set in contracts/.env or env)"; exit 1) && \
	KEY=$${DEPLOYER_PRIVATE_KEY:-$$PRIVATE_KEY} && \
	forge script script/TapperVault.s.sol \
		--rpc-url $${RPC_URL:-http://127.0.0.1:8545} \
		$${KEY:+--private-key $$KEY} \
		--broadcast\
		--verify

# Deploy MockERC20 on local Anvil. Then run:
#   OWNER_ADDRESS=<addr> TOKEN_ADDRESS=<from output above> make deploy
# Default Anvil account: 0xf39Fd6e51aaf886cF9744F884Cea1fE021E0B5dA
deploy-local: build
	cd $(CONTRACTS_DIR) && forge script script/DeployMockERC20.s.sol --rpc-url $(RPC_URL) --broadcast --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
	@echo "Then: OWNER_ADDRESS=0xf39Fd6e51aaf886cF9744F884Cea1fE021E0B5dA TOKEN_ADDRESS=<token from above> make deploy"

# Verify last TapperVault deployment on Etherscan/Basescan.
# Reads address and constructor args from broadcast/TapperVault.s.sol/<chain>/run-latest.json (or latest run-*.json).
# Requires ETHERSCAN_API_KEY (or BASESCAN_API_KEY for Base) in .env.
verify:
	@cd $(CONTRACTS_DIR) && set -a && [ -f .env ] && . ./.env && set +a && \
	BROADCAST=$$(ls -t broadcast/TapperVault.s.sol/*/run-*.json 2>/dev/null | head -1) && \
	test -n "$$BROADCAST" || (echo "No TapperVault broadcast found. Deploy first."; exit 1) && \
	CHAIN=$$(jq -r '.chain' "$$BROADCAST") && \
	ADDR=$$(jq -r '.transactions[0].contractAddress' "$$BROADCAST") && \
	TOKEN=$$(jq -r '.transactions[0].arguments[0]' "$$BROADCAST") && \
	OWNER=$$(jq -r '.transactions[0].arguments[1]' "$$BROADCAST") && \
	API_KEY=$${BASESCAN_API_KEY:-$$ETHERSCAN_API_KEY} && \
	test -n "$$API_KEY" || (echo "Set ETHERSCAN_API_KEY or BASESCAN_API_KEY in .env"; exit 1) && \
	ARGS=$$(cast abi-encode "constructor(address,address)" "$$TOKEN" "$$OWNER") && \
	echo "Verifying TapperVault at $$ADDR on chain $$CHAIN..." && \
	forge verify-contract "$$ADDR" src/TapperVault.sol:TapperVault \
		--chain-id "$$CHAIN" \
		--etherscan-api-key "$$API_KEY" \
		--constructor-args "$$ARGS"

clean:
	cd $(CONTRACTS_DIR) && forge clean
