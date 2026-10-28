// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {JobEscrow} from "../src/JobEscrow.sol";

/**
 * @notice Fund one platform job in an already-deployed {JobEscrow}.
 *
 * The broadcasting key is recorded as the job's funder/buyer (the contract uses
 * `msg.sender`); there is no separate buyer argument.
 *
 * Required env:
 *   DEPLOYER_PRIVATE_KEY  funded key that pays into escrow (the buyer)
 *   JOB_ESCROW_ADDRESS    deployed JobEscrow
 *   JOB_ID_HASH           bytes32 = keccak256(utf8(platform job uuid))
 *   JOB_FUND_WEI          amount in wei to deposit
 *
 *   forge script script/FundJob.s.sol:FundJob \
 *     --rpc-url monad_testnet --broadcast
 */
contract FundJob is Script {
    function run() external {
        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        JobEscrow escrow = JobEscrow(payable(vm.envAddress("JOB_ESCROW_ADDRESS")));
        bytes32 jobId = vm.envBytes32("JOB_ID_HASH");
        uint256 amount = vm.envUint("JOB_FUND_WEI");

        vm.startBroadcast(key);
        escrow.fundJob{value: amount}(jobId);
        vm.stopBroadcast();

        console2.log("funded job", vm.toString(jobId));
        console2.log("amount (wei)", amount);
        console2.log("funder", vm.addr(key));
    }
}
