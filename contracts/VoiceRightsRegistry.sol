// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal registry for the voice-rights demo.
/// @dev Audio, scripts and review material stay off-chain. Only identifiers,
///      hashes and signed decisions belong on the shared record layer.
contract VoiceRightsRegistry {
    enum AuthorizationStatus { Active, Revoked }
    enum ReviewStatus { Approved, Rejected }

    struct Authorization {
        bytes32 authorizationId;
        bytes32 projectId;
        bytes32 scriptVersion;
        bytes32 usageHash;
        address voiceActor;
        uint64 validUntil;
        AuthorizationStatus status;
    }

    struct Review {
        bytes32 receiptId;
        bytes32 authorizationId;
        bytes32 submissionId;
        bytes32 fileHash;
        address reviewer;
        ReviewStatus status;
        uint64 decidedAt;
    }

    mapping(bytes32 => Authorization) public authorizations;
    mapping(bytes32 => Review) public reviews;
    mapping(address => bool) public reviewers;

    event ReviewerSet(address indexed reviewer, bool allowed);
    event AuthorizationRegistered(bytes32 indexed authorizationId, bytes32 indexed projectId, bytes32 scriptVersion, address indexed voiceActor);
    event AuthorizationRevoked(bytes32 indexed authorizationId);
    event ReviewRecorded(bytes32 indexed receiptId, bytes32 indexed authorizationId, bytes32 indexed fileHash, ReviewStatus status, address reviewer);

    modifier onlyReviewer() {
        require(reviewers[msg.sender], "reviewer not allowed");
        _;
    }

    constructor(address initialReviewer) {
        reviewers[initialReviewer] = true;
        emit ReviewerSet(initialReviewer, true);
    }

    function setReviewer(address reviewer, bool allowed) external {
        // Production deployment should replace this with an administrator role.
        reviewers[reviewer] = allowed;
        emit ReviewerSet(reviewer, allowed);
    }

    function registerAuthorization(
        bytes32 authorizationId,
        bytes32 projectId,
        bytes32 scriptVersion,
        bytes32 usageHash,
        uint64 validUntil
    ) external {
        require(authorizations[authorizationId].voiceActor == address(0), "authorization exists");
        require(validUntil >= block.timestamp, "authorization expired");
        authorizations[authorizationId] = Authorization({
            authorizationId: authorizationId,
            projectId: projectId,
            scriptVersion: scriptVersion,
            usageHash: usageHash,
            voiceActor: msg.sender,
            validUntil: validUntil,
            status: AuthorizationStatus.Active
        });
        emit AuthorizationRegistered(authorizationId, projectId, scriptVersion, msg.sender);
    }

    function revokeAuthorization(bytes32 authorizationId) external {
        Authorization storage authorization = authorizations[authorizationId];
        require(authorization.voiceActor == msg.sender, "only voice actor");
        authorization.status = AuthorizationStatus.Revoked;
        emit AuthorizationRevoked(authorizationId);
    }

    function recordReview(
        bytes32 receiptId,
        bytes32 authorizationId,
        bytes32 submissionId,
        bytes32 fileHash,
        ReviewStatus status
    ) external onlyReviewer {
        Authorization memory authorization = authorizations[authorizationId];
        require(authorization.voiceActor != address(0), "authorization missing");
        require(authorization.status == AuthorizationStatus.Active, "authorization inactive");
        require(authorization.validUntil >= block.timestamp, "authorization expired");
        require(reviews[receiptId].receiptId == bytes32(0), "receipt exists");
        reviews[receiptId] = Review({
            receiptId: receiptId,
            authorizationId: authorizationId,
            submissionId: submissionId,
            fileHash: fileHash,
            reviewer: msg.sender,
            status: status,
            decidedAt: uint64(block.timestamp)
        });
        emit ReviewRecorded(receiptId, authorizationId, fileHash, status, msg.sender);
    }
}
