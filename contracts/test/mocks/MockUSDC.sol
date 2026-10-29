// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @dev Minimal 6-decimal ERC-20 standing in for USDC in tests.
 *
 *      Test-only switches model the ways a real token can fail:
 *        - `blocked[addr]`  : transfers to/from addr revert (USDC blacklist);
 *        - `returnFalse`    : transfers return `false` instead of reverting;
 *        - `feeBps`         : the recipient receives less than `amount`.
 */
contract MockUSDC {
    string public constant name = "Mock USD Coin";
    string public constant symbol = "USDC";
    uint8 public constant decimals = 6;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    mapping(address => bool) public blocked;
    bool public returnFalse;
    uint256 public feeBps;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function setBlocked(address who, bool value) external {
        blocked[who] = value;
    }

    function setReturnFalse(bool value) external {
        returnFalse = value;
    }

    function setFeeBps(uint256 value) external {
        feeBps = value;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external virtual returns (bool) {
        return _transfer(msg.sender, to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (returnFalse) return false;
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "MockUSDC: insufficient allowance");
        allowance[from][msg.sender] = allowed - amount;
        return _transfer(from, to, amount);
    }

    function _transfer(address from, address to, uint256 amount) internal returns (bool) {
        if (returnFalse) return false;
        require(!blocked[from] && !blocked[to], "MockUSDC: blocked");
        require(balanceOf[from] >= amount, "MockUSDC: insufficient balance");
        uint256 fee = (amount * feeBps) / 10_000;
        balanceOf[from] -= amount;
        balanceOf[to] += amount - fee;
        totalSupply -= fee;
        emit Transfer(from, to, amount - fee);
        return true;
    }
}

interface IJobEscrowSettle {
    function settle(
        bytes32 jobId,
        bytes32 taskId,
        address payee,
        uint256 amount,
        bytes32 annotationHash
    ) external;
}

/**
 * @dev A malicious token that tries to re-enter `settle` while the escrow is
 *      paying out. The escrow's guard must stop it; the inner revert is
 *      swallowed so the test can observe that the attempt was blocked.
 */
contract ReentrantUSDC is MockUSDC {
    IJobEscrowSettle public target;
    bytes32 private jobId;
    bytes32 private taskId;
    bool public attempted;
    bool public blockedReentry;

    function arm(IJobEscrowSettle target_, bytes32 jobId_, bytes32 taskId_) external {
        target = target_;
        jobId = jobId_;
        taskId = taskId_;
    }

    function transfer(address to, uint256 amount) external override returns (bool) {
        if (address(target) != address(0) && msg.sender == address(target) && !attempted) {
            attempted = true;
            try target.settle(jobId, taskId, to, 1, bytes32(0)) {
            // should not succeed
            }
            catch {
                blockedReentry = true;
            }
        }
        return _transfer(msg.sender, to, amount);
    }
}
