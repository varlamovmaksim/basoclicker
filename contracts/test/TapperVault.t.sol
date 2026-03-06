// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "../lib/forge-std/src/Test.sol";
import {TapperVault} from "../src/TapperVault.sol";
import {MockERC20} from "../src/MockERC20.sol";
import {IERC20} from "../dependencies/@openzeppelin-contracts-5.6.0/token/ERC20/IERC20.sol";

contract TapperVaultTest is Test {
    TapperVault public vault;
    MockERC20 public token;

    address public owner;
    address public user1;
    address public user2;
    address public recipient;

    uint256 constant TOKEN_DECIMALS = 6;
    uint256 constant INITIAL_MINT = 1_000_000 * 10 ** TOKEN_DECIMALS;

    event DailyClaimed(address indexed user);
    event Donated(address indexed from, uint256 amount);

    function setUp() public {
        owner = makeAddr("owner");
        user1 = makeAddr("user1");
        user2 = makeAddr("user2");
        recipient = makeAddr("recipient");

        vm.startPrank(owner);
        token = new MockERC20("Mock USDT", "USDT", uint8(TOKEN_DECIMALS));
        token.mint(user1, INITIAL_MINT);
        token.mint(user2, INITIAL_MINT);
        vault = new TapperVault(address(token), owner);
        vm.stopPrank();
    }

    function test_Constructor_SetsTokenAndOwner() public view {
        assertEq(address(vault.TOKEN()), address(token));
        assertEq(vault.owner(), owner);
    }

    function test_Constructor_RevertsWhenTokenZero() public {
        vm.prank(owner);
        vm.expectRevert("TapperVault: token is zero");
        new TapperVault(address(0), owner);
    }

    function test_Receive_AcceptsEth() public {
        vm.deal(user1, 10 ether);
        vm.prank(user1);
        (bool ok,) = address(vault).call{value: 5 ether}("");
        assertTrue(ok);
        assertEq(address(vault).balance, 5 ether);
    }

    function test_Donate_TransfersTokensAndEmits() public {
        uint256 amount = 500_000 * 10 ** TOKEN_DECIMALS; // 0.5 USDT
        vm.startPrank(user1);
        token.approve(address(vault), amount);
        vm.expectEmit(true, true, true, true);
        emit Donated(user1, amount);
        vault.donate(amount);
        vm.stopPrank();
        assertEq(token.balanceOf(address(vault)), amount);
        assertEq(token.balanceOf(user1), INITIAL_MINT - amount);
    }

    function test_Donate_RevertsWhenAmountZero() public {
        vm.prank(user1);
        vm.expectRevert("TapperVault: amount is zero");
        vault.donate(0);
    }

    function test_RecordDaily_EmitsEvent() public {
        vm.prank(user1);
        vm.expectEmit(true, true, true, true);
        emit DailyClaimed(user1);
        vault.recordDaily();
    }

    function test_WithdrawEth_OnlyOwner() public {
        vm.deal(address(vault), 3 ether);
        vm.prank(owner);
        vault.withdrawEth(recipient, 2 ether);
        assertEq(recipient.balance, 2 ether);
        assertEq(address(vault).balance, 1 ether);
    }

    function test_WithdrawEth_RevertsWhenNotOwner() public {
        vm.deal(address(vault), 1 ether);
        vm.prank(user1);
        vm.expectRevert();
        vault.withdrawEth(recipient, 1 ether);
    }

    function test_WithdrawAllEth_ReusesWithdrawEth() public {
        vm.deal(address(vault), 5 ether);
        vm.prank(owner);
        vault.withdrawAllEth(recipient);
        assertEq(recipient.balance, 5 ether);
        assertEq(address(vault).balance, 0);
    }

    function test_WithdrawAllEth_RevertsWhenNoBalance() public {
        vm.prank(owner);
        vm.expectRevert("TapperVault: no ETH balance");
        vault.withdrawAllEth(recipient);
    }

    function test_WithdrawERC20_OnlyOwner() public {
        uint256 amount = 1000 * 10 ** TOKEN_DECIMALS;
        vm.prank(user1);
        token.approve(address(vault), amount);
        vm.prank(user1);
        vault.donate(amount);
        vm.prank(owner);
        vault.withdrawERC20(IERC20(address(token)), recipient, amount);
        assertEq(token.balanceOf(recipient), amount);
        assertEq(token.balanceOf(address(vault)), 0);
    }

    function test_WithdrawERC20_RevertsWhenNotOwner() public {
        vm.prank(user1);
        token.approve(address(vault), 1000);
        vm.prank(user1);
        vault.donate(1000);
        vm.prank(user1);
        vm.expectRevert();
        vault.withdrawERC20(IERC20(address(token)), recipient, 1000);
    }

    function test_WithdrawAllUsdt_ReusesWithdrawERC20() public {
        uint256 amount = 500_000 * 10 ** TOKEN_DECIMALS;
        vm.prank(user1);
        token.approve(address(vault), amount);
        vm.prank(user1);
        vault.donate(amount);
        vm.prank(owner);
        vault.withdrawAllUsdt(recipient);
        assertEq(token.balanceOf(recipient), amount);
        assertEq(token.balanceOf(address(vault)), 0);
    }

    function test_WithdrawAllUsdt_RevertsWhenNoBalance() public {
        vm.prank(owner);
        vm.expectRevert("TapperVault: no token balance");
        vault.withdrawAllUsdt(recipient);
    }

    function test_WithdrawEth_RevertsWhenToZero() public {
        vm.deal(address(vault), 1 ether);
        vm.prank(owner);
        vm.expectRevert("TapperVault: to is zero");
        vault.withdrawEth(address(0), 1 ether);
    }

    function test_WithdrawEth_RevertsWhenAmountZero() public {
        vm.deal(address(vault), 1 ether);
        vm.prank(owner);
        vm.expectRevert("TapperVault: amount is zero");
        vault.withdrawEth(recipient, 0);
    }
}
