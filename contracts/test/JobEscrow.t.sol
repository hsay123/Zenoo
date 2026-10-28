// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {JobEscrow} from "../src/JobEscrow.sol";
import {MockUSDC, ReentrantUSDC, IJobEscrowSettle} from "./mocks/MockUSDC.sol";

/**
 * @dev Money-rule and access-control tests for {JobEscrow} holding a 6-decimal
 *      USDC-like token.
 *
 *      The test contract is the deployer, so it is the `owner` but — by design —
 *      NOT a relayer. A distinct `relayer` address signs settlements, mirroring
 *      the backend signer being separate from the admin/owner.
 *
 *      All amounts are token base units: `USDC` = 1_000_000 = 1.0 USDC.
 */
contract JobEscrowTest is Test {
    uint256 internal constant USDC = 1e6;

    JobEscrow internal escrow;
    MockUSDC internal usdc;

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
        usdc = new MockUSDC();
        escrow = new JobEscrow(owner, relayer, address(usdc));
        assertEq(escrow.owner(), owner);
        assertTrue(escrow.relayers(relayer));
        assertFalse(escrow.relayers(owner)); // owner is NOT a relayer by default
    }

    // ---------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------

    /// @dev Mint, approve and fund `amount` as `who` against `jobId`.
    function _fundAs(address who, bytes32 jobId, uint256 amount) internal {
        usdc.mint(who, amount);
        vm.startPrank(who);
        usdc.approve(address(escrow), amount);
        escrow.fundJob(jobId, amount);
        vm.stopPrank();
    }

    function _fund(uint256 amount) internal {
        _fundAs(buyer, JOB_ID, amount);
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
        new JobEscrow(stranger, stranger, address(usdc));
    }

    function test_Constructor_RejectsZeroAddresses() public {
        vm.expectRevert(JobEscrow.ZeroAddress.selector);
        new JobEscrow(address(0), relayer, address(usdc));
        vm.expectRevert(JobEscrow.ZeroAddress.selector);
        new JobEscrow(owner, address(0), address(usdc));
        vm.expectRevert(JobEscrow.ZeroAddress.selector);
        new JobEscrow(owner, relayer, address(0));
    }

    function test_Constructor_RejectsTokenWithoutCode() public {
        vm.expectRevert(JobEscrow.TokenNotContract.selector);
        new JobEscrow(owner, relayer, stranger);
    }

    function test_Constructor_RecordsToken() public view {
        assertEq(address(escrow.token()), address(usdc));
        assertEq(usdc.decimals(), 6);
    }

    function test_Constructor_ReportsSettlementAbiVersion() public view {
        // The backend fail-closed preflight gates real settlement on this value:
        // an escrow that does not report it is treated as stale and never paid.
        // v3 = ERC-20 escrow; the v2 native-MON escrow must be refused.
        assertEq(escrow.SETTLEMENT_ABI_VERSION(), 3);
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
        usdc.mint(buyer, 1 * USDC);
        vm.prank(buyer);
        usdc.approve(address(escrow), 1 * USDC);

        vm.expectEmit(true, true, false, true);
        emit JobFunded(JOB_ID, buyer, 1 * USDC);
        vm.prank(buyer);
        escrow.fundJob(JOB_ID, 1 * USDC);

        (address jobBuyer, uint256 budget, uint256 paid, bool open, bool exists) = _job();
        assertEq(jobBuyer, buyer);
        assertEq(budget, 1 * USDC);
        assertEq(paid, 0);
        assertTrue(open);
        assertTrue(exists);
        assertEq(usdc.balanceOf(address(escrow)), 1 * USDC);
        assertEq(usdc.balanceOf(buyer), 0);
    }

    function test_FundJob_SixDecimalAmounts() public {
        // 0.04 USDC (the PRD's per-box contributor reward) is 40_000 base units.
        _fund(40_000);
        (, uint256 budget,,,) = _job();
        assertEq(budget, 40_000);

        // The smallest representable amount, 0.000001 USDC, is 1 base unit.
        usdc.mint(buyer, 1);
        vm.startPrank(buyer);
        usdc.approve(address(escrow), 1);
        escrow.fundJob(JOB_ID, 1);
        vm.stopPrank();
        (, budget,,,) = _job();
        assertEq(budget, 40_001);
    }

    function test_FundJob_BuyerCanTopUp() public {
        _fund(400_000);
        _fund(600_000);

        (, uint256 budget,,,) = _job();
        assertEq(budget, 1 * USDC);
        assertEq(usdc.balanceOf(address(escrow)), 1 * USDC);
    }

    function test_FundJob_RejectsNonBuyerTopUp() public {
        _fund(400_000);
        usdc.mint(stranger, 1 * USDC);
        vm.startPrank(stranger);
        usdc.approve(address(escrow), 400_000);
        vm.expectRevert(JobEscrow.NotBuyer.selector);
        escrow.fundJob(JOB_ID, 400_000);
        vm.stopPrank();
    }

    function test_FundJob_RejectsZeroAmount() public {
        vm.prank(buyer);
        vm.expectRevert(JobEscrow.ZeroAmount.selector);
        escrow.fundJob(JOB_ID, 0);
    }

    function test_FundJob_RejectsWhenClosed() public {
        _fund(1 * USDC);
        escrow.closeJob(JOB_ID);
        usdc.mint(buyer, 1 * USDC);
        vm.startPrank(buyer);
        usdc.approve(address(escrow), 500_000);
        vm.expectRevert(JobEscrow.JobClosedError.selector);
        escrow.fundJob(JOB_ID, 500_000);
        vm.stopPrank();
    }

    function test_FundJob_RevertsWithoutApproval() public {
        usdc.mint(buyer, 1 * USDC);
        vm.prank(buyer);
        vm.expectRevert(JobEscrow.TransferFailed.selector);
        escrow.fundJob(JOB_ID, 1 * USDC);

        (,,,, bool exists) = _job();
        assertFalse(exists); // nothing recorded
    }

    function test_FundJob_RevertsWithInsufficientApproval() public {
        usdc.mint(buyer, 1 * USDC);
        vm.startPrank(buyer);
        usdc.approve(address(escrow), 999_999);
        vm.expectRevert(JobEscrow.TransferFailed.selector);
        escrow.fundJob(JOB_ID, 1 * USDC);
        vm.stopPrank();
    }

    function test_FundJob_RevertsWithInsufficientBalance() public {
        usdc.mint(buyer, 500_000);
        vm.startPrank(buyer);
        usdc.approve(address(escrow), 1 * USDC);
        vm.expectRevert(JobEscrow.TransferFailed.selector);
        escrow.fundJob(JOB_ID, 1 * USDC);
        vm.stopPrank();
        assertEq(usdc.balanceOf(buyer), 500_000);
    }

    function test_FundJob_RevertsWhenTokenReturnsFalse() public {
        usdc.mint(buyer, 1 * USDC);
        vm.prank(buyer);
        usdc.approve(address(escrow), 1 * USDC);
        usdc.setReturnFalse(true);

        vm.prank(buyer);
        vm.expectRevert(JobEscrow.TransferFailed.selector);
        escrow.fundJob(JOB_ID, 1 * USDC);
    }

    function test_FundJob_RevertsOnFeeOnTransferShortfall() public {
        usdc.setFeeBps(100); // recipient receives 1% less than sent
        usdc.mint(buyer, 1 * USDC);
        vm.startPrank(buyer);
        usdc.approve(address(escrow), 1 * USDC);
        vm.expectRevert(JobEscrow.UnexpectedTokenBalance.selector);
        escrow.fundJob(JOB_ID, 1 * USDC);
        vm.stopPrank();
    }

    function test_FundJob_RejectsNativeValue() public {
        vm.deal(buyer, 1 ether);
        vm.prank(buyer);
        (bool ok,) = address(escrow).call{value: 1 ether}(
            abi.encodeCall(JobEscrow.fundJob, (JOB_ID, 1 * USDC))
        );
        assertFalse(ok);
        assertEq(address(escrow).balance, 0);
    }

    function test_RejectsPlainNativeTransfer() public {
        vm.deal(buyer, 1 ether);
        vm.prank(buyer);
        (bool ok,) = address(escrow).call{value: 1 ether}("");
        assertFalse(ok);
        assertEq(address(escrow).balance, 0);
    }

    // ---------------------------------------------------------------
    // Closure
    // ---------------------------------------------------------------

    function test_CloseJob_OnlyOwnerAndEmits() public {
        _fund(1 * USDC);
        vm.prank(buyer);
        vm.expectRevert(JobEscrow.NotOwner.selector);
        escrow.closeJob(JOB_ID);

        vm.expectEmit(true, false, false, true);
        emit JobClosed(JOB_ID, 1 * USDC);
        escrow.closeJob(JOB_ID);

        (,,, bool open,) = _job();
        assertFalse(open);
    }

    function test_CloseJob_RevertsIfMissing() public {
        vm.expectRevert(JobEscrow.JobNotFound.selector);
        escrow.closeJob(JOB_ID);
    }

    function test_CloseJob_RevertsIfAlreadyClosed() public {
        _fund(1 * USDC);
        escrow.closeJob(JOB_ID);
        vm.expectRevert(JobEscrow.JobClosedError.selector);
        escrow.closeJob(JOB_ID);
    }

    // ---------------------------------------------------------------
    // Settlement
    // ---------------------------------------------------------------

    function test_Settle_PaysContributorAndEmits() public {
        _fund(1 * USDC);
        uint256 before = usdc.balanceOf(contributor);

        vm.expectEmit(true, true, true, true);
        emit TaskSettled(JOB_ID, TASK_ID, contributor, 250_000, ANNOTATION_HASH);

        vm.prank(relayer);
        escrow.settle(JOB_ID, TASK_ID, contributor, 250_000, ANNOTATION_HASH);

        assertEq(usdc.balanceOf(contributor), before + 250_000);
        (, uint256 budget, uint256 paid,,) = _job();
        assertEq(budget, 1 * USDC);
        assertEq(paid, 250_000);
        assertTrue(escrow.settled(escrow.taskKey(JOB_ID, TASK_ID)));
        assertEq(usdc.balanceOf(address(escrow)), 750_000);
    }

    function test_Settle_PaysPrdRewardExactly() public {
        // PRD pricing: contributor receives 0.04 USDC per accepted box.
        _fund(1 * USDC);
        vm.prank(relayer);
        escrow.settle(JOB_ID, TASK_ID, contributor, 40_000, ANNOTATION_HASH);
        assertEq(usdc.balanceOf(contributor), 40_000);
    }

    function test_Settle_TwoTasksWithinBudget() public {
        _fund(1 * USDC);
        vm.startPrank(relayer);
        escrow.settle(JOB_ID, TASK_ID, contributor, 300_000, ANNOTATION_HASH);
        escrow.settle(JOB_ID, TASK_ID_2, contributor, 300_000, ANNOTATION_HASH);
        vm.stopPrank();

        (,, uint256 paid,,) = _job();
        assertEq(paid, 600_000);
    }

    function test_Settle_AllowedAfterClose() public {
        _fund(1 * USDC);
        escrow.closeJob(JOB_ID);
        vm.prank(relayer);
        escrow.settle(JOB_ID, TASK_ID, contributor, 250_000, ANNOTATION_HASH);
        assertEq(usdc.balanceOf(contributor), 250_000);
    }

    function test_Settle_RevertsForNonRelayer() public {
        _fund(1 * USDC);
        vm.prank(stranger);
        vm.expectRevert(JobEscrow.NotRelayer.selector);
        escrow.settle(JOB_ID, TASK_ID, contributor, 250_000, ANNOTATION_HASH);
    }

    function test_Settle_RevertsForOwnerWhoIsNotRelayer() public {
        _fund(1 * USDC);
        vm.expectRevert(JobEscrow.NotRelayer.selector);
        escrow.settle(JOB_ID, TASK_ID, contributor, 250_000, ANNOTATION_HASH);
    }

    function test_Settle_RevertsIfJobMissing() public {
        vm.prank(relayer);
        vm.expectRevert(JobEscrow.JobNotFound.selector);
        escrow.settle(JOB_ID, TASK_ID, contributor, 250_000, ANNOTATION_HASH);
    }

    function test_Settle_RevertsIfAlreadySettled() public {
        _fund(1 * USDC);
        vm.startPrank(relayer);
        escrow.settle(JOB_ID, TASK_ID, contributor, 250_000, ANNOTATION_HASH);
        vm.expectRevert(JobEscrow.AlreadySettled.selector);
        escrow.settle(JOB_ID, TASK_ID, contributor, 250_000, ANNOTATION_HASH);
        vm.stopPrank();
    }

    function test_Settle_DifferentJobsAllowSameTaskId() public {
        _fund(1 * USDC);
        _fundAs(stranger, keccak256("job-2"), 1 * USDC);

        vm.startPrank(relayer);
        escrow.settle(JOB_ID, TASK_ID, contributor, 300_000, ANNOTATION_HASH);
        escrow.settle(keccak256("job-2"), TASK_ID, contributor, 300_000, ANNOTATION_HASH);
        vm.stopPrank();
        assertEq(usdc.balanceOf(contributor), 600_000);
    }

    function test_Settle_RevertsOnOverBudget() public {
        _fund(1 * USDC);
        vm.prank(relayer);
        vm.expectRevert(JobEscrow.BudgetExceeded.selector);
        escrow.settle(JOB_ID, TASK_ID, contributor, 1_100_000, ANNOTATION_HASH);
    }

    /// @dev One job's budget can never be paid out of another job's escrow,
    ///      even though both sit in the same token balance.
    function test_Settle_RevertsOnOverBudgetWhenOtherJobsHoldFunds() public {
        _fund(100_000);
        _fundAs(stranger, keccak256("job-2"), 10 * USDC);
        vm.prank(relayer);
        vm.expectRevert(JobEscrow.BudgetExceeded.selector);
        escrow.settle(JOB_ID, TASK_ID, contributor, 100_001, ANNOTATION_HASH);
    }

    function test_Settle_RevertsOnZeroAmount() public {
        _fund(1 * USDC);
        vm.prank(relayer);
        vm.expectRevert(JobEscrow.ZeroAmount.selector);
        escrow.settle(JOB_ID, TASK_ID, contributor, 0, ANNOTATION_HASH);
    }

    function test_Settle_RevertsOnZeroPayee() public {
        _fund(1 * USDC);
        vm.prank(relayer);
        vm.expectRevert(JobEscrow.ZeroAddress.selector);
        escrow.settle(JOB_ID, TASK_ID, address(0), 100_000, ANNOTATION_HASH);
    }

    /// @dev A payee the token refuses (e.g. USDC-blacklisted) reverts the whole
    ///      settlement: the task stays unsettled and nothing is counted as paid.
    function test_Settle_RevertsIfTransferFails() public {
        _fund(1 * USDC);
        usdc.setBlocked(contributor, true);
        vm.prank(relayer);
        vm.expectRevert(JobEscrow.TransferFailed.selector);
        escrow.settle(JOB_ID, TASK_ID, contributor, 100_000, ANNOTATION_HASH);

        (,, uint256 paid,,) = _job();
        assertEq(paid, 0);
        assertFalse(escrow.settled(escrow.taskKey(JOB_ID, TASK_ID)));
    }

    function test_Settle_RevertsWhenTokenReturnsFalse() public {
        _fund(1 * USDC);
        usdc.setReturnFalse(true);
        vm.prank(relayer);
        vm.expectRevert(JobEscrow.TransferFailed.selector);
        escrow.settle(JOB_ID, TASK_ID, contributor, 100_000, ANNOTATION_HASH);
        assertFalse(escrow.settled(escrow.taskKey(JOB_ID, TASK_ID)));
    }

    /// @dev A token that tries to re-enter `settle` during the payout is
    ///      blocked by the reentrancy guard, so no second payout can occur.
    function test_Settle_ReentrancyBlocked() public {
        ReentrantUSDC evil = new ReentrantUSDC();
        JobEscrow evilEscrow = new JobEscrow(owner, relayer, address(evil));
        // Make the token a relayer so only the reentrancy guard can stop it.
        evilEscrow.setRelayer(address(evil), true);
        evil.arm(IJobEscrowSettle(address(evilEscrow)), JOB_ID, TASK_ID_2);

        evil.mint(buyer, 2 * USDC);
        vm.startPrank(buyer);
        evil.approve(address(evilEscrow), 2 * USDC);
        evilEscrow.fundJob(JOB_ID, 2 * USDC);
        vm.stopPrank();

        vm.prank(relayer);
        evilEscrow.settle(JOB_ID, TASK_ID, contributor, 500_000, ANNOTATION_HASH);

        assertTrue(evil.attempted());
        assertTrue(evil.blockedReentry());
        (,, uint256 paid,,) = evilEscrow.jobs(JOB_ID);
        assertEq(paid, 500_000); // only the outer payout happened
        assertFalse(evilEscrow.settled(evilEscrow.taskKey(JOB_ID, TASK_ID_2)));
    }

    // ---------------------------------------------------------------
    // Withdrawal
    // ---------------------------------------------------------------

    function test_Withdraw_RejectsOpenJob() public {
        _fund(1 * USDC);
        vm.expectRevert(JobEscrow.JobNotClosed.selector);
        escrow.withdraw(JOB_ID, stranger);
    }

    function test_Withdraw_OnlyOwner() public {
        _fund(1 * USDC);
        escrow.closeJob(JOB_ID);
        vm.prank(stranger);
        vm.expectRevert(JobEscrow.NotOwner.selector);
        escrow.withdraw(JOB_ID, stranger);
    }

    function test_Withdraw_ReleasesUnspentAfterClose() public {
        _fund(1 * USDC);
        vm.prank(relayer);
        escrow.settle(JOB_ID, TASK_ID, contributor, 250_000, ANNOTATION_HASH);
        escrow.closeJob(JOB_ID);

        uint256 before = usdc.balanceOf(stranger);
        vm.expectEmit(true, true, false, true);
        emit JobWithdrawn(JOB_ID, stranger, 750_000);
        escrow.withdraw(JOB_ID, stranger);

        assertEq(usdc.balanceOf(stranger), before + 750_000);
        (, uint256 budget, uint256 paid, bool open,) = _job();
        assertEq(budget, 250_000);
        assertEq(paid, 250_000);
        assertFalse(open);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_Withdraw_OnlyReleasesThatJobsUnspent() public {
        _fund(1 * USDC);
        _fundAs(stranger, keccak256("job-2"), 5 * USDC);
        escrow.closeJob(JOB_ID);
        escrow.withdraw(JOB_ID, owner);
        assertEq(usdc.balanceOf(owner), 1 * USDC);
        assertEq(usdc.balanceOf(address(escrow)), 5 * USDC); // job-2 untouched
    }

    function test_Withdraw_RevertsIfNothingUnspent() public {
        _fund(250_000);
        vm.prank(relayer);
        escrow.settle(JOB_ID, TASK_ID, contributor, 250_000, ANNOTATION_HASH);
        escrow.closeJob(JOB_ID);
        vm.expectRevert(JobEscrow.NothingToWithdraw.selector);
        escrow.withdraw(JOB_ID, stranger);
    }

    function test_Withdraw_RevertsIfJobMissing() public {
        vm.expectRevert(JobEscrow.JobNotFound.selector);
        escrow.withdraw(JOB_ID, stranger);
    }

    function test_Withdraw_RevertsIfTransferFails() public {
        _fund(1 * USDC);
        escrow.closeJob(JOB_ID);
        usdc.setBlocked(stranger, true);
        vm.expectRevert(JobEscrow.TransferFailed.selector);
        escrow.withdraw(JOB_ID, stranger);
        (, uint256 budget,,,) = _job();
        assertEq(budget, 1 * USDC); // nothing released
    }

    // ---------------------------------------------------------------
    // Fuzz
    // ---------------------------------------------------------------

    function testFuzz_Settle_AnyAmountWithinBudget(uint64 amount) public {
        uint256 budget = 10_000 * USDC;
        _fund(budget);
        amount = uint64(bound(amount, 1, budget));

        vm.prank(relayer);
        escrow.settle(JOB_ID, TASK_ID, contributor, amount, ANNOTATION_HASH);

        assertEq(usdc.balanceOf(contributor), amount);
        assertEq(usdc.balanceOf(address(escrow)), budget - amount);
    }

    function testFuzz_FundJob_BudgetEqualsDeposits(uint64 a, uint64 b) public {
        a = uint64(bound(a, 1, 1_000_000 * USDC));
        b = uint64(bound(b, 1, 1_000_000 * USDC));
        _fund(a);
        _fund(b);
        (, uint256 budget,,,) = _job();
        assertEq(budget, uint256(a) + b);
        assertEq(usdc.balanceOf(address(escrow)), uint256(a) + b);
    }
}
