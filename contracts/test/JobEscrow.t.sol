// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {JobEscrow} from "../src/JobEscrow.sol";

/**
 * @dev Money-rule and access-control tests for {JobEscrow}.
 *
 *      The test contract is the deployer, so it is the `owner` but — by design —
 *      NOT a relayer. A distinct `relayer` address signs settlements, mirroring
 *      the backend signer being separate from the admin/owner.
 */
contract JobEscrowTest is Test {
    JobEscrow internal escrow;

    address internal owner = address(this);
    address internal relayer = address(0xBEEF);
    address internal buyer = address(0xB0B);
    address internal contributor = address(0xC0FFEE);
    address internal stranger = address(0xBAD);

    bytes32 internal constant JOB_ID = keccak256("job-1");
    bytes32 internal constant TASK_ID = keccak256("task-1");
    bytes32 internal constant TASK_ID_2 = keccak256("task-2");
    bytes32 internal constant ANNOTATION_HASH = keccak256("annotation-1");

    event JobFunded(bytes32 indexed jobId, address indexed funder, uint256 amount);
    event JobClosed(bytes32 indexed jobId, uint256 unspent);
    event TaskSettled(
        bytes32 indexed jobId,
        bytes32 indexed taskId,
        address indexed payee,
        uint256 amount,
        bytes32 annotationHash
    );
    event JobWithdrawn(bytes32 indexed jobId, address indexed to, uint256 amount);
    event RelayerSet(address indexed relayer, bool allowed);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    function setUp() public {
        escrow = new JobEscrow(owner, relayer);
        assertEq(escrow.owner(), owner);
        assertTrue(escrow.relayers(relayer));
        assertFalse(escrow.relayers(owner)); // owner is NOT a relayer by default
    }

    // ---------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------

    function _fund(uint256 amount) internal {
        vm.deal(buyer, amount);
        vm.prank(buyer);
        escrow.fundJob{value: amount}(JOB_ID);
    }

    function _job()
        internal
        view
        returns (address jobBuyer, uint256 budget, uint256 paid, bool open, bool exists)
    {
        return escrow.jobs(JOB_ID);
    }

    // ---------------------------------------------------------------
    // Construction / roles
    // ---------------------------------------------------------------

    function test_Constructor_SeparatesOwnerAndRelayer() public view {
        assertEq(escrow.owner(), owner);
        assertTrue(escrow.relayers(relayer));
        assertFalse(escrow.relayers(owner));
    }

    function test_Constructor_RejectsIdenticalOwnerAndRelayer() public {
        vm.expectRevert(JobEscrow.IdenticalOwnerAndRelayer.selector);
        new JobEscrow(stranger, stranger);
    }

    function test_Constructor_RejectsZeroAddresses() public {
        vm.expectRevert(JobEscrow.ZeroAddress.selector);
        new JobEscrow(address(0), relayer);
        vm.expectRevert(JobEscrow.ZeroAddress.selector);
        new JobEscrow(owner, address(0));
    }

    function test_Constructor_ReportsSettlementAbiVersion() public view {
        // The backend fail-closed preflight gates real settlement on this value:
        // an escrow that does not report it is treated as stale and never paid.
        assertEq(escrow.SETTLEMENT_ABI_VERSION(), 2);
    }

    function test_SetRelayer_OnlyOwnerAndEmits() public {
        vm.prank(stranger);
        vm.expectRevert(JobEscrow.NotOwner.selector);
        escrow.setRelayer(stranger, true);

        vm.expectEmit(true, false, false, true);
        emit RelayerSet(stranger, true);
        escrow.setRelayer(stranger, true);
        assertTrue(escrow.relayers(stranger));

        escrow.setRelayer(stranger, false);
        assertFalse(escrow.relayers(stranger));
    }

    function test_SetRelayer_RejectsZeroAddress() public {
        vm.expectRevert(JobEscrow.ZeroAddress.selector);
        escrow.setRelayer(address(0), true);
    }

    function test_TransferOwnership_OnlyOwnerAndEmits() public {
        vm.prank(stranger);
        vm.expectRevert(JobEscrow.NotOwner.selector);
        escrow.transferOwnership(stranger);

        vm.expectEmit(true, true, false, true);
        emit OwnershipTransferred(owner, stranger);
        escrow.transferOwnership(stranger);
        assertEq(escrow.owner(), stranger);
    }

    // ---------------------------------------------------------------
    // Funding
    // ---------------------------------------------------------------

    function test_FundJob_AttributesCallerAsFunder() public {
        vm.deal(buyer, 1 ether);
        vm.expectEmit(true, true, false, true);
        emit JobFunded(JOB_ID, buyer, 1 ether);
        vm.prank(buyer);
        escrow.fundJob{value: 1 ether}(JOB_ID);

        (address jobBuyer, uint256 budget, uint256 paid, bool open, bool exists) = _job();
        assertEq(jobBuyer, buyer);
        assertEq(budget, 1 ether);
        assertEq(paid, 0);
        assertTrue(open);
        assertTrue(exists);
    }

    function test_FundJob_BuyerCanTopUp() public {
        _fund(0.4 ether);
        vm.deal(buyer, 0.6 ether);
        vm.prank(buyer);
        escrow.fundJob{value: 0.6 ether}(JOB_ID);

        (, uint256 budget,,,) = _job();
        assertEq(budget, 1 ether);
        assertEq(address(escrow).balance, 1 ether);
    }

    function test_FundJob_RejectsNonBuyerTopUp() public {
        _fund(0.4 ether);
        vm.deal(stranger, 1 ether);
        vm.prank(stranger);
        vm.expectRevert(JobEscrow.NotBuyer.selector);
        escrow.fundJob{value: 0.4 ether}(JOB_ID);
    }

    function test_FundJob_RejectsZeroValue() public {
        vm.prank(buyer);
        vm.expectRevert(JobEscrow.ZeroAmount.selector);
        escrow.fundJob{value: 0}(JOB_ID);
    }

    function test_FundJob_RejectsWhenClosed() public {
        _fund(1 ether);
        escrow.closeJob(JOB_ID);
        vm.deal(buyer, 1 ether);
        vm.prank(buyer);
        vm.expectRevert(JobEscrow.JobClosedError.selector);
        escrow.fundJob{value: 0.5 ether}(JOB_ID);
    }

    // ---------------------------------------------------------------
    // Closure
    // ---------------------------------------------------------------

    function test_CloseJob_OnlyOwnerAndEmits() public {
        _fund(1 ether);
        vm.prank(buyer);
        vm.expectRevert(JobEscrow.NotOwner.selector);
        escrow.closeJob(JOB_ID);

        vm.expectEmit(true, false, false, true);
        emit JobClosed(JOB_ID, 1 ether);
        escrow.closeJob(JOB_ID);

        (,,, bool open,) = _job();
        assertFalse(open);
    }

    function test_CloseJob_RevertsIfMissing() public {
        vm.expectRevert(JobEscrow.JobNotFound.selector);
        escrow.closeJob(JOB_ID);
    }

    function test_CloseJob_RevertsIfAlreadyClosed() public {
        _fund(1 ether);
        escrow.closeJob(JOB_ID);
        vm.expectRevert(JobEscrow.JobClosedError.selector);
        escrow.closeJob(JOB_ID);
    }

    // ---------------------------------------------------------------
    // Settlement
    // ---------------------------------------------------------------

    function test_Settle_PaysContributorAndEmits() public {
        _fund(1 ether);
        uint256 before = contributor.balance;

        vm.expectEmit(true, true, true, true);
        emit TaskSettled(JOB_ID, TASK_ID, contributor, 0.25 ether, ANNOTATION_HASH);

        vm.prank(relayer);
        escrow.settle(JOB_ID, TASK_ID, payable(contributor), 0.25 ether, ANNOTATION_HASH);

        assertEq(contributor.balance, before + 0.25 ether);
        (, uint256 budget, uint256 paid,,) = _job();
        assertEq(budget, 1 ether);
        assertEq(paid, 0.25 ether);
        assertTrue(escrow.settled(escrow.taskKey(JOB_ID, TASK_ID)));
        assertEq(address(escrow).balance, 0.75 ether);
    }

    function test_Settle_TwoTasksWithinBudget() public {
        _fund(1 ether);
        vm.startPrank(relayer);
        escrow.settle(JOB_ID, TASK_ID, payable(contributor), 0.3 ether, ANNOTATION_HASH);
        escrow.settle(JOB_ID, TASK_ID_2, payable(contributor), 0.3 ether, ANNOTATION_HASH);
        vm.stopPrank();

        (,, uint256 paid,,) = _job();
        assertEq(paid, 0.6 ether);
    }

    function test_Settle_AllowedAfterClose() public {
        _fund(1 ether);
        escrow.closeJob(JOB_ID);
        vm.prank(relayer);
        escrow.settle(JOB_ID, TASK_ID, payable(contributor), 0.25 ether, ANNOTATION_HASH);
        assertEq(contributor.balance, 0.25 ether);
    }

    function test_Settle_RevertsForNonRelayer() public {
        _fund(1 ether);
        vm.prank(stranger);
        vm.expectRevert(JobEscrow.NotRelayer.selector);
        escrow.settle(JOB_ID, TASK_ID, payable(contributor), 0.25 ether, ANNOTATION_HASH);
    }

    function test_Settle_RevertsForOwnerWhoIsNotRelayer() public {
        _fund(1 ether);
        vm.expectRevert(JobEscrow.NotRelayer.selector);
        escrow.settle(JOB_ID, TASK_ID, payable(contributor), 0.25 ether, ANNOTATION_HASH);
    }

    function test_Settle_RevertsIfJobMissing() public {
        vm.prank(relayer);
        vm.expectRevert(JobEscrow.JobNotFound.selector);
        escrow.settle(JOB_ID, TASK_ID, payable(contributor), 0.25 ether, ANNOTATION_HASH);
    }

    function test_Settle_RevertsIfAlreadySettled() public {
        _fund(1 ether);
        vm.startPrank(relayer);
        escrow.settle(JOB_ID, TASK_ID, payable(contributor), 0.25 ether, ANNOTATION_HASH);
        vm.expectRevert(JobEscrow.AlreadySettled.selector);
        escrow.settle(JOB_ID, TASK_ID, payable(contributor), 0.25 ether, ANNOTATION_HASH);
        vm.stopPrank();
    }

    function test_Settle_DifferentJobsAllowSameTaskId() public {
        _fund(1 ether);
        vm.deal(stranger, 1 ether);
        vm.prank(stranger);
        escrow.fundJob{value: 1 ether}(keccak256("job-2"));

        vm.startPrank(relayer);
        escrow.settle(JOB_ID, TASK_ID, payable(contributor), 0.3 ether, ANNOTATION_HASH);
        escrow.settle(keccak256("job-2"), TASK_ID, payable(contributor), 0.3 ether, ANNOTATION_HASH);
        vm.stopPrank();
        assertEq(contributor.balance, 0.6 ether);
    }

    function test_Settle_RevertsOnOverBudget() public {
        _fund(1 ether);
        vm.prank(relayer);
        vm.expectRevert(JobEscrow.BudgetExceeded.selector);
        escrow.settle(JOB_ID, TASK_ID, payable(contributor), 1.1 ether, ANNOTATION_HASH);
    }

    function test_Settle_RevertsOnZeroAmount() public {
        _fund(1 ether);
        vm.prank(relayer);
        vm.expectRevert(JobEscrow.ZeroAmount.selector);
        escrow.settle(JOB_ID, TASK_ID, payable(contributor), 0, ANNOTATION_HASH);
    }

    function test_Settle_RevertsOnZeroPayee() public {
        _fund(1 ether);
        vm.prank(relayer);
        vm.expectRevert(JobEscrow.ZeroAddress.selector);
        escrow.settle(JOB_ID, TASK_ID, payable(address(0)), 0.1 ether, ANNOTATION_HASH);
    }

    function test_Settle_RevertsIfTransferFails() public {
        _fund(1 ether);
        RejectingPayee rejecting = new RejectingPayee();
        vm.prank(relayer);
        vm.expectRevert(JobEscrow.TransferFailed.selector);
        escrow.settle(JOB_ID, TASK_ID, payable(address(rejecting)), 0.1 ether, ANNOTATION_HASH);
    }

    /// @dev A relayer that tries to re-enter `settle` from its `receive` hook is
    ///      blocked by the reentrancy guard, so no second payout can occur.
    function test_Settle_ReentrancyBlocked() public {
        _fund(2 ether);
        ReentrantRelayer attacker = new ReentrantRelayer(escrow, JOB_ID, TASK_ID_2);
        escrow.setRelayer(address(attacker), true);

        vm.prank(relayer);
        escrow.settle(JOB_ID, TASK_ID, payable(address(attacker)), 0.5 ether, ANNOTATION_HASH);

        assertTrue(attacker.attempted());
        assertTrue(attacker.blocked());
        (,, uint256 paid,,) = _job();
        assertEq(paid, 0.5 ether); // only the outer payout happened
    }

    // ---------------------------------------------------------------
    // Withdrawal
    // ---------------------------------------------------------------

    function test_Withdraw_RejectsOpenJob() public {
        _fund(1 ether);
        vm.expectRevert(JobEscrow.JobNotClosed.selector);
        escrow.withdraw(JOB_ID, payable(stranger));
    }

    function test_Withdraw_OnlyOwner() public {
        _fund(1 ether);
        escrow.closeJob(JOB_ID);
        vm.prank(stranger);
        vm.expectRevert(JobEscrow.NotOwner.selector);
        escrow.withdraw(JOB_ID, payable(stranger));
    }

    function test_Withdraw_ReleasesUnspentAfterClose() public {
        _fund(1 ether);
        vm.prank(relayer);
        escrow.settle(JOB_ID, TASK_ID, payable(contributor), 0.25 ether, ANNOTATION_HASH);
        escrow.closeJob(JOB_ID);

        uint256 before = stranger.balance;
        vm.expectEmit(true, true, false, true);
        emit JobWithdrawn(JOB_ID, stranger, 0.75 ether);
        escrow.withdraw(JOB_ID, payable(stranger));

        assertEq(stranger.balance, before + 0.75 ether);
        (, uint256 budget, uint256 paid, bool open,) = _job();
        assertEq(budget, 0.25 ether);
        assertEq(paid, 0.25 ether);
        assertFalse(open);
    }

    function test_Withdraw_RevertsIfNothingUnspent() public {
        _fund(0.25 ether);
        vm.prank(relayer);
        escrow.settle(JOB_ID, TASK_ID, payable(contributor), 0.25 ether, ANNOTATION_HASH);
        escrow.closeJob(JOB_ID);
        vm.expectRevert(JobEscrow.NothingToWithdraw.selector);
        escrow.withdraw(JOB_ID, payable(stranger));
    }

    function test_Withdraw_RevertsIfJobMissing() public {
        vm.expectRevert(JobEscrow.JobNotFound.selector);
        escrow.withdraw(JOB_ID, payable(stranger));
    }

    // ---------------------------------------------------------------
    // Fuzz
    // ---------------------------------------------------------------

    function testFuzz_Settle_AnyAmountWithinBudget(uint96 amount) public {
        uint256 budget = 10 ether;
        _fund(budget);
        amount = uint96(bound(amount, 1, budget));

        vm.prank(relayer);
        escrow.settle(JOB_ID, TASK_ID, payable(contributor), amount, ANNOTATION_HASH);

        assertEq(contributor.balance, amount);
        assertEq(address(escrow).balance, budget - amount);
    }

    receive() external payable {}
}

/// @dev Always reverts on receive, to exercise the TransferFailed path.
contract RejectingPayee {
    receive() external payable {
        revert("reject");
    }
}

/**
 * @dev A relayer who tries to settle a second task while receiving the first
 *      payout. The guard must stop it; the inner revert is swallowed so the
 *      test can observe that the attempt was blocked.
 */
contract ReentrantRelayer {
    JobEscrow private escrow;
    bytes32 private jobId;
    bytes32 private taskId;
    bool public attempted;
    bool public blocked;

    constructor(JobEscrow _escrow, bytes32 _jobId, bytes32 _taskId) {
        escrow = _escrow;
        jobId = _jobId;
        taskId = _taskId;
    }

    receive() external payable {
        attempted = true;
        try escrow.settle(jobId, taskId, payable(address(this)), 1, bytes32(0)) {
        // should not succeed
        }
        catch {
            blocked = true;
        }
    }
}
