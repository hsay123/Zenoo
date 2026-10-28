// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {JobEscrow} from "../src/JobEscrow.sol";

/**
 * @notice Deploy {JobEscrow} to Monad testnet.
 *
 * Required env:
 *   DEPLOYER_PRIVATE_KEY  funded Monad-testnet key -> becomes the contract OWNER
 *   SETTLEMENT_RELAYER    the backend signer address  -> becomes the relayer
 *
 * The owner and relayer MUST be different addresses (the contract enforces
 * this), so rotate / separate the deployer admin key from the server signer.
 *
 *   forge script script/Deploy.s.sol:DeployJobEscrow \
 *     --rpc-url monad_testnet --broadcast
 */
contract DeployJobEscrow is Script {
    function run() external returns (JobEscrow escrow) {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address relayer = vm.envAddress("SETTLEMENT_RELAYER");

        require(relayer != deployer, "owner and relayer must differ");

        vm.startBroadcast(deployerKey);
        escrow = new JobEscrow(deployer, relayer);
        vm.stopBroadcast();

        console2.log("JobEscrow:", address(escrow));
        console2.log("owner:    ", deployer);
        console2.log("relayer:  ", relayer);
    }
}
