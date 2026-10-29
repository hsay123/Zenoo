// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {RoyaltySplitter} from "../src/RoyaltySplitter.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

/// @dev Royalty split tests (HHG F5 roadmap demo). Amounts in USDC base units.
contract RoyaltySplitterTest is Test {
    uint256 internal constant USDC = 1e6;

    RoyaltySplitter internal splitter;
    MockUSDC internal usdc;

    address internal owner = address(this);
    address internal zeno = address(0x2E70);
    address internal payer = address(0xB0B);
    address internal dataOwner = address(0xDA7A);
    address internal c1 = address(0xC1);
    address internal c2 = address(0xC2);
    address internal c3 = address(0xC3);

    bytes32 internal constant SALE = keccak256("sale-1");

    event SplitPaid(
        bytes32 indexed saleId,
        address indexed payer,
        address indexed dataOwner,
        uint256 amount,
        uint256 zenoShare,
        uint256 dataOwnerShare,
        uint256 contributorsShare
    );

    function setUp() public {
        usdc = new MockUSDC();
        splitter = new RoyaltySplitter(owner, zeno, address(usdc));
    }

    function _approve(uint256 amount) internal {
        usdc.mint(payer, amount);
        vm.prank(payer);
        usdc.approve(address(splitter), amount);
    }

    function _one(address a) internal pure returns (address[] memory list) {
        list = new address[](1);
        list[0] = a;
    }

    function _w(uint256 a) internal pure returns (uint256[] memory list) {
        list = new uint256[](1);
        list[0] = a;
    }

    // ---------------------------------------------------------------
    // Default split
    // ---------------------------------------------------------------

    function test_DefaultSplitIs50_30_20() public view {
        assertEq(splitter.zenoBps(), 5000);
        assertEq(splitter.dataOwnerBps(), 3000);
        assertEq(splitter.contributorsBps(), 2000);
    }

    function test_Pay_SplitsOneUsdcExactly() public {
        _approve(1 * USDC);
        vm.expectEmit(true, true, true, true);
        emit SplitPaid(SALE, payer, dataOwner, 1_000_000, 500_000, 300_000, 200_000);
        vm.prank(payer);
        splitter.pay(SALE, 1 * USDC, dataOwner, _one(c1), _w(1));

        assertEq(usdc.balanceOf(zeno), 500_000);
        assertEq(usdc.balanceOf(dataOwner), 300_000);
        assertEq(usdc.balanceOf(c1), 200_000);
        assertEq(usdc.balanceOf(payer), 0);
        assertEq(usdc.balanceOf(address(splitter)), 0); // custody-free
    }

    function test_Pay_WeightsContributorsByAcceptedLabels() public {
        _approve(10 * USDC); // contributors' share = 2 USDC
        address[] memory list = new address[](2);
        list[0] = c1;
        list[1] = c2;
        uint256[] memory weights = new uint256[](2);
        weights[0] = 3; // 3 accepted labels
        weights[1] = 1; // 1 accepted label
        vm.prank(payer);
        splitter.pay(SALE, 10 * USDC, dataOwner, list, weights);

        assertEq(usdc.balanceOf(c1), 1_500_000);
        assertEq(usdc.balanceOf(c2), 500_000);
        assertEq(usdc.balanceOf(zeno), 5_000_000);
        assertEq(usdc.balanceOf(dataOwner), 3_000_000);
    }

    function test_Pay_RoundingDustGoesToZenoAndTotalIsExact() public {
        _approve(1_000_001);
        address[] memory list = new address[](3);
        list[0] = c1;
        list[1] = c2;
        list[2] = c3;
        uint256[] memory weights = new uint256[](3);
        weights[0] = 1;
        weights[1] = 1;
        weights[2] = 1;
        vm.prank(payer);
        splitter.pay(SALE, 1_000_001, dataOwner, list, weights);

        uint256 paidOut = usdc.balanceOf(zeno) + usdc.balanceOf(dataOwner) + usdc.balanceOf(c1)
            + usdc.balanceOf(c2) + usdc.balanceOf(c3);
        assertEq(paidOut, 1_000_001);
        assertEq(usdc.balanceOf(c1), usdc.balanceOf(c3));
        assertEq(usdc.balanceOf(dataOwner), 300_000);
        assertGe(usdc.balanceOf(zeno), 500_000);
    }

    function testFuzz_Pay_AlwaysPaysExactlyAmount(uint64 amount, uint8 n) public {
        amount = uint64(bound(amount, 1, 1_000_000 * USDC));
        uint256 count = bound(n, 1, 10);
        address[] memory list = new address[](count);
        uint256[] memory weights = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            list[i] = address(uint160(0x1000 + i));
            weights[i] = i + 1;
        }
        _approve(amount);
        vm.prank(payer);
        splitter.pay(SALE, amount, dataOwner, list, weights);

        uint256 total = usdc.balanceOf(zeno) + usdc.balanceOf(dataOwner);
        for (uint256 i = 0; i < count; i++) total += usdc.balanceOf(list[i]);
        assertEq(total, amount);
        assertEq(usdc.balanceOf(payer), 0);
    }

    // ---------------------------------------------------------------
    // Configuration
    // ---------------------------------------------------------------

    function test_SetSplit_OnlyOwnerAndMustSumTo100Percent() public {
        vm.prank(payer);
        vm.expectRevert(RoyaltySplitter.NotOwner.selector);
        splitter.setSplit(4000, 4000, 2000);

        vm.expectRevert(RoyaltySplitter.InvalidSplit.selector);
        splitter.setSplit(5000, 3000, 1999);

        splitter.setSplit(4000, 4000, 2000);
        _approve(1 * USDC);
        vm.prank(payer);
        splitter.pay(SALE, 1 * USDC, dataOwner, _one(c1), _w(1));
        assertEq(usdc.balanceOf(zeno), 400_000);
        assertEq(usdc.balanceOf(dataOwner), 400_000);
    }

    function test_SetZeno_OnlyOwnerAndNonZero() public {
        vm.prank(payer);
        vm.expectRevert(RoyaltySplitter.NotOwner.selector);
        splitter.setZeno(payer);
        vm.expectRevert(RoyaltySplitter.ZeroAddress.selector);
        splitter.setZeno(address(0));
    }

    function test_Constructor_Rejects() public {
        vm.expectRevert(RoyaltySplitter.ZeroAddress.selector);
        new RoyaltySplitter(address(0), zeno, address(usdc));
        vm.expectRevert(RoyaltySplitter.TokenNotContract.selector);
        new RoyaltySplitter(owner, zeno, address(0xDEAD));
    }

    // ---------------------------------------------------------------
    // Refusals
    // ---------------------------------------------------------------

    function test_Pay_SaleCanOnlyBePaidOnce() public {
        _approve(2 * USDC);
        vm.startPrank(payer);
        splitter.pay(SALE, 1 * USDC, dataOwner, _one(c1), _w(1));
        vm.expectRevert(RoyaltySplitter.AlreadyPaid.selector);
        splitter.pay(SALE, 1 * USDC, dataOwner, _one(c1), _w(1));
        vm.stopPrank();
    }

    function test_Pay_RejectsBadInputs() public {
        _approve(1 * USDC);
        vm.startPrank(payer);
        vm.expectRevert(RoyaltySplitter.ZeroAmount.selector);
        splitter.pay(SALE, 0, dataOwner, _one(c1), _w(1));
        vm.expectRevert(RoyaltySplitter.ZeroAddress.selector);
        splitter.pay(SALE, 1 * USDC, address(0), _one(c1), _w(1));
        vm.expectRevert(RoyaltySplitter.NoContributors.selector);
        splitter.pay(SALE, 1 * USDC, dataOwner, new address[](0), new uint256[](0));
        vm.expectRevert(RoyaltySplitter.LengthMismatch.selector);
        splitter.pay(SALE, 1 * USDC, dataOwner, _one(c1), new uint256[](2));
        vm.expectRevert(RoyaltySplitter.ZeroWeight.selector);
        splitter.pay(SALE, 1 * USDC, dataOwner, _one(c1), _w(0));
        vm.expectRevert(RoyaltySplitter.ZeroAddress.selector);
        splitter.pay(SALE, 1 * USDC, dataOwner, _one(address(0)), _w(1));
        vm.stopPrank();
        assertEq(usdc.balanceOf(payer), 1 * USDC); // nothing moved
    }

    function test_Pay_RejectsTooManyContributors() public {
        _approve(1 * USDC);
        address[] memory list = new address[](101);
        uint256[] memory weights = new uint256[](101);
        vm.prank(payer);
        vm.expectRevert(RoyaltySplitter.TooManyContributors.selector);
        splitter.pay(SALE, 1 * USDC, dataOwner, list, weights);
    }

    function test_Pay_RevertsWithoutApprovalAndNothingMoves() public {
        usdc.mint(payer, 1 * USDC);
        vm.prank(payer);
        vm.expectRevert(RoyaltySplitter.TransferFailed.selector);
        splitter.pay(SALE, 1 * USDC, dataOwner, _one(c1), _w(1));
        assertEq(usdc.balanceOf(payer), 1 * USDC);
        assertFalse(splitter.paid(SALE));
    }

    function test_Pay_RevertsWhenTokenReturnsFalse() public {
        _approve(1 * USDC);
        usdc.setReturnFalse(true);
        vm.prank(payer);
        vm.expectRevert(RoyaltySplitter.TransferFailed.selector);
        splitter.pay(SALE, 1 * USDC, dataOwner, _one(c1), _w(1));
    }

    function test_Quote_MatchesPay() public view {
        uint256[] memory weights = new uint256[](2);
        weights[0] = 1;
        weights[1] = 3;
        (uint256 z, uint256 d, uint256 c, uint256[] memory each) = splitter.quote(4 * USDC, weights);
        assertEq(z, 2_000_000);
        assertEq(d, 1_200_000);
        assertEq(c, 800_000);
        assertEq(each[0], 200_000);
        assertEq(each[1], 600_000);
    }
}
