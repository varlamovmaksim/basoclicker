// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "../lib/forge-std/src/Script.sol";
import {MockERC20} from "../src/MockERC20.sol";

/**
 * Deploy MockERC20 (USDT-like, 6 decimals) for local/test nets.
 * Usage: forge script script/DeployMockERC20.s.sol --rpc-url <RPC> --broadcast
 */
contract DeployMockERC20 is Script {
    function run() external returns (MockERC20 token) {
        uint256 deployerPrivateKey = vm.envOr("PRIVATE_KEY", uint256(0));
        if (deployerPrivateKey == 0) {
            deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        }
        vm.startBroadcast(deployerPrivateKey);

        token = new MockERC20("Mock USDT", "USDT", 6);
        address deployer = vm.addr(deployerPrivateKey);
        token.mint(deployer, 1_000_000 * 10 ** 6);

        console2.log("MockERC20 deployed at", address(token));
        console2.log("Minted 1_000_000 USDT to", deployer);

        vm.stopBroadcast();
    }
}
