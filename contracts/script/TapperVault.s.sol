// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "../lib/forge-std/src/Script.sol";
import {TapperVault} from "../src/TapperVault.sol";

/**
 * Deploy TapperVault.
 * Requires TOKEN_ADDRESS and OWNER_ADDRESS in env, or pass via --sig "run(address,address)" <token> <owner>.
 * Usage:
 *   forge script script/TapperVault.s.sol --rpc-url <RPC> --broadcast
 *   (reads TOKEN_ADDRESS and OWNER_ADDRESS from env)
 * Or:
 *   forge script script/TapperVault.s.sol --rpc-url <RPC> --broadcast --sig "run(address,address)" <token> <owner>
 */
contract DeployTapperVault is Script {
    function run() external returns (TapperVault vault) {
        address tokenAddress = vm.envOr("TOKEN_ADDRESS", address(0));
        address ownerAddress = vm.envOr("OWNER_ADDRESS", address(0));
        if (tokenAddress == address(0) || ownerAddress == address(0)) {
            revert("Set TOKEN_ADDRESS and OWNER_ADDRESS in env (or pass via --sig)");
        }

        uint256 deployerPrivateKey = vm.envOr("PRIVATE_KEY", uint256(0));
        if (deployerPrivateKey == 0) {
            deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        }
        vm.startBroadcast(deployerPrivateKey);

        vault = new TapperVault(tokenAddress, ownerAddress);
        console2.log("TapperVault deployed at", address(vault));
        console2.log("Token", tokenAddress);
        console2.log("Owner", ownerAddress);

        vm.stopBroadcast();
    }
}
