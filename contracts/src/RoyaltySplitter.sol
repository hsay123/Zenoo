// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev The subset of ERC-20 the splitter calls.
interface IERC20Transfer {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/**
 * @title RoyaltySplitter
 * @notice ROADMAP DEMO (HHG F5): splits one data-API payment in USDC between
 *         Zeno, the data owner and the contributors who labelled the data.
 *
 * @dev Default split 50% Zeno / 30% data owner / 20% contributors, in basis
 *      points, changeable by the owner. The contributors' share is divided by
 *      weight (e.g. each contributor's accepted-label count). Rounding dust
 *      goes to Zeno, so every split pays out exactly `amount`.
 *
 *      Custody-free: each share moves straight from the payer to its
 *      recipient with `transferFrom`, so the contract never holds a balance.
 *      Each `saleId` can be paid once, so a retried request cannot pay twice.
 */
contract RoyaltySplitter {
    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_CONTRIBUTORS = 100;

    IERC20Transfer public immutable token;
    address public owner;
    address public zeno;

    uint256 public zenoBps = 5_000;
    uint256 public dataOwnerBps = 3_000;
    uint256 public contributorsBps = 2_000;

    /// @notice saleId => already paid.
    mapping(bytes32 => bool) public paid;

    bool private _entered;

    event SplitPaid(
        bytes32 indexed saleId,
        address indexed payer,
        address indexed dataOwner,
        uint256 amount,
        uint256 zenoShare,
        uint256 dataOwnerShare,
        uint256 contributorsShare
    );
    event ContributorPaid(bytes32 indexed saleId, address indexed contributor, uint256 amount);
    event SplitChanged(uint256 zenoBps, uint256 dataOwnerBps, uint256 contributorsBps);
    event ZenoChanged(address indexed zeno);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error ZeroAddress();
    error ZeroAmount();
    error InvalidSplit();
    error AlreadyPaid();
    error NoContributors();
    error TooManyContributors();
    error LengthMismatch();
    error ZeroWeight();
    error TransferFailed();
    error Reentrancy();
    error TokenNotContract();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier nonReentrant() {
        if (_entered) revert Reentrancy();
        _entered = true;
        _;
        _entered = false;
    }

    constructor(address initialOwner, address zeno_, address token_) {
        if (initialOwner == address(0) || zeno_ == address(0) || token_ == address(0)) {
            revert ZeroAddress();
        }
        if (token_.code.length == 0) revert TokenNotContract();
        owner = initialOwner;
        zeno = zeno_;
        token = IERC20Transfer(token_);
        emit OwnershipTransferred(address(0), initialOwner);
        emit ZenoChanged(zeno_);
    }

    // ---------------------------------------------------------------
    // Administration
    // ---------------------------------------------------------------

    function setSplit(uint256 zenoBps_, uint256 dataOwnerBps_, uint256 contributorsBps_)
        external
        onlyOwner
    {
        if (zenoBps_ + dataOwnerBps_ + contributorsBps_ != BPS) revert InvalidSplit();
        zenoBps = zenoBps_;
        dataOwnerBps = dataOwnerBps_;
        contributorsBps = contributorsBps_;
        emit SplitChanged(zenoBps_, dataOwnerBps_, contributorsBps_);
    }

    function setZeno(address zeno_) external onlyOwner {
        if (zeno_ == address(0)) revert ZeroAddress();
        zeno = zeno_;
        emit ZenoChanged(zeno_);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ---------------------------------------------------------------
    // Payment
    // ---------------------------------------------------------------

    /// @notice The three shares (and each contributor's) for `amount`, without paying.
    function quote(uint256 amount, uint256[] calldata weights)
        public
        view
        returns (uint256 zenoShare, uint256 dataOwnerShare, uint256 contributorsShare, uint256[] memory perContributor)
    {
        dataOwnerShare = (amount * dataOwnerBps) / BPS;
        contributorsShare = (amount * contributorsBps) / BPS;

        uint256 totalWeight;
        for (uint256 i = 0; i < weights.length; i++) {
            if (weights[i] == 0) revert ZeroWeight();
            totalWeight += weights[i];
        }
        perContributor = new uint256[](weights.length);
        uint256 distributed;
        for (uint256 i = 0; i < weights.length; i++) {
            perContributor[i] = (contributorsShare * weights[i]) / totalWeight;
            distributed += perContributor[i];
        }
        contributorsShare = distributed;
        // Zeno takes its share plus all rounding dust: the parts sum to `amount`.
        zenoShare = amount - dataOwnerShare - distributed;
    }

    /**
     * @notice Pay one sale: pulls `amount` from the caller (who must have
     *         approved this contract) and splits it.
     * @param saleId       unique id of the data-API sale (pays once)
     * @param amount       USDC base units (6 decimals)
     * @param dataOwner    the buyer whose (opt-in) data was sold
     * @param contributors wallets of the contributors who labelled it
     * @param weights      each contributor's weight (e.g. accepted labels)
     */
    function pay(
        bytes32 saleId,
        uint256 amount,
        address dataOwner,
        address[] calldata contributors,
        uint256[] calldata weights
    ) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (dataOwner == address(0)) revert ZeroAddress();
        if (contributors.length == 0) revert NoContributors();
        if (contributors.length > MAX_CONTRIBUTORS) revert TooManyContributors();
        if (contributors.length != weights.length) revert LengthMismatch();
        if (paid[saleId]) revert AlreadyPaid();
        paid[saleId] = true;

        (uint256 zenoShare, uint256 dataOwnerShare, uint256 contributorsShare, uint256[] memory each) =
            quote(amount, weights);

        _pull(zeno, zenoShare);
        _pull(dataOwner, dataOwnerShare);
        for (uint256 i = 0; i < contributors.length; i++) {
            if (contributors[i] == address(0)) revert ZeroAddress();
            _pull(contributors[i], each[i]);
            emit ContributorPaid(saleId, contributors[i], each[i]);
        }

        emit SplitPaid(
            saleId, msg.sender, dataOwner, amount, zenoShare, dataOwnerShare, contributorsShare
        );
    }

    /// @dev transferFrom(payer -> to), reverting on failure or a `false` return.
    function _pull(address to, uint256 value) private {
        if (value == 0) return;
        (bool ok, bytes memory ret) = address(token).call(
            abi.encodeCall(IERC20Transfer.transferFrom, (msg.sender, to, value))
        );
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }
}
