// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {RoyaltySplitter} from "../src/RoyaltySplitter.sol";

/**
 * @notice Deploy the ROADMAP DEMO {RoyaltySplitter} to Base Sepolia.
 *
 * Required env:
 *   DEPLOYER_PRIVATE_KEY   becomes the splitter OWNER (can change the split)
 *   USDC_ADDRESS           USDC token (6 decimals)
 *   ZENO_ROYALTY_ADDRESS   receives Zeno's 50% share
 *
 * Base Sepolia (84532) or anvil (31337) only.
 *
 *   forge script script/DeployRoyaltySplitter.s.sol:DeployRoyaltySplitter \
 *     --rpc-url base_sepolia --broadcast
 */
contract DeployRoyaltySplitter is Script {
    function run() external returns (RoyaltySplitter splitter) {
        require(block.chainid == 84_532 || block.chainid == 31_337, "Base Sepolia or anvil only");
        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address usdc = vm.envAddress("USDC_ADDRESS");
        address zeno = vm.envAddress("ZENO_ROYALTY_ADDRESS");

        vm.startBroadcast(key);
        splitter = new RoyaltySplitter(vm.addr(key), zeno, usdc);
        vm.stopBroadcast();

        console2.log("RoyaltySplitter:", address(splitter));
        console2.log("owner:          ", vm.addr(key));
        console2.log("zeno:           ", zeno);
        console2.log("token:          ", usdc);
    }
}
