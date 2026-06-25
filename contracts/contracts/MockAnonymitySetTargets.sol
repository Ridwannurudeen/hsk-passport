// SPDX-License-Identifier: MIT
pragma solidity >=0.8.23 <0.9.0;

import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";

/// @dev Test-only minimal HSKPassport surface. Lets tests set memberCount to
///      arbitrary values without paying for 10K real Semaphore additions.
contract MockHSKPassport {
    struct CredentialGroup {
        string name;
        uint256 groupId;
        address issuer;
        uint256 memberCount;
        bool active;
        bytes32 schemaHash;
        uint256 validityPeriod;
    }

    mapping(uint256 => CredentialGroup) private _groups;
    bool public verifyResult = true;

    function setGroup(uint256 groupId, uint256 memberCount, bool active) external {
        _groups[groupId] = CredentialGroup({
            name: "mock",
            groupId: groupId,
            issuer: address(0),
            memberCount: memberCount,
            active: active,
            schemaHash: bytes32(0),
            validityPeriod: 0
        });
    }

    function setVerifyResult(bool v) external { verifyResult = v; }

    function credentialGroups(uint256 groupId)
        external
        view
        returns (
            string memory name,
            uint256 id,
            address issuer,
            uint256 memberCount,
            bool active,
            bytes32 schemaHash,
            uint256 validityPeriod
        )
    {
        CredentialGroup memory g = _groups[groupId];
        return (g.name, g.groupId, g.issuer, g.memberCount, g.active, g.schemaHash, g.validityPeriod);
    }

    function verifyCredential(uint256, ISemaphore.SemaphoreProof calldata)
        external
        view
        returns (bool)
    {
        return verifyResult;
    }

    function verifyCredentialWithExpiry(
        uint256,
        ISemaphore.SemaphoreProof calldata,
        uint256
    ) external view returns (bool) {
        return verifyResult;
    }
}

/// @dev Test-only minimal FreshnessRegistry surface.
contract MockFreshnessRegistry {
    mapping(uint256 => uint256) private _leafCount;
    function set(uint256 groupId, uint256 count) external { _leafCount[groupId] = count; }
    function leafCount(uint256 groupId) external view returns (uint256) { return _leafCount[groupId]; }
}

/// @dev Test-only minimal HSKPassportFreshness surface.
contract MockHSKPassportFreshness {
    bool public verifyResult = true;
    error FreshProofRejected();
    function setVerifyResult(bool v) external { verifyResult = v; }
    function previewVerifyFresh(
        uint256,
        uint256,
        uint256,
        uint256,
        uint256,
        uint256[2] calldata,
        uint256[2][2] calldata,
        uint256[2] calldata
    ) external view returns (bool) {
        return verifyResult;
    }
    function verifyFresh(
        uint256,
        uint256,
        uint256,
        uint256,
        uint256,
        uint256[2] calldata,
        uint256[2][2] calldata,
        uint256[2] calldata
    ) external view {
        if (!verifyResult) revert FreshProofRejected();
    }
}
