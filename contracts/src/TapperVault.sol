// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "../dependencies/@openzeppelin-contracts-5.6.0/access/Ownable.sol";
import {IERC20} from "../dependencies/@openzeppelin-contracts-5.6.0/token/ERC20/IERC20.sol";
import {SafeERC20} from "../dependencies/@openzeppelin-contracts-5.6.0/token/ERC20/utils/SafeERC20.sol";

/**
 * @title TapperVault
 * @dev Ownable vault contract that can receive ETH and a specific ERC20 token.
 * - Accepts arbitrary ETH transfers via receive().
 * - Accepts ERC20 transfers via donate() (transferFrom) or direct token.transfer.
 * - Owner can withdraw ETH or any ERC20.
 * - Exposes recordDaily() for daily score claims (emits an event only).
 */
contract TapperVault is Ownable {
    using SafeERC20 for IERC20;
    /// @dev ERC20 token that this vault primarily accepts for donations.
    IERC20 public immutable TOKEN;

    /// @dev Emitted when a user records their daily action.
    event DailyClaimed(address indexed user);

    /// @dev Emitted when a user donates tokens to the vault.
    event Donated(address indexed from, uint256 amount);

    /**
     * @param token_ Address of the ERC20 token used for donations.
     * @param initialOwner Owner address passed to Ownable.
     */
    constructor(address token_, address initialOwner) Ownable(initialOwner) {
        require(token_ != address(0), "TapperVault: token is zero");
        TOKEN = IERC20(token_);
    }

    /// @dev Accept plain ETH transfers.
    receive() external payable {}

    /**
     * @notice Donate `amount` tokens to the vault.
     * @dev Requires prior approval for `amount` tokens.
     */
    function donate(uint256 amount) external {
        require(amount > 0, "TapperVault: amount is zero");
        TOKEN.safeTransferFrom(msg.sender, address(this), amount);
        emit Donated(msg.sender, amount);
    }

    /**
     * @notice Record a daily action to be later verified off-chain.
     * @dev Does not change state except for emitting an event.
     *      Backend verifies tx.sender, selector and contract address.
     */
    function recordDaily() external {
        emit DailyClaimed(msg.sender);
    }

    /**
     * @notice Withdraw ETH from the vault.
     * @param to Recipient address.
     * @param amount Amount of ETH (in wei) to withdraw.
     */
    function withdrawEth(address to, uint256 amount) external onlyOwner {
        _withdrawEth(to, amount);
    }

    /**
     * @notice Withdraw arbitrary ERC20 tokens from the vault.
     * @param erc20 Token to withdraw.
     * @param to Recipient address.
     * @param amount Amount of tokens to withdraw.
     */
    function withdrawERC20(
        IERC20 erc20,
        address to,
        uint256 amount
    ) external onlyOwner {
        _withdrawERC20(erc20, to, amount);
    }

    /**
     * @notice Withdraw all ETH from the vault to the recipient.
     * @param to Recipient address.
     */
    function withdrawAllEth(address to) external onlyOwner {
        require(to != address(0), "TapperVault: to is zero");
        uint256 balance = address(this).balance;
        require(balance > 0, "TapperVault: no ETH balance");
        _withdrawEth(to, balance);
    }

    /**
     * @notice Withdraw all of the vault token (e.g. USDT) to the recipient.
     * @param to Recipient address.
     */
    function withdrawAllUsdt(address to) external onlyOwner {
        require(to != address(0), "TapperVault: to is zero");
        uint256 balance = TOKEN.balanceOf(address(this));
        require(balance > 0, "TapperVault: no token balance");
        _withdrawERC20(TOKEN, to, balance);
    }

    function _withdrawEth(address to, uint256 amount) internal {
        require(to != address(0), "TapperVault: to is zero");
        require(amount > 0, "TapperVault: amount is zero");
        (bool ok, ) = payable(to).call{value: amount}("");
        require(ok, "TapperVault: ETH transfer failed");
    }

    function _withdrawERC20(
        IERC20 erc20,
        address to,
        uint256 amount
    ) internal {
        require(to != address(0), "TapperVault: to is zero");
        require(amount > 0, "TapperVault: amount is zero");
        erc20.safeTransfer(to, amount);
    }
}

