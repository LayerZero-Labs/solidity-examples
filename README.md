<div align="center">
    <img alt="LayerZero" src="resources/LayerZeroLogo.png"/>
</div>

---

# LayerZero Omnichain Contract Examples

* A formal audit (May 21, 2022) can in /audit folder *

 ### Install & Run tests
```shell
yarn install
npx hardhat test 
```

* The code in the `/contracts` folder demonstrates LayerZero behaviours.
* `NonblockingLzApp` is a great contract to extend. Take a look at how `OmniCounter` overrides `_nonblockingLzReceive` and `_LzReceive` to easily handle messaging. There are also example for `OFT` and `ONFT` which illustrate erc20 and erc721 cross chain functionality.
* Always audit your own code and test extensively on `testnet` before going to mainnet 🙏

> The examples below use two chains, however you could substitute any LayerZero supported chain! 

# OmnichainFungibleToken (OFT)

The `OmnichainFungibleToken` has two varieties of deployments:
 1. `BasedOFT.sol` - The token supply is minted (on deployment) on the `base` chain. Other chains deploy with 0 supply initially. 
 2. `OFT.sol` - At deploy time, any quantity of tokens can be minted, regardless of chain.    

 For the `BasedOFT`, the initial supply will be minted entirely on the `Base Chain` on deployment. All tokens transferred out of the `base` chain will be locked in the contract (and minted on destination), and tokens transferred out of `other` chains will be burned on that chain. Tokens returning to the `base` chain will be `unlocked` and transferred to the destination address. This results in the `Base chain` being like the home base, hence the name.

In the example deployment below we use `BasedOFT` and the `base` chain is ```rinkeby```.
This setting is configured in ```constants/oftBaseChain.json```.
The `OmnichainFungibleToken` deployed on other chains will use this configuration to set their `base` chain.
Using the Ethereum network ```(testnet: rinkeby)``` as a `base` (really its like the source of truth) is a security decision.
In the event a chain goes rogue, Ethereum will be the final source of truth for OFT tokens.

## Deploy Setup
1. Add a .env file (to the root project directory) with your MNEMONIC="" and fund your wallet in order to deploy!
2. Follow any of the tutorials below

## BasedOFT20.sol - an omnichain ERC20

> WARNING: **You must perform the setTrustedRemote() (step 2).**

1. Deploy two contracts:  ```rinkeby``` is the `base` chain. Fuji is the oft for the other chain.
```angular2html
npx hardhat --network rinkeby deploy --tags ExampleBasedOFT20
npx hardhat --network fuji deploy --tags ExampleOFT20
```
2. Set the "trusted remotes" (ie: your contracts) so each of them can receive messages from one another, and `only` one another.
```angular2html
npx hardhat --network rinkeby setTrustedRemote --target-network fuji
npx hardhat --network fuji setTrustedRemote --target-network rinkeby
```
3. Send tokens from rinkeby to fuji
```angular2html
npx hardhat --network rinkeby oftSend --target-network fuji --qty 42
```
 Pro-tip: Check the ERC20 transactions tab of the destination chain block explorer and await your tokens!

# OmnichainNonFungibleToken721 (ONFT721)

This ONFT contract allows minting of `nftId`s on separate chains. To ensure two chains can not mint the same `nfId` each contract on each chain is only allowed to mint`nftIds` in certain ranges.
Check `constants/onftArgs.json` for the specific test configuration used in this demo.
## UniversalONFT.sol 

> WARNING: **You must perform the setTrustedRemote() (step 2).**

1. Deploy two contracts:
```angular2html
 npx hardhat --network bsc-testnet deploy --tags ExampleUniversalONFT721
 npx hardhat --network fuji deploy --tags ExampleUniversalONFT721
```
2. Set the "trusted remotes", so each contract can send & receive messages from one another, and `only` one another.
```angular2html
 npx hardhat --network bsc-testnet onftSetTrustedRemote --target-network fuji
 npx hardhat --network fuji onftSetTrustedRemote --target-network bsc-testnet
```
3. Mint an NFT on each chain!
```angular2html
 npx hardhat --network bsc-testnet onftMint
 npx hardhat --network fuji onftMint
```
4. [Optional] Show the token owner(s)
```angular2html
 npx hardhat --network bsc-testnet onftOwnerOf --token-id 1
 npx hardhat --network fuji onftOwnerOf --token-id 11
```
5. Send ONFT across chains
```angular2html
npx hardhat --network bsc-testnet onftSend --target-network fuji --token-id 1
```
6. Verify your token no longer exists on the source chain & wait for it to reach the destination side.
```angular2html
 npx hardhat --network bsc-testnet onftOwnerOf --token-id 1
 npx hardhat --network fuji onftOwnerOf --token-id 1
```


# OmniCounter.sol

OmniCounter is a simple contract with a counter. You can only *remotely* increment the counter!

1. Deploy both OmniCounters:

```
npx hardhat --network bsc-testnet deploy --tags OmniCounter
npx hardhat --network fuji deploy --tags OmniCounter
````

2. Set the remote addresses, so each contract can receive messages
```angular2html
npx hardhat --network bsc-testnet ocSetTrustedRemote --target-network fuji
npx hardhat --network fuji ocSetTrustedRemote --target-network bsc-testnet
```
3. Send a cross chain message from `bsc-testnet` to `fuji` !
```angular2html
npx hardhat --network bsc-testnet ocIncrementCounter --target-network fuji
```

Optionally use this command in a separate terminal to watch the counter increment in real-time.
```
npx hardhat --network fuji ocPoll    
```

# Check your setTrustedRemote's are wired up correctly
Just use our checkWireUpAll task by running the following command with the correct Contract parameter
```angular2html
npx hardhat checkWireUpAll --e testnet --contract OmniCounter
```

### See some examples in `/contracts`  🙌

Many of the example contracts make use of LayerZeroEndpointMock.sol which is a nice way to test LayerZero locally!

### For further reading, and a list of endpoint ids and deployed LayerZero contract addresses please take a look at the Gitbook here: https://layerzero.gitbook.io/

## Most recently tested with node version `16.13.1` 

