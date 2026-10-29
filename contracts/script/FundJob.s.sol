// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {JobEscrow} from "../src/JobEscrow.sol";

interface IERC20Approve {
    function approve(address spender, uint256 amount) external returns (bool);
}

/**
 * @notice Fund one platform job in an already-deployed {JobEscrow} with USDC.
 *
 * Approves the escrow for the amount, then calls `fundJob`. The broadcasting
 * key is recorded as the job's funder/buyer (the contract uses `msg.sender`);
 * there is no separate buyer argument. The token is read from the escrow.
 *
 * Required env:
 *   DEPLOYER_PRIVATE_KEY  key holding the USDC that pays into escrow (the buyer)
 *   JOB_ESCROW_ADDRESS    deployed JobEscrow
 *   JOB_ID_HASH           bytes32 = keccak256(utf8(platform job uuid))
 *   JOB_FUND_UNITS        USDC base units to deposit (6 decimals: 1 USDC = 1000000)
 *
 *   forge script script/FundJob.s.sol:FundJob \
 *     --rpc-url base_sepolia --broadcast
 */
contract FundJob is Script {
    function run() external {
        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        JobEscrow escrow = JobEscrow(vm.envAddress("JOB_ESCROW_ADDRESS"));
        bytes32 jobId = vm.envBytes32("JOB_ID_HASH");
        uint256 amount = vm.envUint("JOB_FUND_UNITS");
        address token = address(escrow.token());

        vm.startBroadcast(key);
        require(IERC20Approve(token).approve(address(escrow), amount), "approve failed");
        escrow.fundJob(jobId, amount);
        vm.stopBroadcast();

        console2.log("funded job", vm.toString(jobId));
        console2.log("amount (USDC units)", amount);
        console2.log("funder", vm.addr(key));
    }
}
