//Luca Santarella - P2P Systems and Blockchains - 29/06/2021

App = {
	contracts: {},
	web3Provider: null,
	accounts: [], //array of accounts from ganache (only address)
	privateKeys: {}, //dictionary containing accounts from ganache {key: account , value: privateKey}
	voters: [], 
	castedVotes: {}, //dictionary containing voters and their casted votes {key: account voter , value: {castedVote}}
	candidates: [],
	candidatesName: [],
	isDeployed: false,
	nVoters: -1,
	votersInfo: [],
	soulInstance: null,
	electionInstance: null,
	soulInstanceAddr: 0x0,
	electionInstanceAddr: 0x0,
	initialSupplySouls: 100,
	nCandidates: 0,
	

	init: function() { return App.initWeb3(); },

	initWeb3: function(){ 
		/* initialize Web3 */ 
		if(typeof web3 != 'undefined') { //check whether exists a provider, e.g. Metamask
			App.web3Provider = window.ethereum; //standard since 2/11/18
			web3 = new Web3(App.web3Provider);
			$.getJSON('keys.json').done(function(accKeys) {
				App.privateKeys = accKeys.private_keys; //get private_keys field of keys.json
				App.accounts = Object.keys(App.privateKeys);
				
				deployerAccount = App.accounts[0];
				deployerKeys = App.privateKeys[deployerAccount];
				alert("Please import this key and connect with Metamask (deployer/escrow account): "+deployerKeys);
				$('#initialAction').html("Deployer/Escrow private keys:<br>"+deployerKeys);
			});
			
			$('#linkBtn').on('click', function(){
				App.nVoters = parseInt($("#nVoters").val());
				App.nCandidates = parseInt($("#nCandidates").val());
				
				if(App.nVoters < 2 || isNaN(App.nCandidates)){
					alert("Please enter the number of voters and candidates.");
					return;
				}
				if(!App.isDeployed){ //check if the Dapp has already started
					if(App.voters.length == 0){ //check if the array voters has not been initialized already
						for(let i=App.nCandidates+1; i<App.nVoters+App.nCandidates+1;i++)
							App.voters.push(App.accounts[i]);
					}
					console.log(App.voters);
					try { //Permission popup
						
						ethereum.enable().then(async() => {
							console.log("Dapp connected "); 
							return App.initSOULContract();
						});
					}
					catch(error) {console.log(error); }
					
				}
				else
					alert("Contract has been already deployed, please refresh the page to restart the Dapp");
			});
		}
	},
	
	initSOULContract: function(){
		$('#initialAction').css("display","none");
		console.log("init SOUL contract");
		
		$.getJSON('SOULToken.json').done(function(soulContract) {
			
			App.contracts["SOULToken"] = TruffleContract(soulContract);
			App.contracts["SOULToken"].setProvider(App.web3Provider);
			
			var totalSupply = new web3.utils.BN('100000000000000000000'); //fixed amount of 100 souls
			alert("The smart contract for the ERC-20 token will be deployed and the voters will be funded, please confirm the two transactions with Metamask");
			console.log(App.voters);
			
			App.contracts["SOULToken"].new(totalSupply, {from: App.accounts[0]}).then(async (instance) => { //creating new instance of SOULToken
				App.isDeployed = true;
				App.soulInstanceAddr = instance.address;
				App.soulInstance = instance;
				
				instance.fundVoters(App.voters, {from: App.accounts[0]}).catch(function(error){
					console.log(error);
				});
				
				instance.votersFunded().on('data', function (event) {
					console.log("Voters have been funded");
					alert("Voters have now been funded "+Math.floor(App.initialSupplySouls/App.voters.length)+" souls each.");
					return App.initAddresses();
				});
			}
			).catch(function(error){
				if(error.code == 4001)
					alert("Please accept the transaction to deploy the contract");
				else
					alert("Please use the deployer account");
				
			});
		});
	},
	
	initAddresses: function(){
		var quorum = web3.utils.toBN($("#nVoters").val()); //quorum is a BigNumber since this type is needed from the function
		var candidatesInfo = ""; 
		var symbolSelect = $("#symbol");
		var balance = Math.floor(App.initialSupplySouls/App.voters.length); //balance of every voter is fixed
		var idx = 1;
		var votersInfoStr = "";
		
		for(let i=App.nCandidates+1; i<App.nVoters+(App.nCandidates)+1;i++){
			App.votersInfo.push("<b>Voter "+idx+" address:</b> "+App.accounts[i]+"<br><b>Key:</b> "+App.privateKeys[App.accounts[i]]+" <br><b>SOUL balance:</b> "+balance+"<br><br>");
			votersInfoStr = votersInfoStr + App.votersInfo[(idx-1)];
			idx++;
		}
		
		App.candidatesName = ["Satoshi", "FuzzyMan", "Vitalik", "Bit", "Michael", "Jim", "Pam", "Dwight"];
		for(let i=0;i<(App.nCandidates);i++){
			App.candidates.push(App.accounts[i]);
			
			candidatesInfo = candidatesInfo + "<b>"+App.candidatesName[(i%8)]+"'s address:</b> "+App.accounts[i]+"<br>";
			symbolSelect.append($("<option />").val(App.accounts[i]).text(App.candidatesName[(i%8)])); //append to the select tag the options for the candidates
		}
		
		//make voters and candidates visible to the user
		$("#votersTitle").html("Voters");
		$("#votersList").html(votersInfoStr);
		
		$("#candidatesTitle").html("Candidates");
		$("#candidatesList").html(candidatesInfo);
		
		return App.initElectionContract(quorum);
	},
	
	initElectionContract: async function(quorum){
		$.getJSON('democraticElection.json').done(function(electionContract) {
			App.contracts["democraticElection"] = TruffleContract(electionContract);
			App.contracts["democraticElection"].setProvider(App.web3Provider);
				
			alert("The smart contract for the election will be deployed, please confirm the transaction with Metamask");
			App.contracts["democraticElection"].new(App.candidates, App.accounts[0], quorum, App.soulInstanceAddr, {from: App.accounts[0]}).then(async (instance) => {
				App.electionInstance = instance;
				App.electionInstanceAddr = instance.address;
				$("#initUI").css("display", "none");
				$("#mainUI").css("display", "block");
				var i = 0;
				$('#currentAction').html("Compute vote with account of voter "+(i+1));
				alert("Please import private key for voter "+(i+1));
				return App.computeAndCast(i);
			});
		});
	},
	
	computeAndCast: function(idxVoter){
		$('#computeBtn').on('click', function(){
			var initialBalance = web3.utils.toBN(Math.floor(App.initialSupplySouls/App.voters.length)); //expressed in soul
			var smolUnit = new web3.utils.BN('1000000000000000000'); //smolsoul is similar to wei in Ethereum
			var smolInitialBalance = initialBalance.mul(smolUnit); //converted in smolsoul
			var sigil = new web3.utils.toBN($("#sigil").val());
			var symbol = $("#symbol").val();
			let soulInput = web3.utils.toBN($("#soul").val());
			var unit = web3.utils.toBN($("#unit").val());
			var soul = soulInput.mul(unit); //actual quantity expressed in smolsoul
			
			if(smolInitialBalance.lt(soul)){ //less than in BigNumbers
				alert("You do not have enough souls, please enter a valid amount");
				$('#computeBtn').off("click"); //destroy event listener
				App.computeAndCast(idxVoter); //"restart" the function
				return;
			}
			
			console.log("soul in input is: "+soul.toString());
			
			App.electionInstance.compute_envelope(sigil, symbol, soul, {from: App.voters[idxVoter]}).then((envelope) => {
				$("#computeForm").css("display","none");
				$("#envelope").val(envelope); //already filling the input with envelope value
				$("#castForm").css("display","block");
				$('#currentAction').html("Cast vote with account of voter "+(idxVoter+1));
				
				$("#castBtn").on("click", function(){
					var envelope_form = $("#envelope").val();
					console.log("Voter "+(idxVoter+1)+" address: "+App.voters[idxVoter]);
					
					App.electionInstance.cast_envelope(envelope_form, {from: App.voters[idxVoter]}).catch(function(error){
						if(error.code == 4001){
							alert("Please accept the transaction to cast the vote");
						}
						else{
							alert("Wrong account, please use the account of voter "+(idxVoter+1));
						}
						
						$('#castForm').css('display','none');
						$('#computeForm').css('display','block');
						$('#computeBtn').off("click");
						$('#castBtn').off("click");
						App.computeAndCast(idxVoter);
					});
					
					var castedVote = {"sigil": sigil, "symbol": symbol, "soul": soulInput}; //save casted vote to show it later when user needs to open envelope
					App.castedVotes[App.voters[idxVoter]] = castedVote;
					console.log(App.castedVotes[App.voters[idxVoter]].soul.toString());
					
					App.electionInstance.EnvelopeCast().on('data', function (event) {
						
						console.log("Envelope was casted");
						$('#castForm').css('display','none');
						$('#computeForm').css('display','block');
						$('#sigil').val('');
						$('#soul').val('');
						
						$('#computeBtn').off("click");
						$('#castBtn').off("click");
						idxVoter++;
						if(idxVoter < App.voters.length){
							
							alert("Please import private key for voter "+(idxVoter+1));
							$('#currentAction').html("Compute vote with account of voter "+(idxVoter+1));
							App.computeAndCast(idxVoter); //simulate a loop using recursive functions that actually end right away
							return;
						}
						else{ //no more voters time to open the envelopes
							var i = 0;
							$('#computeBtn').html('Open Envelope');
							return App.openEnvelope(i);
						}
					});
				});
			});
		});
	},
	
	openEnvelope: function(idxVoter){
		
		var castedSigil = App.castedVotes[App.voters[idxVoter]].sigil;
		var castedSymbol = App.castedVotes[App.voters[idxVoter]].symbol;
		var castedSoul = App.castedVotes[App.voters[idxVoter]].soul;
		
		$("#sigil").val(castedSigil.toString());
		$("#symbol").val(castedSymbol.toString());
		$("#soul").val(castedSoul.toString());
		
		alert("Please select the account of voter "+(idxVoter+1)+" to open the envelope");
		$('#currentAction').html("Open the envelope with account of voter "+(idxVoter+1));
		
		$("#computeBtn").on("click", function(){
			var sigil = web3.utils.toBN($("#sigil").val());
			var symbol = $("#symbol").val();
			var soul = web3.utils.toBN($("#soul").val());
			var unit = web3.utils.toBN($("#unit").val());
			
			soul = soul.mul(unit); //SOUL token expressed in smolsoul (1-e18 soul)
			var smolUnit = new web3.utils.BN('1000000000000000000');
			convertedSoul = soul.div(smolUnit); //SOUL token is expressed in soul
			
			App.soulInstance.approve(App.electionInstanceAddr, soul, {from: App.voters[idxVoter]}).then(() => {
				
				App.electionInstance.open_envelope(sigil, symbol, soul, {from: App.voters[idxVoter]});
				
				App.electionInstance.EnvelopeOpen().on('data', function (event) {
					var idx = 1;
					var initialBalance = web3.utils.toBN(Math.floor(App.initialSupplySouls/App.voters.length));
					var currentBalance = initialBalance.sub(convertedSoul); //currentBalance is displayed in soul unit
					var votersInfoStr = "";
					
					//refresh the balance of the voter
					for(let i=App.nCandidates+1; i<App.nVoters+App.nCandidates+1;i++){
						if(App.voters[(idx-1)] == App.voters[idxVoter]) //if it is current voter
							App.votersInfo[(idx-1)] = "<b>Voter "+idx+" address:</b> "+App.accounts[i]+"<br><b>Key:</b> "+App.privateKeys[App.accounts[i]]+" <br><b>SOUL balance:</b> "+currentBalance.toString()+"<br><br>";
						votersInfoStr = votersInfoStr + App.votersInfo[(idx-1)];
						idx++;
					}
					$("#votersList").html(votersInfoStr);
					console.log("Envelope was opened");
					$('#sigil').val('');
					$('#soul').val('');
					$('#computeBtn').off("click");
					idxVoter++;
					if(idxVoter < App.voters.length){ 
						App.openEnvelope(idxVoter); //the next voter will open the envelope
						return;
					}
					else{
						$("#computeForm").css("display","none");
						$('#currentAction').css("display","none");
						$("#whoIsMayor").css("display","block");
						return App.mayorOrSayonara();
					}
				});
			});
		});
	},
	
	mayorOrSayonara: function(){
		$("#instructions").css("display","none");
		alert("Please use the account of the deployer/escrow to elect the new mayor.");
		var winnerCandidate = "";
		var idx = -1;
		
		App.electionInstance.NewMayor().on('data', function (event) {
			console.log("We have a new mayor!");
			console.log(event);
			var winner = event.args._candidate;
			
			for(i=0; i<App.nCandidates; i++){
				if(App.candidates[i].toLowerCase() === winner.toLowerCase())
					idx = i;
			}
			
			winnerCandidate = App.candidatesName[(idx%8)];
			
			console.log(winnerCandidate);
			var totalSoul = event.args._totalSoul;
			var totalVotes = event.args._totalVotes;
			$("#displayOutcome").html("WINNER WINNER MAYOR DINNER");
			$("#displayMayor").html(winnerCandidate+": "+winner.substr(0,5)+"..."+winner.substr(-5)+" is the new mayor with "+totalSoul.toString()+" smolsoul and "+totalVotes+" votes.");
		});
		
		App.electionInstance.Sayonara().on('data', function (event) {
			var totalSoul = event.args._totalSoul;
			console.log("Sayonara");
			console.log(event);
			var escrow = event.args._escrow;
			$("#displayOutcome").html("Sayonara!");
			$("#displayMayor").html("The mayor you are looking for is in an other castle.<br>There has been a tie, a total of "
			+totalSoul.toString()+" smolsoul will be sent to the escrow "+escrow.substr(0,5)+"..."+escrow.substr(-5));
		});
		
		$("#mayorBtn").on("click", function(){
			App.electionInstance.mayor_or_sayonara({from: App.accounts[0]}).then((result) => {
				console.log(result);
				$("#mayorBtn").css("display","none");
			}).catch(function(error){
				if(error.code == 4001)
					alert("Please accept the transaction to cast the vote");
				else
					alert("Wrong account!");
				$("#mayorBtn").off("click");
				App.mayorOrSayonara();
				return;
			});
				
		});
				
	}
}

//Call init whenever the window loads
$(function() {
	$(window).on('load', function () {
		App.init();
	});
});
