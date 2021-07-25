// SPDX-License-Identifier: MIT

pragma solidity 0.8.1;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./SOULToken.sol";

contract democraticElection {
    
    IERC20 private token;
    // Structs, events, and modifiers
    
    // Store refund data
    struct Refund {
        uint soul;
        address symbol;
    }
    
    //Store voting for every candidate
    struct Preference{
        uint soul;
        uint n_votes;
    }
    
    // Data to manage the confirmation
    struct Conditions {
        uint32 quorum;
        uint32 envelopes_casted;
        uint32 envelopes_opened;
    }
    
    event NewMayor(address _candidate, uint _totalSoul, uint _totalVotes);
    event Sayonara(address _escrow, uint _totalSoul);
    event EnvelopeCast(address _voter);
    event EnvelopeOpen(address _voter, uint _soul, address _symbol);
    
    // Someone can vote as long as the quorum is not reached
    modifier canVote() {
        require(voting_condition.envelopes_casted < voting_condition.quorum, "Cannot vote now, voting quorum has been reached");
        _;   
    }
    
    // Envelopes can be opened only after receiving the quorum
    modifier canOpen() {
        require(voting_condition.envelopes_casted == voting_condition.quorum, "Cannot open an envelope, voting quorum not reached yet");
        _;
    }
    
    // The outcome of the confirmation can be computed as soon as all the casted envelopes have been opened
    modifier canCheckOutcome() {
        require(voting_condition.envelopes_opened == voting_condition.quorum, "Cannot check the winner, need to open all the sent envelopes");
        _;
    }
    
    // State attributes
    
    // Initialization variables
    address[] public candidates;
    address public escrow;
    
    // Voting phase variables
    mapping(address => bytes32) envelopes;

    Conditions voting_condition;
    Refund refund;
    Preference preference;

    //Souls associated with the candidates
    mapping(address => Preference) preferenceCandidates;
    
    // Refund phase variables
    mapping(address => Refund) souls;
    address[] voters;

    /// @notice The constructor only initializes internal variables
    /// @param _candidates (address[]) The addresses of the mayor candidates
    /// @param _escrow (address) The address of the escrow account
    /// @param _quorum (uint32) The number of voters required to finalize the confirmation
    constructor(address[] memory _candidates, address _escrow, uint32 _quorum, IERC20 _token) {
        token = _token;
        candidates = _candidates;
        escrow = _escrow;
        voting_condition = Conditions({quorum: _quorum, envelopes_casted: 0, envelopes_opened: 0});
        for (uint i=0; i<candidates.length; i++){
            preference = Preference({soul: 0, n_votes: 0});
            address candidate = candidates[i];
            preferenceCandidates[candidate] = preference;
        }
    }


    /// @notice Store a received voting envelope
    /// @param _envelope The envelope represented as the keccak256 hash of (sigil, symbol, soul) 
    function cast_envelope(bytes32 _envelope) canVote public {
        
        if(envelopes[msg.sender] == 0x0) // => NEW, update on 17/05/2021
            voting_condition.envelopes_casted++;

        envelopes[msg.sender] = _envelope;
        emit EnvelopeCast(msg.sender);
    }
    
    
    /// @notice Open an envelope and store the vote information
    /// @param _sigil (uint) The secret sigil of a voter
    /// @param _symbol (address) The candidate preference
    /// @dev The soul is sent as ERC-20 token 
    /// @dev Need to recompute the hash to validate the envelope previously casted
    function open_envelope(uint _sigil, address _symbol, uint _souls) canOpen public{

        
        require(envelopes[msg.sender] != 0x0, "The sender has not casted any votes");
        
        bytes32 _casted_envelope = envelopes[msg.sender];
        bytes32 _sent_envelope = compute_envelope(_sigil, _symbol, _souls);
    
        require(_casted_envelope == _sent_envelope, "Sent envelope does not correspond to the one casted");
        envelopes[msg.sender] = 0x0; 
        voting_condition.envelopes_opened++;
        
        token.transferFrom(msg.sender, address(this), _souls);
        
        refund = Refund({soul: _souls, symbol: _symbol});
        souls[msg.sender] = refund;
        
        voters.push(msg.sender);
        
        //Choose candidate based on the symbol (i.e. address)
        preferenceCandidates[_symbol].soul = preferenceCandidates[_symbol].soul + _souls;
        
        preferenceCandidates[_symbol].n_votes = preferenceCandidates[_symbol].n_votes + 1;
        
        emit EnvelopeOpen(msg.sender, _souls, _symbol);
    }
    
    
    /// @notice Elect winning mayor. Refund the electors who voted for the losing outcome
    function mayor_or_sayonara() canCheckOutcome public {
        address bestCandidate;
        address winningCandidate;
        uint bestSoulsAmount = 0;
        uint totalSoulsAmount = 0;
        bool isTie = false;
        
        for (uint i=0; i < candidates.length; i++){
            address candidate = candidates[i]; 
            totalSoulsAmount = totalSoulsAmount + preferenceCandidates[candidate].soul;
            if(preferenceCandidates[candidate].soul > bestSoulsAmount){ //candidate i has more souls
                bestCandidate = candidate; 
                bestSoulsAmount = preferenceCandidates[candidate].soul;
            }
            else{
                if(preferenceCandidates[candidate].soul == bestSoulsAmount){ //in case of same amount of souls
                    if(preferenceCandidates[candidate].n_votes > preferenceCandidates[bestCandidate].n_votes){ //check n_votes
                        bestCandidate = candidates[i];
                        isTie = false; //reset isTie flag
                    }
                    else{
                        if(preferenceCandidates[candidate].n_votes == preferenceCandidates[bestCandidate].n_votes){
                            isTie = true; //complete tie (both souls and votes)
                        }
                    }
                }
            }
        }
        
        
        if(!isTie){
            //Candidate with the higher amount of souls has won
            winningCandidate = bestCandidate;
        
            //Refunding losing voters
            for(uint i=0; i < voters.length; i++){
                address voterAddress = (voters[i]);
                if(souls[voterAddress].symbol != winningCandidate){
                    uint refundedSouls = souls[voterAddress].soul;
                    souls[voterAddress].soul = 0;
                    token.transfer(voterAddress, refundedSouls);
                }
                else{
                    token.transfer(winningCandidate, souls[voterAddress].soul);
                }
            }
            emit NewMayor(winningCandidate, preferenceCandidates[winningCandidate].soul, preferenceCandidates[winningCandidate].n_votes);
        }
        else{
            token.transfer(escrow, totalSoulsAmount);
            emit Sayonara(escrow, totalSoulsAmount);
        }
    }
 
 
    /// @notice Compute a voting envelope
    /// @param _sigil (uint) The secret sigil of a voter
    /// @param _symbol (address) The voting preference
    /// @param _soul (uint) The soul associated to the vote
    function compute_envelope(uint _sigil, address _symbol, uint _soul) public pure returns(bytes32) {
        return keccak256(abi.encode(_sigil, _symbol, _soul));
    }
    
}
