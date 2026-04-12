// SPDX-License-Identifier: MIT
pragma solidity >=0.8.23 <0.9.0;

import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

/// @title HSKPassportTimelock — 48-hour timelock for protocol parameter changes
/// @notice All owner-gated parameter changes (setValidityPeriod, setStakeRequirements,
///         approveIssuer, etc.) go through this timelock.
///         Proposer: Gnosis Safe (3-of-5).
///         Executor: anyone can execute after delay.
///         Admin: initially deployer, transferred to Safe after verification.
/// @dev Standard OpenZeppelin TimelockController with 48h delay.
///      After setup, protocol contract ownerships are transferred to this timelock.
///      To change a parameter:
///        1. Safe creates proposal → schedule(...)
///        2. Wait 48h
///        3. Anyone calls execute(...)
contract HSKPassportTimelock is TimelockController {
    uint256 public constant MIN_DELAY = 48 hours;

    /// @param proposers Addresses that can propose changes (e.g., Gnosis Safe)
    /// @param executors Addresses that can execute scheduled changes (address(0) = anyone)
    /// @param admin Initial admin (typically deployer, transferred to Safe later)
    constructor(
        address[] memory proposers,
        address[] memory executors,
        address admin
    ) TimelockController(MIN_DELAY, proposers, executors, admin) {}
}
