// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {JobEscrow} from "../src/JobEscrow.sol";

interface IERC20Decimals {
    function decimals() external view returns (uint8);
}

/**
 * @notice Deploy {JobEscrow} (USDC) to Base Sepolia.
 *
 * Required env:
 *   DEPLOYER_PRIVATE_KEY  funded Base Sepolia key -> becomes the contract OWNER
 *   SETTLEMENT_RELAYER    the backend signer address -> becomes the relayer
 *   USDC_ADDRESS          the USDC token the escrow holds (6 decimals)
 *
 * The owner and relayer MUST be different addresses (the contract enforces
 * this), so rotate / separate the deployer admin key from the server signer.
 * Never reuse the key from earlier development: it is compromised.
 *
 * Deploys only to Base Sepolia (84532) or a local anvil chain (31337): Base
 * mainnet stays blocked until the audit items are closed and keys are rotated.
 *
 *   forge script script/Deploy.s.sol:DeployJobEscrow \
 *     --rpc-url base_sepolia --broadcast
 */
contract DeployJobEscrow is Script {
    uint256 internal constant BASE_SEPOLIA = 84_532;
    uint256 internal constant ANVIL = 31_337;

    function run() external returns (JobEscrow escrow) {
        require(
            block.chainid == BASE_SEPOLIA || block.chainid == ANVIL,
            "deploy only to Base Sepolia or anvil"
        );

        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address relayer = vm.envAddress("SETTLEMENT_RELAYER");
        address usdc = vm.envAddress("USDC_ADDRESS");

        require(relayer != deployer, "owner and relayer must differ");
        require(IERC20Decimals(usdc).decimals() == 6, "token must have 6 decimals");

        vm.startBroadcast(deployerKey);
        escrow = new JobEscrow(deployer, relayer, usdc);
        vm.stopBroadcast();

        console2.log("JobEscrow:", address(escrow));
        console2.log("owner:    ", deployer);
        console2.log("relayer:  ", relayer);
        console2.log("token:    ", usdc);
    }
}
