const shell = require("shelljs")
const environments = require("../constants/environments.json")
const { getDeploymentAddresses } = require("../utils/readStatic")

let trustedRemoteTable = {}
let trustedRemoteChecks = {}
const MAX_TRYS = 10

function TrustedRemoteTestnet() {
    this.goerli
    this.sepolia
    this.bscTestnet
    this.fuji
    this.mumbai
    this.arbitrumGoerli
    this.optimismGoerli
    this.fantomTestnet
}

function TrustedRemote() {
    this.ethereum
    this.bsc
    this.avalanche
    this.polygon
    this.arbitrum
    this.optimism
    this.fantom
}

function isJsonString(str) {
    try {
        JSON.parse(str)
    } catch (e) {
        return false
    }
    return true
}

module.exports = async function (taskArgs) {
    const networks = environments[taskArgs.e]
    if (!taskArgs.e || networks.length === 0) {
        console.log(`Invalid environment argument: ${taskArgs.e}`)
    }
    // loop through all networks and fill up trustedRemoteTable
    await Promise.all(
        networks.map(async (network) => {
            let result
            let resultParsed
            let trys = 0
            while (true) {
                let checkWireUpCommand
                if (network === taskArgs.proxyChain) {
                    checkWireUpCommand = `npx hardhat --network ${network} checkWireUp --e ${taskArgs.e} --contract ${taskArgs.proxyContract}`
                } else {
                    checkWireUpCommand = `npx hardhat --network ${network} checkWireUp --e ${taskArgs.e} --contract ${taskArgs.contract}`
                }

                console.log("checkWireUp: " + checkWireUpCommand)
                // remove spaces and new lines from stdout
                result = shell.exec(checkWireUpCommand).stdout.replace(/(\r\n|\n|\r|\s)/gm, "")
                // remove extra words before JSON object, so it can be parsed correctly
                result = result.substring(result.indexOf("{"))
                // make sure it is JSON otherwise the network does not have this contract deployed
                if (!isJsonString(result)) {
                    trustedRemoteTable[network] = new TrustedRemote()
                    break
                }
                // parse result into JSON object
                resultParsed = JSON.parse(result)
                // make sure all chain ids are set if so we break
                if (Object.keys(resultParsed).length === networks.length) {
                    break
                }
                // we will retry a max of 10 times otherwise we throw an error to stop infinite while loop
                else if (trys === MAX_TRYS) {
                    throw new Error(`Retired the max amount of times for ${network}`)
                }
                // sometimes the returned JSON is missing chains so retry until they are all set properly
                else {
                    ++trys
                    console.log(`On retry:${trys} for ${network}`)
                }
            }
            trustedRemoteTable[network] = taskArgs.e === "mainnet" ? new TrustedRemote() : new TrustedRemoteTestnet()
            // assign new passed object to the trustedRemoteTable[network]
            Object.assign(trustedRemoteTable[network], resultParsed)
            // if trustedRemoteTable[network] is not empty then set trustedRemoteChecks[network]
            if (Object.keys(trustedRemoteTable[network]).length > 0) {
                trustedRemoteChecks[network] = taskArgs.e === "mainnet" ? new TrustedRemote() : new TrustedRemoteTestnet()
            }
        })
    )

    // use filled trustedRemoteTable to make trustedRemoteChecks
    const environmentArray = environments[taskArgs.e]
    for (let i = 0; i < environmentArray.length; i++) {
        if (trustedRemoteTable[environmentArray[i]] === undefined) continue
        const envToCamelCase = environmentArray[i].replace(/-./g, (m) => m[1].toUpperCase())
        let actualRemoteAddress = getDeployedAddress(environmentArray[i], taskArgs.proxyChain, taskArgs.contract, taskArgs.proxyContract)
        if (actualRemoteAddress === undefined) continue
        for (let j = 0; j < environmentArray.length; j++) {
            if (trustedRemoteTable[environmentArray[j]] === undefined) continue
            let actualLocalAddress = getDeployedAddress(environmentArray[j], taskArgs.proxyChain, taskArgs.contract, taskArgs.proxyContract)
            if (actualLocalAddress !== undefined) {
                const currentlySetTrustedRemote = trustedRemoteTable[environmentArray[j]][envToCamelCase]
                let actualSetTrustedRemote = actualRemoteAddress + actualLocalAddress.substring(2)
                console.log(
                    `${environmentArray[j]}'s currentSetRemoteAddress for ${environmentArray[i]}: ${currentlySetTrustedRemote} ${
                        JSON.stringify(actualSetTrustedRemote) === JSON.stringify(currentlySetTrustedRemote) ? "✅ " : "❌ "
                    }`
                )
                if (JSON.stringify(actualSetTrustedRemote) === JSON.stringify(currentlySetTrustedRemote)) {
                    if (environmentArray[i] === environmentArray[j]) {
                        trustedRemoteChecks[environmentArray[j]][environmentArray[i]] = ""
                    } else {
                        trustedRemoteChecks[environmentArray[j]][environmentArray[i]] = "🟩"
                    }
                } else if (JSON.stringify(actualSetTrustedRemote) !== JSON.stringify(currentlySetTrustedRemote)) {
                    trustedRemoteChecks[environmentArray[j]][environmentArray[i]] = "🟥"
                }
            }
        }
    }
    console.log("Legend")
    console.log("Set: 🟩")
    console.log("Not Set: 🟥")
    console.table(trustedRemoteChecks)

    //print addresses
    let getAddressesCommand
    if (taskArgs.proxyChain !== undefined) {
        getAddressesCommand = `node utils/getAddresses ${taskArgs.e} ${taskArgs.proxyContract},${taskArgs.contract}`
    } else {
        getAddressesCommand = `node utils/getAddresses ${taskArgs.e} ${taskArgs.contract}`
    }
    console.log("getAddressesCommand: " + getAddressesCommand)
    shell.exec(getAddressesCommand)
}

function getDeployedAddress(chain, proxyChain, contract, proxyContract) {
    let deployedAddress
    try {
        if (chain === proxyChain) {
            deployedAddress = getDeploymentAddresses(chain)[proxyContract].toLowerCase()
        } else {
            deployedAddress = getDeploymentAddresses(chain)[contract].toLowerCase()
        }
    } catch {
        deployedAddress = undefined
    }
    return deployedAddress
}
