// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev The subset of ERC-20 the escrow calls. USDC on Base has 6 decimals.
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title JobEscrow
 * @notice ERC-20 (USDC) escrow for Zeno annotation jobs on Base.
 *
 * @dev The token is fixed at deploy time. Every amount is in the token's base
 *      units (USDC: 6 decimals, so 1 USDC = 1_000_000). No function is payable:
 *      native value is rejected.
 *
 * @dev The platform database stays the source of truth for task/annotation
 *      state; the chain enforces only the money rules:
 *
 *        - only an allow-listed relayer may settle;
 *        - a task can be settled at most once;
 *        - cumulative payouts for a job can never exceed its funded budget;
 *        - the caller of {fundJob} is the recorded funder (no arbitrary arg);
 *        - a job must be explicitly closed before any unspent budget can be
 *          withdrawn, so the owner cannot drain a live job;
 *        - every settlement emits `TaskSettled`, which the backend verifies
 *          (receipt status + decoded event) before recording a real receipt.
 *
 *      Roles (deliberately separate):
 *        - owner    : deploys, manages relayers, closes jobs, reclaims unspent
 *                     escrow. Never a relayer unless explicitly set later.
 *        - relayer  : the backend signer (`SETTLEMENT_PRIVATE_KEY`), server-only.
 *        - buyer    : the first caller of {fundJob} for a job; may top it up.
 *                     It must first `approve` this contract for the amount.
 *
 *      Closure rule: {settle} remains callable after {closeJob} so already
 *      accepted obligations can still be paid. The platform must therefore
 *      close a job only once every accepted-but-unsettled obligation has been
 *      settled (or the operator accepts that further settlement will be
 *      under-funded). This is enforced operationally and tested here.
 */
contract JobEscrow {
    struct Job {
        address buyer; // first funder; only this address may add funds
        uint256 budget; // total token units deposited
        uint256 paid; // total token units settled
        bool open; // false once closeJob() is called
        bool exists;
    }

    /// @notice Deployer/admin; may manage relayers, close jobs and withdraw.
    address public owner;

    /// @notice The ERC-20 this escrow holds and pays out (USDC).
    IERC20 public immutable token;

    /// @notice Settlement ABI/behaviour revision. The backend settlement
    ///         preflight refuses any escrow that does not report this exact
    ///         value, so a stale or unexpected deployment (one that merely
    ///         happens to expose `owner`/`relayers`) can never receive real
    ///         payouts. Bump this whenever the settlement interface changes and
    ///         the backend's expected value in tandem.
    ///         v3: ERC-20 token escrow (was native MON in v2).
    uint256 public constant SETTLEMENT_ABI_VERSION = 3;

    /// @notice Backend signer(s) allowed to call {settle}.
    mapping(address => bool) public relayers;

    /// @notice Per-job escrow ledger, keyed by keccak256(platform job id).
    mapping(bytes32 => Job) public jobs;

    /// @notice taskKey => settled, where taskKey = keccak256(jobId, taskId).
    mapping(bytes32 => bool) public settled;

    bool private _entered;

    event JobFunded(bytes32 indexed jobId, address indexed funder, uint256 amount);
    event JobClosed(bytes32 indexed jobId, uint256 unspent);
    event TaskSettled(
        bytes32 indexed jobId,
        bytes32 indexed taskId,
        address indexed payee,
        uint256 amount,
        bytes32 annotationHash
    );
    event RelayerSet(address indexed relayer, bool allowed);
    event JobWithdrawn(bytes32 indexed jobId, address indexed to, uint256 amount);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error NotRelayer();
    error NotBuyer();
    error JobNotFound();
    error JobClosedError();
    error JobNotClosed();
    error AlreadySettled();
    error BudgetExceeded();
    error ZeroAmount();
    error ZeroAddress();
    error TransferFailed();
    error NothingToWithdraw();
    error Reentrancy();
    error IdenticalOwnerAndRelayer();
    error TokenNotContract();
    error UnexpectedTokenBalance();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyRelayer() {
        if (!relayers[msg.sender]) revert NotRelayer();
        _;
    }

    /// @dev Minimal non-reentrant guard around external transfers.
    modifier nonReentrant() {
        _nonReentrantBefore();
        _;
        _nonReentrantAfter();
    }

    function _nonReentrantBefore() private {
        if (_entered) revert Reentrancy();
        _entered = true;
    }

    function _nonReentrantAfter() private {
        _entered = false;
    }

    /**
     * @param initialOwner  admin address (manages relayers / closes jobs)
     * @param relayer       backend settlement signer (server-only)
     * @param token_        ERC-20 to escrow (USDC on Base / Base Sepolia)
     */
    constructor(address initialOwner, address relayer, address token_) {
        if (initialOwner == address(0) || relayer == address(0) || token_ == address(0)) {
            revert ZeroAddress();
        }
        if (initialOwner == relayer) revert IdenticalOwnerAndRelayer();
        if (token_.code.length == 0) revert TokenNotContract();
        owner = initialOwner;
        token = IERC20(token_);
        relayers[relayer] = true;
        emit OwnershipTransferred(address(0), initialOwner);
        emit RelayerSet(relayer, true);
    }

    // ---------------------------------------------------------------
    // Administration
    // ---------------------------------------------------------------

    /// @notice Allow or revoke a settlement relayer.
    function setRelayer(address relayer, bool allowed) external onlyOwner {
        if (relayer == address(0)) revert ZeroAddress();
        relayers[relayer] = allowed;
        emit RelayerSet(relayer, allowed);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ---------------------------------------------------------------
    // Funding
    // ---------------------------------------------------------------

    /**
     * @notice Deposit tokens against a job. The caller is the funder and must
     *         have approved this contract for `amount` first.
     * @dev The first caller becomes the job's `buyer` and may top it up; any
     *      other address is rejected so audit records cannot be spoofed. The
     *      budget is credited only with what actually arrived, and only if that
     *      equals `amount`, so a fee-on-transfer or misbehaving token can never
     *      inflate a job's budget.
     * @param jobId  keccak256 of the platform job id.
     * @param amount token base units (USDC: 6 decimals).
     */
    function fundJob(bytes32 jobId, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();

        Job storage job = jobs[jobId];
        if (!job.exists) {
            job.buyer = msg.sender;
            job.open = true;
            job.exists = true;
        } else {
            if (!job.open) revert JobClosedError();
            if (job.buyer != msg.sender) revert NotBuyer();
        }

        uint256 before = token.balanceOf(address(this));
        _safeCall(abi.encodeCall(IERC20.transferFrom, (msg.sender, address(this), amount)));
        if (token.balanceOf(address(this)) - before != amount) revert UnexpectedTokenBalance();

        job.budget += amount;
        emit JobFunded(jobId, msg.sender, amount);
    }

    // ---------------------------------------------------------------
    // Closure
    // ---------------------------------------------------------------

    /**
     * @notice Freeze a job's funding so its unspent balance can be withdrawn.
     * @dev Call only after every accepted-but-unsettled task has been settled.
     */
    function closeJob(bytes32 jobId) external onlyOwner {
        Job storage job = jobs[jobId];
        if (!job.exists) revert JobNotFound();
        if (!job.open) revert JobClosedError();
        job.open = false;
        emit JobClosed(jobId, job.budget - job.paid);
    }

    // ---------------------------------------------------------------
    // Settlement
    // ---------------------------------------------------------------

    /**
     * @notice Pay a task's contributor. Allowed while the job is open or closed
     *         so accepted obligations can still clear after closure.
     */
    function settle(
        bytes32 jobId,
        bytes32 taskId,
        address payee,
        uint256 amount,
        bytes32 annotationHash
    ) external onlyRelayer nonReentrant {
        if (payee == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        Job storage job = jobs[jobId];
        if (!job.exists) revert JobNotFound();

        bytes32 key = _taskKey(jobId, taskId);
        if (settled[key]) revert AlreadySettled();
        if (job.paid + amount > job.budget) revert BudgetExceeded();

        // Effects before interaction.
        settled[key] = true;
        job.paid += amount;

        _safeCall(abi.encodeCall(IERC20.transfer, (payee, amount)));

        emit TaskSettled(jobId, taskId, payee, amount, annotationHash);
    }

    // ---------------------------------------------------------------
    // Withdrawal
    // ---------------------------------------------------------------

    /// @notice Reclaim a closed job's unspent escrow (owner only).
    function withdraw(bytes32 jobId, address to) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        Job storage job = jobs[jobId];
        if (!job.exists) revert JobNotFound();
        if (job.open) revert JobNotClosed();

        uint256 remaining = job.budget - job.paid;
        if (remaining == 0) revert NothingToWithdraw();

        job.budget = job.paid;
        _safeCall(abi.encodeCall(IERC20.transfer, (to, remaining)));

        emit JobWithdrawn(jobId, to, remaining);
    }

    // ---------------------------------------------------------------
    // Token transfer
    // ---------------------------------------------------------------

    /// @dev Call the token and revert unless it succeeded: the call must not
    ///      revert, and if it returns data that data must decode to `true`.
    ///      Covers tokens that return `false` instead of reverting.
    function _safeCall(bytes memory data) private {
        (bool ok, bytes memory ret) = address(token).call(data);
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }

    // ---------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------

    /// @notice Canonical key for a (job, task) pair; matches the backend helper.
    function taskKey(bytes32 jobId, bytes32 taskId) external pure returns (bytes32) {
        return _taskKey(jobId, taskId);
    }

    function _taskKey(bytes32 jobId, bytes32 taskId) private pure returns (bytes32) {
        // forge-lint: disable-next-line(asm-keccak256) -- clarity over a hand-written hash loop
        return keccak256(abi.encodePacked(jobId, taskId));
    }
}
